/**
 * Tests: Identity Extraction Engine
 *
 * Unit tests for vision extraction logic, reference sheet generation,
 * model fallbacks, and image filtering.
 *
 * Layer: Unit (pure functions with mocked AI/Storage)
 * Risk: High (model failures, graceful degradation)
 */

import { describe, it, expect } from "vitest";
import {
  extractIdentity,
  generateReferenceSheet,
  buildIdentityProfile,
} from "../vision";
import {
  mockAi,
  mockR2,
  mockD1,
  createGemmaResponse,
  createGptImageResponse,
  createSelfieObjects,
  validDescription,
} from "test-scripts/profile-test-fixtures";

describe("extractIdentity()", () => {
  // 1. Happy path: Llama Vision returns valid description
  it("returns description from Llama Vision on success", async () => {
    const ai = mockAi({
      "@cf/meta/llama-3.2-11b-vision-instruct":
        createGemmaResponse(validDescription()),
    });

    const result = await extractIdentity({ AI: ai as any }, [
      { base64: "fakebase64", mediaType: "image/jpeg" },
    ]);

    expect(result.description).toBeTruthy();
    expect(result.modelUsed).toBe("llama-3.2-11b-vision-instruct");
    expect(result.extractionMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  // 2. Fallback: Llama Vision empty, kimi succeeds
  it("falls back to kimi when Llama Vision returns empty", async () => {
    const ai = mockAi({
      "@cf/meta/llama-3.2-11b-vision-instruct": { response: "" },
      "@cf/moonshotai/kimi-k2.5": createGemmaResponse(
        "Kimiko desc: male early 20s...",
      ),
    });

    const result = await extractIdentity({ AI: ai as any }, [
      { base64: "fakebase64", mediaType: "image/jpeg" },
    ]);

    expect(result.description).toBeTruthy();
    expect(result.modelUsed).toBe("kimi-k2.5");
  });

  // 3. Both models fail: returns error
  it("returns error when both Llama Vision and kimi fail", async () => {
    const ai = mockAi(
      { "@cf/meta/llama-3.2-11b-vision-instruct": { response: "" } },
      { "@cf/moonshotai/kimi-k2.5": "Model unavailable" },
    );

    const result = await extractIdentity({ AI: ai as any }, [
      { base64: "fakebase64", mediaType: "image/jpeg" },
    ]);

    expect(result.description).toBe("");
    expect(result.error).toBeTruthy();
  });

  // 4. Llama Vision throws error
  it("returns error when Llama Vision throws", async () => {
    const ai = mockAi(
      {},
      { "@cf/meta/llama-3.2-11b-vision-instruct": "AI service timeout" },
    );

    const result = await extractIdentity({ AI: ai as any }, [
      { base64: "fakebase64", mediaType: "image/jpeg" },
    ]);

    expect(result.description).toBe("");
    expect(result.error).toBeTruthy();
  });

  // 5. Short description treated as failure
  it("treats very short response as failure and falls back", async () => {
    const ai = mockAi({
      "@cf/meta/llama-3.2-11b-vision-instruct": { response: "Hi" },
      "@cf/moonshotai/kimi-k2.5": createGemmaResponse(validDescription()),
    });

    const result = await extractIdentity({ AI: ai as any }, [
      { base64: "fakebase64", mediaType: "image/jpeg" },
    ]);

    expect(result.description.length).toBeGreaterThan(20);
    expect(result.modelUsed).toBe("kimi-k2.5");
  });
});

describe("generateReferenceSheet()", () => {
  // 6. Reference sheet success: stores to R2
  it("stores reference sheet to R2 on gpt-image-2 success", async () => {
    const ai = mockAi({ "openai/gpt-image-2": createGptImageResponse() });
    const storage = mockR2();

    const result = await generateReferenceSheet(
      { AI: ai as any, STORAGE: storage as any },
      validDescription(),
      "test-session",
    );

    expect(result.success).toBe(true);
    expect(result.r2Key).toBe("profiles/test-session/identity-reference.png");
    expect(result.error).toBeUndefined();
  });

  // 7. Reference sheet failure: graceful degradation
  it("returns failure without throwing when gpt-image-2 errors", async () => {
    const ai = mockAi({}, { "openai/gpt-image-2": "API error" });
    const storage = mockR2();

    const result = await generateReferenceSheet(
      { AI: ai as any, STORAGE: storage as any },
      validDescription(),
      "test-session",
    );

    expect(result.success).toBe(false);
    expect(result.r2Key).toBe("");
    expect(result.error).toBeTruthy();
  });

  // 8. Reference sheet: no image data in response
  it("returns failure when gpt-image-2 returns no image data", async () => {
    const ai = mockAi({
      "openai/gpt-image-2": { response: "ok but no image" },
    });
    const storage = mockR2();

    const result = await generateReferenceSheet(
      { AI: ai as any, STORAGE: storage as any },
      validDescription(),
      "test-session",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("No image data");
  });
});

describe("buildIdentityProfile()", () => {
  // 9. Happy path: full profile build succeeds
  it("builds identity profile from selfie photos", async () => {
    const ai = mockAi({
      "@cf/meta/llama-3.2-11b-vision-instruct":
        createGemmaResponse(validDescription()),
      "openai/gpt-image-2": createGptImageResponse(),
    });
    const storage = mockR2(createSelfieObjects(10));
    const db = mockD1();

    const result = await buildIdentityProfile(
      { AI: ai as any, STORAGE: storage as any, DB: db as any },
      "test-session",
    );

    expect(result.success).toBe(true);
  });

  // 10. Large image filtering: skips >5MB, continues with remaining
  it("filters oversized images and continues with remaining", async () => {
    const objects = [
      {
        key: "uploads/test-session/selfie/0.jpg",
        size: 50000,
        body: new ArrayBuffer(50000),
      },
      {
        key: "uploads/test-session/selfie/1.jpg",
        size: 6_000_000,
        body: new ArrayBuffer(6_000_000),
      },
      {
        key: "uploads/test-session/selfie/2.jpg",
        size: 50000,
        body: new ArrayBuffer(50000),
      },
      {
        key: "uploads/test-session/selfie/3.jpg",
        size: 50000,
        body: new ArrayBuffer(50000),
      },
    ];
    const ai = mockAi({
      "@cf/meta/llama-3.2-11b-vision-instruct":
        createGemmaResponse(validDescription()),
    });
    const storage = mockR2(objects);
    const db = mockD1();

    const result = await buildIdentityProfile(
      { AI: ai as any, STORAGE: storage as any, DB: db as any },
      "test-session",
    );

    // 3 usable photos, still enough
    expect(result.success).toBe(true);
  });

  // 11. Not enough usable photos (after filtering)
  it("returns failure when fewer than 3 usable photos remain", async () => {
    const objects = [
      {
        key: "uploads/test-session/selfie/0.jpg",
        size: 50000,
        body: new ArrayBuffer(50000),
      },
      {
        key: "uploads/test-session/selfie/1.jpg",
        size: 2_000_000,
        body: new ArrayBuffer(2_000_000),
      },
    ];
    const ai = mockAi({});
    const storage = mockR2(objects);
    const db = mockD1();

    const result = await buildIdentityProfile(
      { AI: ai as any, STORAGE: storage as any, DB: db as any },
      "test-session",
    );

    expect(result.success).toBe(false);
  });

  // 12. Reference sheet failure: profile still succeeds (text-only)
  it("succeeds as text-only when gpt-image-2 fails", async () => {
    const ai = mockAi(
      {
        "@cf/meta/llama-3.2-11b-vision-instruct":
          createGemmaResponse(validDescription()),
      },
      { "openai/gpt-image-2": "Gateway error" },
    );
    const storage = mockR2(createSelfieObjects(10));
    const db = mockD1();

    const result = await buildIdentityProfile(
      { AI: ai as any, STORAGE: storage as any, DB: db as any },
      "test-session",
    );

    expect(result.success).toBe(true);
  });

  // 13. State after failure: both models fail → false
  it("returns failure when vision extraction fails entirely", async () => {
    const ai = mockAi(
      { "@cf/meta/llama-3.2-11b-vision-instruct": { response: "" } },
      { "@cf/moonshotai/kimi-k2.5": "Model unavailable" },
    );
    const storage = mockR2(createSelfieObjects(10));
    const db = mockD1();

    const result = await buildIdentityProfile(
      { AI: ai as any, STORAGE: storage as any, DB: db as any },
      "test-session",
    );

    expect(result.success).toBe(false);
  });
});
