/**
 * Vision extraction engine — gemma-4 face/body descriptors + gpt-image-2 reference sheet.
 *
 * Runs inside a Cloudflare Worker with the AI binding.
 * No console.log — use structured diagnostics.
 */

import type { Ai } from '@cloudflare/workers-types';
import { IDENTITY_EXTRACTION_PROMPT, buildReferenceSheetPrompt } from './prompts';

// ─── Types ─────────────────────────────────────────────────────────

export interface IdentityExtractionResult {
  description: string;
  modelUsed: 'gemma-4-26b-a4b-it' | 'kimi-k2.5';
  extractionMs: number;
  error?: string;
}

export interface ReferenceSheetResult {
  r2Key: string;
  success: boolean;
  error?: string;
}

interface ExtractionEnv {
  AI: Ai;
  STORAGE: R2Bucket;
  DB: D1Database;
}

// ─── Identity Extraction ───────────────────────────────────────────

/**
 * Run gemma-4 vision on base64-encoded selfie photos to produce
 * a structured text description of the person's appearance.
 *
 * Falls back to kimi-k2.5 if gemma-4 returns empty or minimal output.
 */
export async function extractIdentity(
  env: { AI: Ai },
  base64Photos: { base64: string; mediaType: string }[],
): Promise<IdentityExtractionResult> {
  const start = Date.now();

  try {
    const content = [
      ...base64Photos.map((p) => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:${p.mediaType};base64,${p.base64}`,
        },
      })),
      { type: 'text' as const, text: IDENTITY_EXTRACTION_PROMPT },
    ];

    const response = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: [{ role: 'user', content } as any],
    });

    const elapsed = Date.now() - start;
    const text = (response as any)?.response || '';

    if (!text || text.length < 30) {
      // Try kimi-k2.5 fallback
      const fallbackResult = await tryFallback(env, base64Photos);
      if (fallbackResult?.description) {
        return {
          ...fallbackResult,
          extractionMs: elapsed + (Date.now() - start),
        };
      }
      return {
        description: '',
        modelUsed: 'gemma-4-26b-a4b-it',
        extractionMs: elapsed,
        error: 'Empty description from gemma-4 and kimi-k2.5 fallback',
      };
    }

    return { description: text, modelUsed: 'gemma-4-26b-a4b-it', extractionMs: elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { description: '', modelUsed: 'gemma-4-26b-a4b-it', extractionMs: elapsed, error: message };
  }
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
        type: 'image_url' as const,
        image_url: {
          url: `data:${p.mediaType};base64,${p.base64}`,
        },
      })),
      { type: 'text' as const, text: IDENTITY_EXTRACTION_PROMPT },
    ];

    const start = Date.now();
    const response = await env.AI.run('@cf/moonshotai/kimi-k2.5', {
      messages: [{ role: 'user', content } as any],
    });
    const elapsed = Date.now() - start;
    const text = (response as any)?.response || '';

    if (!text || text.length < 30) {
      return null;
    }

    return { description: text, modelUsed: 'kimi-k2.5', extractionMs: elapsed };
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
  env: { AI: Ai; STORAGE: R2Bucket },
  identityDescription: string,
  sessionToken: string,
): Promise<ReferenceSheetResult> {
  const prompt = buildReferenceSheetPrompt(identityDescription);
  const gatewayName = 'opinionated-imagen-ig';

  try {
    const response = await env.AI.run(
      'openai/gpt-image-2',
      {
        prompt,
        quality: 'medium',
        size: '1536x1024',
        output_format: 'png',
      },
      { gateway: { id: gatewayName } },
    );

    const responseData = response as any;
    // gpt-image-2 returns base64 in the response
    const imageData = responseData?.image?.base64 || responseData?.data?.[0]?.base64;
    if (!imageData) {
      return { r2Key: '', success: false, error: 'No image data in gpt-image-2 response' };
    }

    const r2Key = `profiles/${sessionToken}/identity-reference.png`;
    const binaryData = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0));
    await env.STORAGE.put(r2Key, binaryData, { httpMetadata: { contentType: 'image/png' } });

    return { r2Key, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { r2Key: '', success: false, error: message };
  }
}

// ─── Orchestration ─────────────────────────────────────────────────

/**
 * Full identity profile build: extract from photos, write to D1, generate reference sheet.
 */
export async function buildIdentityProfile(
  env: ExtractionEnv,
  sessionToken: string,
): Promise<{ success: boolean }> {
  const { listSelfieObjects, downloadAsBase64 } = await import('./storage');

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
    .bind(sessionToken, extraction.description, extraction.modelUsed, extraction.extractionMs)
    .run();

  // 5. Generate reference sheet (non-critical — skip on failure)
  const sheet = await generateReferenceSheet(env, extraction.description, sessionToken);
  if (sheet.success) {
    await env.DB.prepare(
      'UPDATE identity_profiles SET reference_r2_key = ?1 WHERE session_token = ?2',
    )
      .bind(sheet.r2Key, sessionToken)
      .run();
  }

  return { success: true };
}
