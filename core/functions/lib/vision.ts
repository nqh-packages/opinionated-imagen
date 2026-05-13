/**
 * Vision extraction engine — gemma-4 face/body descriptors + gpt-image-2 reference sheet.
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
  modelUsed:
    | "llama-3.2-11b-vision-instruct"
    | "gemma-4-26b-a4b-it"
    | "kimi-k2.5";
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

// ─── Identity Extraction ───────────────────────────────────────────

/**
 * Run Llama Vision on base64-encoded selfie photos to produce
 * a structured text description of the person's appearance.
 */
export async function extractIdentity(
  env: { AI: Ai },
  base64Photos: { base64: string; mediaType: string }[],
): Promise<IdentityExtractionResult> {
  const start = Date.now();

  try {
    const descriptions = await extractEachImageWithLlama(
      env,
      base64Photos,
      IDENTITY_EXTRACTION_PROMPT,
    );
    const elapsed = Date.now() - start;
    const text = descriptions.join("\n\n");

    if (!text || text.length < 30) {
      const fallbackResult = await tryFallback(env, base64Photos);
      if (fallbackResult?.description) {
        return {
          ...fallbackResult,
          extractionMs: elapsed + (Date.now() - start),
        };
      }
      return {
        description: "",
        modelUsed: "llama-3.2-11b-vision-instruct",
        extractionMs: elapsed,
        error: "Empty description from llama vision and kimi-k2.5 fallback",
      };
    }

    return {
      description: text,
      modelUsed: "llama-3.2-11b-vision-instruct",
      extractionMs: elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      description: "",
      modelUsed: "llama-3.2-11b-vision-instruct",
      extractionMs: elapsed,
      error: message,
    };
  }
}

export async function extractStyle(
  env: { AI: Ai },
  base64Photos: { base64: string; mediaType: string }[],
): Promise<StyleExtractionResult> {
  const start = Date.now();

  try {
    const descriptions = await extractEachImageWithLlama(
      env,
      base64Photos,
      STYLE_EXTRACTION_PROMPT,
    );
    const elapsed = Date.now() - start;
    const text = descriptions.join("\n\n");

    if (!text || text.length < 30) {
      return {
        description: "",
        modelUsed: "llama-3.2-11b-vision-instruct",
        extractionMs: elapsed,
        error: "Empty style description from llama vision",
      };
    }

    return {
      description: text,
      modelUsed: "llama-3.2-11b-vision-instruct",
      extractionMs: elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      description: "",
      modelUsed: "llama-3.2-11b-vision-instruct",
      extractionMs: elapsed,
      error: message,
    };
  }
}

async function extractEachImageWithLlama(
  env: { AI: Ai },
  base64Photos: { base64: string; mediaType: string }[],
  prompt: string,
): Promise<string[]> {
  const descriptions: string[] = [];
  for (const photo of base64Photos.slice(0, 3)) {
    const response = await env.AI.run(
      "@cf/meta/llama-3.2-11b-vision-instruct",
      {
        messages: [
          {
            role: "system",
            content: "You are a precise visual analysis assistant.",
          },
          { role: "user", content: prompt },
        ],
        image: `data:${photo.mediaType};base64,${photo.base64}`,
      },
    );
    const text = readTextResponse(response);
    if (text.length >= 30) descriptions.push(text);
  }
  return descriptions;
}

/**
 * Fallback: try kimi-k2.5 with the same photos and prompt.
 */
async function tryFallback(
  env: { AI: Ai },
  base64Photos: { base64: string; mediaType: string }[],
): Promise<IdentityExtractionResult | null> {
  try {
    const content = [
      ...base64Photos.map((p) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${p.mediaType};base64,${p.base64}`,
        },
      })),
      { type: "text" as const, text: IDENTITY_EXTRACTION_PROMPT },
    ];

    const start = Date.now();
    const response = await env.AI.run("@cf/moonshotai/kimi-k2.5", {
      messages: [{ role: "user", content } as never],
    });
    const elapsed = Date.now() - start;
    const text = readTextResponse(response);

    if (!text || text.length < 30) {
      return null;
    }

    return { description: text, modelUsed: "kimi-k2.5", extractionMs: elapsed };
  } catch {
    return null;
  }
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
  const data = response as { response?: unknown; text?: unknown };
  if (typeof data.response === "string") return data.response;
  if (typeof data.text === "string") return data.text;
  return "";
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
