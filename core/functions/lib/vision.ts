/**
 * Vision extraction engine — Kimi vision descriptors + gpt-image-2 reference sheet.
 *
 * Runs inside a Cloudflare Worker with the AI binding.
 * No console.log — use structured diagnostics.
 */

import {
  IDENTITY_EXTRACTION_PROMPT,
  STYLE_EXTRACTION_PROMPT,
  buildReferenceSheetPrompt,
} from "./prompts";
import { getProductWorkspace } from "../generated/products";

// ─── Types ─────────────────────────────────────────────────────────

export interface IdentityExtractionResult {
  description: string;
  modelUsed: "kimi-k2.5" | "openai:gpt-4.1-mini";
  extractionMs: number;
  error?: string;
}

export type StyleExtractionResult = IdentityExtractionResult;

export interface ReferenceSheetResult {
  r2Key: string;
  success: boolean;
  error?: string;
}

interface ExtractionEnv {
  AI: Ai;
  STORAGE: R2Bucket;
  DB: D1Database;
  PRODUCT_ID?: string;
  NICHE?: string;
}

type VisionEnv = {
  AI: Ai;
  PRODUCT_ID?: string;
  NICHE?: string;
};

const KIMI_EXTRACTION_TIMEOUT_MS = 25_000;
const GATEWAY_EXTRACTION_TIMEOUT_MS = 45_000;

// ─── Identity Extraction ───────────────────────────────────────────

/**
 * Run Kimi vision on base64-encoded selfie photos to produce
 * a structured text description of the person's appearance.
 */
export async function extractIdentity(
  env: VisionEnv,
  base64Photos: { base64: string; mediaType: string }[],
): Promise<IdentityExtractionResult> {
  const start = Date.now();

  try {
    const extraction = await extractWithFallback(
      env,
      base64Photos,
      IDENTITY_EXTRACTION_PROMPT,
    );
    const elapsed = Date.now() - start;

    if (!extraction.text || extraction.text.length < 30) {
      return {
        description: "",
        modelUsed: extraction.modelUsed,
        extractionMs: elapsed,
        error: `Empty description from ${extraction.modelUsed}`,
      };
    }

    return {
      description: extraction.text,
      modelUsed: extraction.modelUsed,
      extractionMs: elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      description: "",
      modelUsed: "kimi-k2.5",
      extractionMs: elapsed,
      error: message,
    };
  }
}

export async function extractStyle(
  env: VisionEnv,
  base64Photos: { base64: string; mediaType: string }[],
): Promise<StyleExtractionResult> {
  const start = Date.now();

  try {
    const extraction = await extractWithFallback(
      env,
      base64Photos,
      STYLE_EXTRACTION_PROMPT,
    );
    const elapsed = Date.now() - start;

    if (!extraction.text || extraction.text.length < 30) {
      return {
        description: "",
        modelUsed: extraction.modelUsed,
        extractionMs: elapsed,
        error: `Empty style description from ${extraction.modelUsed}`,
      };
    }

    return {
      description: extraction.text,
      modelUsed: extraction.modelUsed,
      extractionMs: elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      description: "",
      modelUsed: "kimi-k2.5",
      extractionMs: elapsed,
      error: message,
    };
  }
}

async function extractWithFallback(
  env: VisionEnv,
  base64Photos: { base64: string; mediaType: string }[],
  prompt: string,
): Promise<{ text: string; modelUsed: IdentityExtractionResult["modelUsed"] }> {
  try {
    const text = await withTimeout(
      extractWithKimi(env, base64Photos, prompt),
      KIMI_EXTRACTION_TIMEOUT_MS,
      "kimi-k2.5 extraction timed out",
    );
    if (text.length >= 30) {
      return { text, modelUsed: "kimi-k2.5" };
    }
  } catch {
    // Fall through to the Gateway route. The caller records the final model.
  }

  return {
    text: await withTimeout(
      extractWithOpenAiVision(env, base64Photos, prompt),
      GATEWAY_EXTRACTION_TIMEOUT_MS,
      "openai:gpt-4.1-mini extraction timed out",
    ),
    modelUsed: "openai:gpt-4.1-mini",
  };
}

async function extractWithKimi(
  env: VisionEnv,
  base64Photos: { base64: string; mediaType: string }[],
  prompt: string,
): Promise<string> {
  const content = [
    { type: "text" as const, text: prompt },
    ...base64Photos.slice(0, 1).map((p) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${p.mediaType};base64,${p.base64}`,
      },
    })),
  ];

  const response = await env.AI.run("@cf/moonshotai/kimi-k2.5", {
    messages: [{ role: "user", content } as never],
    max_completion_tokens: 700,
    temperature: 0.2,
  });
  return readTextResponse(response);
}

async function extractWithOpenAiVision(
  env: VisionEnv,
  base64Photos: { base64: string; mediaType: string }[],
  prompt: string,
): Promise<string> {
  const gatewayName = getProductWorkspace(
    env.PRODUCT_ID ?? env.NICHE ?? "ig-content",
  ).manifest.gatewayId;
  const content = [
    { type: "text", text: prompt },
    ...base64Photos.slice(0, 2).map((p) => ({
      type: "image_url",
      image_url: {
        url: `data:${p.mediaType};base64,${p.base64}`,
        detail: "low",
      },
    })),
  ];
  const response = await env.AI.gateway(gatewayName).run(
    {
      provider: "openai",
      endpoint: "chat/completions",
      headers: { "Content-Type": "application/json" },
      query: {
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content }],
        max_tokens: 700,
        temperature: 0.2,
      },
    },
    {
      gateway: {
        id: gatewayName,
        requestTimeoutMs: GATEWAY_EXTRACTION_TIMEOUT_MS,
        collectLog: true,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Gateway vision extraction failed: ${response.status}`);
  }

  return readTextResponse(await response.json());
}

// ─── Reference Sheet Generation ────────────────────────────────────

/**
 * Generate a multi-angle portrait reference sheet from the identity description.
 * Uses gpt-image-2 via AI Gateway.
 *
 * Non-critical: if this fails, the identity profile is still usable (text-only).
 */
export async function generateReferenceSheet(
  env: { AI: Ai; STORAGE: R2Bucket; PRODUCT_ID?: string; NICHE?: string },
  identityDescription: string,
  sessionToken: string,
): Promise<ReferenceSheetResult> {
  const prompt = buildReferenceSheetPrompt(identityDescription);

  try {
    const gatewayName = getProductWorkspace(
      env.PRODUCT_ID ?? env.NICHE ?? "ig-content",
    ).manifest.gatewayId;
    const response = await env.AI.run(
      "openai/gpt-image-2",
      {
        prompt,
        quality: "medium",
        size: "1536x1024",
        output_format: "png",
      },
      { gateway: { id: gatewayName } },
    );

    // gpt-image-2 returns base64 in the response
    const imageData = readImageBase64(response);
    if (!imageData) {
      return {
        r2Key: "",
        success: false,
        error: "No image data in gpt-image-2 response",
      };
    }

    const r2Key = `profiles/${sessionToken}/identity-reference.png`;
    const binaryData = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0));
    await env.STORAGE.put(r2Key, binaryData, {
      httpMetadata: { contentType: "image/png" },
    });

    return { r2Key, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { r2Key: "", success: false, error: message };
  }
}

function readTextResponse(response: unknown): string {
  if (typeof response !== "object" || !response) return "";
  const data = response as {
    response?: unknown;
    text?: unknown;
    choices?: { message?: { content?: unknown } }[];
  };
  if (typeof data.response === "string") return data.response;
  if (typeof data.text === "string") return data.text;
  const firstMessage = data.choices?.[0]?.message?.content;
  if (typeof firstMessage === "string") return firstMessage;
  return "";
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function readImageBase64(response: unknown): string {
  if (typeof response !== "object" || !response) return "";
  const data = response as {
    image?: { base64?: unknown };
    data?: { base64?: unknown; b64_json?: unknown }[];
  };
  const direct = data.image?.base64;
  if (typeof direct === "string") return direct;
  const first = data.data?.[0];
  if (typeof first?.base64 === "string") return first.base64;
  if (typeof first?.b64_json === "string") return first.b64_json;
  return "";
}

// ─── Orchestration ─────────────────────────────────────────────────

/**
 * Full identity profile build: extract from photos, write to D1, generate reference sheet.
 */
export async function buildIdentityProfile(
  env: ExtractionEnv,
  sessionToken: string,
): Promise<{ success: boolean }> {
  const { listSelfieObjects, downloadAsBase64 } = await import("./storage");

  // 1. List selfie objects
  const selfieObjects = await listSelfieObjects(sessionToken, env.STORAGE);
  if (selfieObjects.length < 3) {
    return { success: false };
  }

  // 2. Download and convert to base64 (skip oversized)
  const base64Photos: { base64: string; mediaType: string }[] = [];
  for (const obj of selfieObjects) {
    const result = await downloadAsBase64(obj, env.STORAGE);
    if (result) base64Photos.push(result);
  }
  if (base64Photos.length < 3) {
    return { success: false };
  }

  // 3. Run vision extraction
  const extraction = await extractIdentity(env, base64Photos);
  if (!extraction.description) {
    return { success: false };
  }

  // 4. Write text description to D1
  await env.DB.prepare(
    `INSERT INTO identity_profiles (session_token, description, model_used, extraction_ms)
     VALUES (?1, ?2, ?3, ?4)`,
  )
    .bind(
      sessionToken,
      extraction.description,
      extraction.modelUsed,
      extraction.extractionMs,
    )
    .run();

  return { success: true };
}

export async function buildStyleProfile(
  env: ExtractionEnv,
  sessionToken: string,
): Promise<{ success: boolean }> {
  const { listStyleReferenceObjects, downloadAsBase64 } = await import(
    "./storage"
  );

  const styleObjects = await listStyleReferenceObjects(
    sessionToken,
    env.STORAGE,
  );
  if (styleObjects.length < 3) {
    return { success: false };
  }

  const base64Photos: { base64: string; mediaType: string }[] = [];
  for (const obj of styleObjects) {
    const result = await downloadAsBase64(obj, env.STORAGE);
    if (result) base64Photos.push(result);
  }
  if (base64Photos.length < 3) {
    return { success: false };
  }

  const extraction = await extractStyle(env, base64Photos);
  if (!extraction.description) {
    return { success: false };
  }

  await env.DB.prepare(
    "INSERT OR REPLACE INTO style_profiles (session_token, description, model_used, extraction_ms) VALUES (?1, ?2, ?3, ?4)",
  )
    .bind(
      sessionToken,
      extraction.description,
      extraction.modelUsed,
      extraction.extractionMs,
    )
    .run();

  return { success: true };
}
