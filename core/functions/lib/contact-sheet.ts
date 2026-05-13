import { getProductWorkspace } from "../generated/products";
import {
  buildContactSheetPrompt,
  type ContactSheetPromptInput,
} from "./prompts";
import { readImageBase64 } from "./vision";

export interface ContactSheetEnv {
  AI: Ai;
  DB: D1Database;
  STORAGE: R2Bucket;
  PRODUCT_ID?: string;
  NICHE?: string;
}

export interface ContactSheetRequest {
  packId: string;
  userId: string;
  sessionToken: string;
  intention: ContactSheetPromptInput;
}

export interface ContactSheetResult {
  success: boolean;
  r2Key?: string;
  error?: string;
}

const PROVIDER_ROUTE = "cloudflare-ai-gateway:gpt-image-2";

export async function generateContactSheet(
  env: ContactSheetEnv,
  request: ContactSheetRequest,
): Promise<ContactSheetResult> {
  const gatewayName = getProductWorkspace(
    env.PRODUCT_ID ?? env.NICHE ?? "ig-content",
  ).manifest.gatewayId;
  const prompt = buildContactSheetPrompt(request.intention);

  try {
    const response = await env.AI.run(
      "openai/gpt-image-2",
      {
        model: "gpt-image-2",
        prompt,
        quality: "medium",
        size: "1536x1024",
        output_format: "png",
      },
      { gateway: { id: gatewayName } },
    );

    const imageData = readImageBase64(response);
    if (!imageData) {
      return { success: false, error: "No image data in gpt-image-2 response" };
    }

    const r2Key = `contact-sheets/${request.userId}/${request.packId}/contact-sheet.png`;
    const binaryData = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0));
    await env.STORAGE.put(r2Key, binaryData, {
      httpMetadata: { contentType: "image/png" },
      customMetadata: {
        packId: request.packId,
        providerRoute: PROVIDER_ROUTE,
      },
    });

    await env.DB.prepare(
      "UPDATE contact_sheets SET status = 'ready', artifact_r2_key = ?1, metadata_json = ?2, updated_at = datetime('now') WHERE pack_id = ?3",
    )
      .bind(
        r2Key,
        JSON.stringify({
          providerRoute: PROVIDER_ROUTE,
          gatewayId: gatewayName,
          variationCount: request.intention.variationCount,
          variantMode: request.intention.variantMode,
        }),
        request.packId,
      )
      .run();

    await env.DB.prepare(
      "UPDATE packs SET status = 'ready', updated_at = datetime('now') WHERE id = ?1",
    )
      .bind(request.packId)
      .run();

    return { success: true, r2Key };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await markPackFailed(env, request.packId, message);
    return { success: false, error: message };
  }
}

export async function markPackFailed(
  env: ContactSheetEnv,
  packId: string,
  message: string,
) {
  await env.DB.prepare(
    "UPDATE packs SET status = 'error', error_message = ?1, updated_at = datetime('now') WHERE id = ?2",
  )
    .bind(message, packId)
    .run();
  await env.DB.prepare(
    "UPDATE contact_sheets SET status = 'error', updated_at = datetime('now') WHERE pack_id = ?1",
  )
    .bind(packId)
    .run();
}
