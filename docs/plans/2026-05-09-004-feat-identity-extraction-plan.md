---
title: Identity Extraction — vision AI descriptors + hidden reference sheet from 10 selfies
type: feat
status: active
date: 2026-05-09
origin: https://github.com/nqh-packages/opinionated-imagen/issues/10
---

# Identity Extraction — vision AI descriptors + hidden reference sheet from 10 selfies

## Overview

Build the Identity Profile — the engine that turns 10 utility selfies into two internal artifacts: a structured text description of the Creator's appearance, and a hidden multi-angle portrait reference sheet. Both are invisible to the Creator. The text feeds future generation prompts; the reference sheet serves as the visual identity anchor for image consistency.

This is the first AI-powered step in the system. It runs when the Creator taps "Build your Profile" after uploading their Selfie Set. The Creator moves to onboarding Step 2 (Style) while this processes in the background.

---

## Problem Frame

The product promises photorealistic, consistent output of a specific person across multiple scenes and styles. Without a structured Identity Profile, every generation would need the raw selfies as input — wasting bandwidth, leaking multiple photos, and losing the semantic understanding of "who this person is." The Identity Profile is the internal SSOT for a Creator's appearance.

**The character must be persistent.** Every generation of the same Creator must produce the same person — recognizably them, not someone who looks vaguely similar. This means the Identity Profile must be precise enough that when fed into gpt-image-2 alongside a Scene, a stranger viewing the output should say "that's the same person as in the selfies."

Two artifacts, one question to answer:
1. **What does this person look like?** → structured text (gemma-4 vision)
2. **What does this person consistently look like in a single frame?** → multi-angle reference sheet (gpt-image-2)

---

## Requirements Trace

- R1. Given 10 selfie photos in R2, produce a structured text description of face/body descriptors
- R2. Generate a hidden multi-angle portrait reference sheet from the 10 selfies
- R3. Store both artifacts in D1 `identity_profiles` table + reference sheet in R2
- R4. Handle edge cases: 0 faces, multiple people, poor lighting, partial occlusion, model failures
- R5. Total processing under 30 seconds
- R6. Text-only degradation path if reference sheet generation fails

**Origin actors:** Creator
**Origin flows:** Identity Profile building (runs in background after selfie upload)

---

## Scope Boundaries

- **No style extraction.** Style Presets (Issue #13) is separate work.
- **No D1 job queue.** The work runs inline in the `POST /api/profile/build` handler. The frontend polls `/api/profile/status` until done. If a production-grade async worker is needed at scale, Issue #12's job queue infrastructure takes over later.
- **No validation of photo content.** Photos were already uploaded to R2 via Issue #4. If a selfie is corrupt or contains no face, gemma-4 handles it gracefully (edge case handling, not pre-filtering).
- **No Instagram scraping or auto-populate.** Deferred to future product iteration.
- **No Creator-facing preview of the Identity Profile.** The text description and reference sheet are internal only.
- **No retry queue on failure.** If the build fails, the Creator gets a `profile_failed` state and must re-trigger. Retry logic is deferred to the background worker (Issue #12).

### Deferred to Follow-Up Work

- Style extraction (Issue #13) — separate work
- Background job queue (Issue #12) — wraps identity extraction in a proper job lifecycle
- Retry with exponential backoff — depends on job queue
- Identity Profile caching / pre-warm — future optimization

---

## Context & Research

### Relevant Code and Patterns

- **Upload pipeline plan** (`docs/plans/2026-05-09-001-feat-upload-pipeline-plan.md`): Establishes the session state machine (`collecting` → `building_profile` → `ready` / `error`), R2 uploads via presigned URLs, and the status polling pattern.
- **Profile routes** (`functions/routes/profile.ts`): Existing stubs for `GET /api/profile/status` and `POST /api/profile/build`. The build handler transitions state to `building_profile` but does no actual work — this plan adds the real work.
- **Workers AI call pattern** (from `MODELS.md`): `env.AI.run('model-name', { messages: [...] })` for hosted models (gemma-4, kimi-k2.6). `env.AI.run('model-name', { prompt, images, quality, size }, { gateway: { id: 'opinionated-imagen-ig' } })` for proxied models (gpt-image-2).
- **R2 read in Workers** (from `storage.ts`): R2 bucket binding `env.STORAGE` provides `bucket.get(key)` returning `R2ObjectBody`. Photos are at key pattern `uploads/{sessionToken}/selfie/{timestamp}-{random}.{ext}`.
- **Structured diagnostics** (`functions/lib/diagnostics.ts`): `serviceUnavailable()` with `retriable: true` for downstream failures. `badRequest()` / `preconditionFailed()` for validation errors.
- **D1 migration pattern** (`functions/migrations/0001_*.sql`): Sequential SQL files. `CREATE TABLE IF NOT EXISTS`. CHECK constraints for enums. FK references with indexes.
- **UUID generation** (`functions/lib/id.ts`): `crypto.randomUUID()`.
- **Existing plans**: All three prior plans (upload, scenes, auth) follow a consistent structure. This plan mirrors that.

### Institutional Learnings

- **R2 key pattern**: `uploads/{sessionToken}/{type}/{timestamp}-{random6}.{ext}`. Selfies are `selfie` type. The identity reference sheet will be stored at `profiles/{sessionToken}/identity-reference.png`.
- **Workers AI image input format**: gpt-image-2 accepts base64-encoded images or data URIs as strings in the `images` array. Must convert R2 objects to base64 before passing.
- **D1 updates after response**: The Worker can continue processing after returning the response. The build handler returns `{ status: 'building_profile' }` immediately, then continues with AI work. This is acceptable for the 30s budget.
- **Model availability**: `gemma-4-26b-a4b-it` is a hosted Workers AI model (no gateway needed). `openai/gpt-image-2` is proxied via AI Gateway and needs `{ gateway: { id: 'opinionated-imagen-ig' } }`.

### Test Fixture — Canonical Creator

The product creator (Huy) serves as the canonical test subject. A set of 9 photos covering front, 3/4, and profile angles exists at `~/.agents/skills/huy-face/photos/`. A structured facial profile at `~/.agents/skills/huy-face/huy-facial-profile.json` provides ground truth for:
- Face shape: oval-rectangular with inverted triangle taper
- Skin tone: warm/medium
- Eye color: dark brown, almond, slightly hooded
- Nose: low bridge, rounded tip
- Jaw: defined — strongest structural feature
- Hair: silver/pepper, straight to slight wave, high density
- Distinguishing features: neck tattoo (star/sun), light stubble, neck chains

This fixture drives prompt iteration — see [Verification Strategy](#verification-strategy).

### External References

- **Workers AI vision**: `env.AI.run('google/gemma-4-26b-a4b-it', { messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '...' } }, { type: 'text', text: 'Describe...' }] }] })`
- **Workers AI image generation**: `env.AI.run('openai/gpt-image-2', { prompt, images, quality, size }, { gateway: { id } })`
- **OpenAI prompting guide**: Include "photorealistic", "shot on iPhone", specific lens terms, imperfection descriptions for realism.
- See `MODELS.md` for full model references, pricing, and call examples.

---

## Key Technical Decisions

- **Inline execution, not job queue**: The AI work runs in the POST handler after returning the response. This avoids depending on Issue #12 (which doesn't exist yet). The 30s CPU budget on Workers paid plan comfortably fits gemma-4 vision (<10s) + gpt-image-2 generation (<20s). The frontend already polls `/api/profile/status` — it will see the state transition from `building_profile` to `ready` once the work completes. If the work exceeds the budget, it degrades gracefully to text-only.
- **Two-step chain: gemma-4 first, then gpt-image-2**: The vision model produces the text description first. That description is used as the prompt seed for the reference sheet generation. This means the reference sheet is grounded in the same understanding of the subject — not a separate interpretation.
- **D1 `identity_profiles` table includes both text and R2 key for the reference image**: A single row per session links the two artifacts. The reference image is stored in R2 (not D1) because it's binary data.
- **Base64 for Workers AI vision input**: gemma-4 accepts images as base64 strings embedded in the message content array. R2 returns binary objects — these must be converted to base64 before calling gemma-4.
- **Workers AI (not AI Gateway) for gemma-4**: gemma-4 is a hosted model, no gateway needed. gpt-image-2 is proxied and requires the gateway.
- **Text-only degradation if reference sheet fails**: If gpt-image-2 fails (timeout, quota, quality rejection), the Identity Profile is still usable with text only. The session transitions to `ready`, not `profile_failed`. The text description alone provides enough information for downstream generation.
- **Huy is the canonical test subject**: All prompt tuning and model iteration uses Huy's photos as source data and his structured facial profile as ground truth. This ensures the character persists across generations — every future session with Huy's profile produces recognizably the same person.

---

## Open Questions

### Resolved During Planning

- Reference sheet vs individual anchor portrait: Multi-angle sheet (front, 3/4, side profile on one canvas). This matches the researched best practice from creators (use a single reference image with multiple angles for identity consistency).
- Degradation strategy: If gpt-image-2 fails, use text-only profile rather than failing the entire build. Reference sheet failure is not a session-level error.
- Execution model: Inline in the POST handler (after returning response), not dependent on Issue #12's job queue. Simpler, meets the 30s budget.
- Test subject: Huy's own photos (9 images, multiple angles) serve as the canonical test dataset. Ground truth from `huy-facial-profile.json`.

### Deferred to Implementation

- Exact gemma-4 vision prompt for face/body extraction — needs empirical tuning against Huy's photos. The Verification Strategy section below defines the iteration loop.
- Exact gpt-image-2 multi-angle sheet prompt — same, needs tuning. The gemma-4 output is the input seed.
- Quality setting for gpt-image-2: start with "medium", escalate to "high" for portraits if quality is insufficient.
- base64 conversion of R2 images within 10MB Workers memory limit — verify in implementation. 10 selfies at 20MB each would exceed Workers memory (~128MB). Must limit: resize or skip large images.
- Whether gemma-4 can handle all 10 images in one call (multi-turn with many images) or whether to batch — check API limits during implementation.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Data Flow

```
Creator taps "Build your Profile"
    │
    ▼
POST /api/profile/build { sessionToken }
    │
    ├─ 1. Return 200 { status: 'building_profile' } immediately
    │
    ├─ 2. Background: Start identity extraction
    │
    ├─ 3. List R2 uploads for session WHERE upload_type = 'selfie'
    │
    ├─ 4. Download ≤10 selfies from R2 (bucket.get)
    │      │
    │      ├─ If <10 selfies → skip (shouldn't happen, build is guarded)
    │      │
    │      ▼
    ├─ 5. Convert to base64 (limit to 128KB per image to stay under Workers memory)
    │
    ├─ 6. Call gemma-4 vision: describe face/body from all selfies
    │      │
    │      ├─ SUCCESS → parse text description
    │      └─ FAIL → try kimi-k2.6 fallback
    │                ├─ SUCCESS → use kimi output
    │                └─ FAIL → set profile_failed, stop
    │
    ├─ 7. Write text description to D1 identity_profiles
    │
    ├─ 8. Call gpt-image-2: generate multi-angle reference sheet
    │      │
    │      ├─ SUCCESS → upload to R2 at profiles/{sessionToken}/identity-reference.png
    │      ├─ FAIL → skip (text-only profile is acceptable)
    │      │
    │      ▼
    └─ 9. Update session status → 'ready' (or 'profile_failed' on critical failure)
    │
    ▼
Frontend polls /api/profile/status → sees 'ready'
```

### Session State Machine

```
collecting ──(build triggered)──→ building_profile ──(success)──→ ready
                                          │
                                          └──(critical failure)──→ profile_failed
```

The `building_profile` → `ready` transition now does real work (not a stub).

---

## Verification Strategy

This is the most important section of the plan. The Identity Profile is an AI output — you cannot prove it works with unit tests alone. The verification strategy is a **human-in-the-loop empirical loop** using a known face.

### Canonical Test Subject

**Subject:** Huy (the product creator)
**Source photos:** 9 images at `~/.agents/skills/huy-face/photos/`
**Ground truth:** `~/.agents/skills/huy-face/huy-facial-profile.json`

The photos cover: front neutral, front smiling, 3/4 left, 3/4 right, right profile, low angle. Multiple lighting conditions (indoor, outdoor, hot spring, tropical). This is a realistic Selfie Set — not curated studio photos.

### Phase 1: Model Proof (Before Any Infrastructure)

Before writing any Worker code, prove the models work with the actual data.

1. **Manual gemma-4 call:** Take 3-4 of Huy's photos, base64-encode them, send to gemma-4 vision via the Workers AI API or a quick curl script. Does the description mention: low nose bridge, defined jaw, silver/pepper hair, almond dark brown eyes, oval-rectangular face, warm skin tone, neck tattoo?

2. **Manual gpt-image-2 call:** Take the gemma-4 output (or manually write a good description from the ground truth JSON) and send to gpt-image-2 with the multi-angle sheet prompt. Does the output look like Huy? If not, tune the prompt and retry.

3. **Gate:** If either model produces unusable output for a known face, the architecture must change before building infrastructure. This is a fail-fast gate.

### Phase 2: Text Description Accuracy

Once the pipeline is implemented (U1-U5):

1. Upload Huy's 9 photos as test selfies to a test session in R2
2. Trigger profile build
3. Read the gemma-4 description from D1 `identity_profiles`
4. Compare against `huy-facial-profile.json` systematically:

| Feature | Ground truth | gemma-4 output | Match? |
|---------|-------------|----------------|--------|
| Face shape | oval-rectangular, inverted triangle taper | | |
| Skin tone | warm/medium | | |
| Eye color | dark brown | | |
| Eye shape | almond, slightly hooded | | |
| Nose bridge | low | | |
| Jaw | defined, strongest feature | | |
| Hair color | silver/pepper | | |
| Hair texture | straight to slight wave, dense | | |
| Distinguishing features | neck tattoo, light stubble, chains | | |
| Age range | early-mid 20s | | |
| Gender | male | | |
| Ethnicity | Vietnamese / Southeast Asian | | |

5. **Gate:** ≥9/11 features match = pass. If <9 match, iterate on the gemma-4 prompt. The prompt in `prompts.ts` is a starting point — it must be tuned until the output consistently hits this gate when tested against Huy's photos.

### Phase 3: Reference Sheet Visual Inspection

Once U4 is implemented:

1. Download the generated reference sheet from R2 (`profiles/{sessionToken}/identity-reference.png`)
2. **Huy looks at it.** Answer these questions:
   - Does this person look like me? (Y/N)
   - Is the front view consistent with the 3/4 and profile views? (Y/N)
   - Would a stranger looking at this sheet and then at my selfies say "same person"? (Y/N)
   - Is the lighting, clothing, and background consistent across all three angles? (Y/N)
3. **Gate:** 4/4 "Y" = pass. If any "N", iterate on the gpt-image-2 prompt, image quality settings, and gemma-4 description quality.

### Phase 4: Character Persistence (Acid Test)

The ultimate test — does the extracted profile actually produce consistent generations of the same person?

1. Take the generated reference sheet
2. Feed it as input to gpt-image-2 alongside a Scene description: "Cafe Aesthetic — put this person at a warm cafe table, morning window light"
3. Look at the output. Does it look like Huy? Or does it look like someone who vaguely resembles Huy?
4. Run the same Scene twice — does the person look the same both times? (Consistency across runs)

### Phase 5: CI — Wiring Only

In CI, unit tests mock all model calls. They verify:
- State transitions are correct
- D1 writes happen
- R2 keys are correct
- Error states propagate correctly

The real model verification (Phases 1-4) runs manually against a staging environment or local `wrangler dev --remote` with real Workers AI.

### Verification Script

A test script at `codex-scripts/verify-identity-profile.ts` automates Phase 2:
- Uploads Huy's photos to a test R2 prefix
- Calls the profile/build endpoint
- Polls until ready
- Downloads the gemma-4 description
- Compares key features against the ground truth JSON
- Outputs a comparison table (see Phase 2 table above)
- Downloads the reference sheet to a local file for visual inspection

This script is gitignored (contains local photo paths) and lives at `codex-scripts/` per project convention.

---

## Implementation Units

- U1. **D1 Migration — `identity_profiles` table**

**Goal:** Create the `identity_profiles` table to store extraction results.

**Requirements:** R3

**Dependencies:** None (U1 only needs D1 infrastructure, already established)

**Files:**
- Create: `functions/migrations/0004_create_identity_profiles.sql`

**Approach:**
- `identity_profiles` table:
  ```sql
  CREATE TABLE IF NOT EXISTS identity_profiles (
    session_token    TEXT PRIMARY KEY REFERENCES sessions(token),
    description      TEXT NOT NULL,
    reference_r2_key TEXT,
    model_used       TEXT NOT NULL DEFAULT 'gemma-4-26b-a4b-it',
    extraction_ms    INTEGER,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```
- `session_token` is both PK and FK — one profile per session.
- `description` is the structured text (e.g., "Vietnamese man in his early 20s, warm medium skin...").
- `reference_r2_key` is optional (may be NULL if gpt-image-2 generation failed).
- `model_used` records which model produced the description (gemma-4 or kimi-k2.6 fallback).
- `extraction_ms` records how long the extraction took (for performance tracking).

**Test scenarios:**
- **Happy path:** Migration creates the table with correct columns and FK constraint.
- **Edge case:** Re-running migration is idempotent.
- **Integration:** Insert a row with session_token FK referencing an existing session, then SELECT it back.

**Verification:**
- `wrangler d1 migrations apply opinionated-imagen-db` succeeds.
- Schema query shows the table with correct columns.

---

- U2. **R2 Photo Download Helper**

**Goal:** Read selfie photos from R2, list all selfie uploads for a session, download them, and convert to base64.

**Requirements:** R1 (foundational — photos must be read before extraction)

**Dependencies:** U1 (D1 schema exists, but U2 is independent — could be built in parallel)

**Files:**
- Modify: `functions/lib/storage.ts` — add `listSelfieObjects` and `downloadAsBase64` helpers

**Approach:**
- `listSelfieObjects(sessionToken, env.STORAGE)`:
  - Uses `env.STORAGE.list({ prefix: `uploads/${sessionToken}/selfie/` })`.
  - Returns `R2Object[]` (key, size, uploaded date). Limit to 10 objects (there should be exactly 10 or more).
- `downloadAsBase64(r2Object, env.STORAGE)`:
  - Calls `env.STORAGE.get(r2Object.key)` returning `R2ObjectBody`.
  - Reads the body as an `ArrayBuffer`.
  - Converts to base64 using `btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))`.
  - Returns `{ base64, mediaType }` (e.g., `{ base64: '/9j/4AAQ...', mediaType: 'image/jpeg' }`).
- Memory safeguard: if a single image exceeds 1MB (rough estimate), skip it with a diagnostic. Workers have ~128MB memory — 10 images at 20MB each would overflow. Only include images under 1MB in the extraction. Log a diagnostic for skipped large images.
- Sort objects by `uploaded` date (oldest first) to ensure consistent ordering across extraction runs.

**Test data:** Huy's 9 test photos are typically 40-300KB each (well under the 1MB threshold). Verify each fits.

**Patterns to follow:**
- Existing `storage.ts` patterns for R2 operations.
- Existing error handling with structured diagnostics.
- The `crypto.randomUUID()` pattern from `lib/id.ts` for UUID generation.

**Test scenarios:**
- **Happy path:** Session with 10 selfie R2 objects → `listSelfieObjects` returns all 10, ordered chronologically.
- **Happy path:** Each downloaded image converts to valid base64 with correct media_type prefix.
- **Edge case:** Session with 0 selfie objects → returns empty array. Caller handles gracefully.
- **Edge case:** Session with R2 objects but some fail to download → skip failed ones, return the rest with diagnostic.
- **Edge case:** Single image >1MB → skip it, log diagnostic, return remaining.

**Verification:**
- Unit test: mock R2 bucket with 10 objects → list returns 10 objects.
- Unit test: mock R2 object body → base64 conversion produces expected string.
- Unit test: large image → skipped, diagnostic logged.

---

- U3. **Vision Extraction Engine (gemma-4 → text description)**

**Goal:** Call gemma-4 vision with the selfie photos, extract structured face/body descriptors, write result to D1.

**Requirements:** R1, R4, R5, R6

**Dependencies:** U2 (needs base64 photos from R2)

**Files:**
- Create: `functions/lib/vision.ts` — gemma-4 extraction logic
- Create: `functions/lib/prompts.ts` — prompt templates for vision extraction
- Create: `functions/__tests__/vision.test.ts` — unit tests

**Approach:**

**Prompt structure (in `functions/lib/prompts.ts`):**
```typescript
export const IDENTITY_EXTRACTION_PROMPT = `You are a professional photographer's assistant. Examine these selfie photos of the same person carefully.

Describe the person's appearance precisely. Include:
- Apparent age range and gender presentation
- Ethnicity (be specific: East Asian, Southeast Asian, South Asian, European, Middle Eastern, African, Latino, mixed)
- Skin tone (use specific terms: fair, light, warm olive, medium, tan, deep, dark)
- Face shape (oval, round, heart, square, diamond, oblong, rectangular)
- Eye color and shape (almond, round, hooded, monolid, deep-set)
- Nose bridge height (low, medium, high) and tip shape
- Lip shape, fullness, and natural color
- Hair: color, length, texture, style
- Jawline: defined or soft, angular or rounded
- Distinctive features (freckles, dimples, scars, beauty marks, tattoos, piercings, glasses, stubble/beard)
- Body type / build (slim, athletic, curvy, etc.)

Format your response as a single natural-language paragraph. Be specific. Use terms a photographer would use to brief another photographer. If you cannot determine something, omit it rather than guessing.`;
```

**Vision extraction function (in `functions/lib/vision.ts`):**
```typescript
interface IdentityExtractionResult {
  description: string;
  modelUsed: 'gemma-4-26b-a4b-it' | 'kimi-k2.6';
  extractionMs: number;
  error?: string;
}

async function extractIdentity(
  env: { AI: Ai },
  base64Photos: { base64: string; mediaType: string }[],
): Promise<IdentityExtractionResult> {
  const start = Date.now();
  const response = await env.AI.run(
    'google/gemma-4-26b-a4b-it',
    {
      messages: [
        {
          role: 'user',
          content: [
            ...base64Photos.map(p => ({
              type: 'image',
              source: { type: 'base64', media_type: p.mediaType, data: p.base64 },
            })),
            { type: 'text', text: IDENTITY_EXTRACTION_PROMPT },
          ],
        },
      ],
    },
  );
  const elapsed = Date.now() - start;

  const text = response?.choices?.[0]?.message?.content ?? '';
  if (!text || text.length < 20) {
    // Try kimi-k2.6 fallback
    const fallbackResult = await tryFallback(env, base64Photos);
    if (fallbackResult) return { ...fallbackResult, extractionMs: elapsed + (Date.now() - start) };
    return { description: '', modelUsed: 'gemma-4-26b-a4b-it', extractionMs: elapsed, error: 'Empty description from gemma-4 and fallback' };
  }

  return { description: text, modelUsed: 'gemma-4-26b-a4b-it', extractionMs: elapsed };
}
```

- Fallback function `tryFallback(env, photos)` calls `moonshot-ai/kimi-k2.6` with the same prompt.
- Both models return structured text. No JSON parsing needed — the raw paragraph is the output.

**Prompt tuning methodology:**
- Start with the prompt above
- Run against Huy's photos
- Compare against ground truth JSON (11-point checklist in Verification Strategy)
- Tune the prompt to fix gaps (e.g., if it misses "low nose bridge", add explicit instruction)
- Iterate until ≥9/11 features match

**Execution note:** Start by running gemma-4 against Huy's photos manually (via curl or quick script) BEFORE writing any Worker code. If the prompt can't produce good output for a known face with the starting prompt, iterate the prompt first. This is Phase 1 of the Verification Strategy.

**Test scenarios:**
- **Happy path (Huy):** gemma-4 returns a description covering all 11 feature categories for Huy's 9 photos.
- **Happy path (Huy):** Description correctly identifies low nose bridge, defined jaw, silver/pepper hair, almond dark brown eyes, warm skin tone, neck tattoo.
- **Edge case:** 0 usable faces in photos → gemma-4 describes what it can see, description has "cannot see face clearly" prefix.
- **Edge case:** gemma-4 returns empty/minimal output → fallback to kimi-k2.6.
- **Edge case:** Both models fail → `error` field is populated, `description` is empty.
- **Prompt regression:** After a prompt change, run against Huy's photos and verify ≥9/11 features still match.

**Verification:**
- Unit test with mock `env.AI.run()` calls.
- Integration test with real Workers AI (requires `wrangler dev --remote` or a deployed Worker).
- Phase 2 comparison table: gemma-4 output vs ground truth JSON, ≥9/11 match.

---

- U4. **Reference Sheet Generation (gpt-image-2 → multi-angle portrait)**

**Goal:** Use the gemma-4 description as a prompt to generate a multi-angle portrait reference sheet. Store in R2.

**Requirements:** R2, R3, R6

**Dependencies:** U3 (needs the text description as prompt input)

**Files:**
- Modify: `functions/lib/vision.ts` — add `generateReferenceSheet` function
- Modify: `functions/lib/prompts.ts` — add reference sheet prompt template
- Modify: `functions/lib/storage.ts` — add `storeReferenceSheet` helper
- Create: `functions/__tests__/reference-sheet.test.ts` — unit tests

**Approach:**

**Prompt structure (in `functions/lib/prompts.ts`):**
```typescript
export const buildReferenceSheetPrompt = (identityDescription: string): string => {
  return `Generate a professional multi-angle portrait reference sheet of the exact same person described below. The image must show THREE views of the SAME person: front-facing portrait (center), 3/4 angle (left), side profile (right) — all on a clean white or light gray background.

Person description: ${identityDescription}

Style requirements:
- Photorealistic photography, not illustration
- Clean studio lighting, soft and even
- Neutral expression, direct gaze (front view)
- Same clothing, same lighting across all three angles
- Sharp focus, visible skin texture, pores, flyaways
- No text overlays, no watermarks, no logo
- Each angle should clearly show the same person — bone structure, hair, skin must be identical
- Frame width: all three views fit side by side in a landscape composition`;
};
```

**Reference sheet generation function:**
```typescript
async function generateReferenceSheet(
  env: { AI: Ai; STORAGE: R2Bucket },
  identityDescription: string,
  sessionToken: string,
): Promise<{ r2Key: string; success: boolean; error?: string }> {
  const prompt = buildReferenceSheetPrompt(identityDescription);

  try {
    const response = await env.AI.run(
      'openai/gpt-image-2',
      {
        prompt,
        quality: 'medium',
        size: '1536x1024', // landscape: three views side by side
        output_format: 'png',
      },
      { gateway: { id: 'opinionated-imagen-ig' } },
    );

    // gpt-image-2 returns base64 image data in the response
    const imageData = response?.image?.base64 || response?.data?.[0]?.base64;
    if (!imageData) throw new Error('No image data in gpt-image-2 response');

    const r2Key = `profiles/${sessionToken}/identity-reference.png`;
    const binaryData = Uint8Array.from(atob(imageData), c => c.charCodeAt(0));
    await env.STORAGE.put(r2Key, binaryData, { httpMetadata: { contentType: 'image/png' } });

    return { r2Key, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { r2Key: '', success: false, error: message };
  }
}
```

- Uses `quality: 'medium'` as default. If output quality is poor, escalate to `'high'` (costs more but necessary for portrait work).
- Size is landscape `1536x1024` to accommodate three views side by side.
- Output format is PNG (lossless, no compression artifacts on a reference image).
- R2 key: `profiles/{sessionToken}/identity-reference.png` — separate prefix from uploads for lifecycle management.
- gpt-image-2 is proxied via AI Gateway — must include `{ gateway: { id: 'opinionated-imagen-ig' } }`.

**Patterns to follow:**
- Workers AI call pattern from `MODELS.md`.
- R2 put pattern from existing `storage.ts` (but `env.STORAGE.put` directly instead of presigned URLs).
- Structured error diagnostics on failure.

**Test scenarios:**
- **Happy path (Huy):** gpt-image-2 returns valid image data for Huy's description → stored in R2 at correct key.
- **Happy path:** Generated sheet is viewable — three angles of the same person, consistent across views.
- **Edge case:** gpt-image-2 returns no image data or empty result → returns `{ success: false }`. Caller handles gracefully (text-only profile).
- **Edge case:** gpt-image-2 response has unexpected format → catch, return error.
- **Edge case:** R2 write fails → return error (reference sheet lost, but profile is still text-only viable).

**Verification:**
- Unit test with mock gpt-image-2 response.
- Integration test with real Workers AI + R2 (requires `wrangler dev --remote`).
- Phase 3 visual inspection: download the generated sheet, Huy inspects it (4/4 criteria must pass).
- Phase 4 acid test: feed the sheet into a downstream Scene generation and verify the output person matches Huy.

---

- U5. **Orchestration — Wire extraction into profile/build handler**

**Goal:** Replace the stub `building_profile` transition with real work — R2 download, gemma-4 extraction, gpt-image-2 generation, D1 write, state transition.

**Requirements:** R1, R2, R3, R4, R5, R6

**Dependencies:** U2, U3, U4 (all extraction components), U1 (D1 table exists)

**Files:**
- Modify: `functions/routes/profile.ts` — rewrite the build handler
- Modify: `functions/lib/diagnostics.ts` — add `identityExtractionError` builder if needed
- Create: `codex-scripts/verify-identity-profile.ts` — verification script (gitignored)
- Create: `functions/__tests__/profile-build.test.ts` — integration tests for the full flow

**Approach:**

**POST /api/profile/build handler (rewritten):**
```typescript
profileApp.post('/build', async (c) => {
  // 1. Parse + validate body (existing: sessionToken required)
  // 2. Look up session (existing: 404 if not found, 409 if not collecting)
  // 3. Enforce thresholds (existing: 10 selfies, 5 moodboard)
  // 4. Transition to building_profile (existing)
  await c.env.DB.prepare(
    "UPDATE sessions SET status = 'building_profile', updated_at = datetime('now') WHERE token = ?1",
  ).bind(sessionToken).run();

  // Return 200 immediately — frontend starts polling
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const identityResult = await buildIdentityProfile(c.env, sessionToken);

        if (identityResult.success) {
          await c.env.DB.prepare(
            "UPDATE sessions SET status = 'ready', updated_at = datetime('now') WHERE token = ?1"
          ).bind(sessionToken).run();
        } else {
          await c.env.DB.prepare(
            "UPDATE sessions SET status = 'error', updated_at = datetime('now') WHERE token = ?1"
          ).bind(sessionToken).run();
        }
      } catch (err) {
        await c.env.DB.prepare(
          "UPDATE sessions SET status = 'error', updated_at = datetime('now') WHERE token = ?1"
        ).bind(sessionToken).run();
      }
    })()
  );

  return c.json({ status: 'building_profile' }, 200);
});
```

**Separate function `buildIdentityProfile(env, sessionToken)`:**
```typescript
async function buildIdentityProfile(env: Env, sessionToken: string): Promise<{ success: boolean }> {
  // 1. List selfie R2 objects
  const selfieKeys = await listSelfieObjects(sessionToken, env.STORAGE);
  if (selfieKeys.length < 10) return { success: false };

  // 2. Download and convert to base64 (skip oversized)
  const base64Photos: { base64: string; mediaType: string }[] = [];
  for (const key of selfieKeys) {
    const result = await downloadAsBase64(key, env.STORAGE);
    if (result) base64Photos.push(result);
  }
  if (base64Photos.length < 3) return { success: false };

  // 3. Run vision extraction
  const extraction = await extractIdentity(env, base64Photos);
  if (!extraction.description) return { success: false };

  // 4. Write text description to D1
  await env.DB.prepare(
    `INSERT INTO identity_profiles (session_token, description, model_used, extraction_ms)
     VALUES (?1, ?2, ?3, ?4)`
  ).bind(sessionToken, extraction.description, extraction.modelUsed, extraction.extractionMs).run();

  // 5. Generate reference sheet (non-critical — skip on failure)
  const sheet = await generateReferenceSheet(env, extraction.description, sessionToken);
  if (sheet.success) {
    await env.DB.prepare(
      `UPDATE identity_profiles SET reference_r2_key = ?1 WHERE session_token = ?2`
    ).bind(sheet.r2Key, sessionToken).run();
  }

  return { success: true };
}
```

**Session state:** Uses `'error'` instead of `'profile_failed'` (matches existing D1 CHECK constraint). U6 adds the proper `profile_failed` status.

**Verification script (`codex-scripts/verify-identity-profile.ts`):**
- Copies Huy's 9 test photos to R2 via presigned URLs (or direct R2 put if running locally)
- Creates a session manually via D1
- Calls POST /api/profile/build
- Polls GET /api/profile/status until ready/error
- Reads the gemma-4 description from D1
- Outputs the Phase 2 comparison table (11 features vs ground truth)
- Downloads the reference sheet from R2 to a local file
- Reports pass/fail for each verification gate

**Patterns to follow:**
- `executionCtx.waitUntil()` pattern — Hono `c.executionCtx` is the `ExecutionContext`.
- Existing `c.json()` response and structured diagnostics pattern.
- Existing try/catch with `serviceUnavailable()` on unexpected errors.

**Test scenarios:**
- **Happy path:** Valid session with 10 selfies → POST /build → returns 200 with `building_profile` → poll status eventually shows `ready`. D1 has identity_profiles row.
- **Happy path (reference sheet fails):** gpt-image-2 call fails → session still becomes `ready` with text-only profile. D1 row has NULL `reference_r2_key`.
- **Edge case:** Fewer than 3 usable selfies (after oversized image filtering) → session → `error`.
- **Edge case:** gemma-4 + kimi both fail → session → `error`.
- **Edge case:** Already `building_profile` session → 409 Conflict.
- **Huy verification:** Full round-trip with Huy's photos → text description ≥9/11 features match ground truth → reference sheet passes visual inspection.

**Verification:**
- POST /build with valid session → status poll eventually returns `ready` or `error`.
- D1 query shows identity_profiles row with description text.
- R2 has profile reference sheet (if generation succeeded).
- Error cases produce `status: 'error'` with clear error body.
- Run `codex-scripts/verify-identity-profile.ts` — all gates pass.

---

- U6. **Session State — add `profile_failed` to D1 constraint**

**Goal:** Add `profile_failed` as a valid session status value, matching the product vocabulary.

**Requirements:** R4

**Dependencies:** U5 (uses the failed state)

**Files:**
- Create: `functions/migrations/0005_add_profile_failed_status.sql`

**Approach:**
- Since SQLite does not support `ALTER TABLE ... MODIFY COLUMN` or changing a CHECK constraint, create a new migration that drops and recreates the sessions table with the updated CHECK constraint.
- Migration SQL:
  ```sql
  -- SQLite doesn't support ALTER CHECK, so recreate the table
  CREATE TABLE IF NOT EXISTS sessions_new (
    token            TEXT PRIMARY KEY,
    status           TEXT NOT NULL DEFAULT 'collecting'
                      CHECK(status IN ('collecting', 'building_profile', 'ready', 'error', 'profile_failed')),
    selfie_count     INTEGER NOT NULL DEFAULT 0,
    moodboard_count  INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT INTO sessions_new (token, status, selfie_count, moodboard_count, created_at, updated_at)
  SELECT token, status, selfie_count, moodboard_count, created_at, updated_at FROM sessions;

  DROP TABLE sessions;

  ALTER TABLE sessions_new RENAME TO sessions;

  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
  ```
- This is safe because FK constraints target sessions from uploads (not reverse), and D1 doesn't enforce FKs by default in wrangler.

**Test scenarios:**
- **Happy path:** Migration applies, sessions table has updated CHECK constraint. Existing rows preserved.
- **Edge case:** Re-running migration fails because `sessions_new` already exists → wrap in `CREATE TABLE IF NOT EXISTS` or check existence first.
- **Integration:** After migration, INSERT with status `profile_failed` succeeds.

**Verification:**
- `wrangler d1 migrations apply opinionated-imagen-db` succeeds.
- `INSERT INTO sessions (token, status) VALUES ('test', 'profile_failed')` succeeds.
- Existing session rows are preserved.

---

## System-Wide Impact

- **Interaction graph:** The profile/build endpoint now does real work. Previously a 10ms state transition, now a 5-25s background process. The frontend must continue polling `/api/profile/status` as before — no API contract change.
- **Error propagation:** Critical failures (vision model fails, D1 write fails) → `status: 'error'`. Non-critical failures (reference sheet generation fails) → `status: 'ready'` with text-only profile. Frontend handles both uniformly through the existing polling loop.
- **State lifecycle risks:** If the Worker terminates before `waitUntil` work completes, the profile is stuck in `building_profile`. Mitigation: the work is <30s, so this risk is low. The background worker (#12) will solve this properly with job retries. For now, the Creator would need to re-trigger.
- **Workers memory risk:** 10 selfies at 20MB each would consume ~200MB decompressed. Workers have 128MB. Mitigation: skip images >1MB during the download step. This caps the batch at ~10MB. Huy's test photos are 40-300KB each, well under the threshold.
- **Unchanged invariants:** All other API routes untouched. Session schema unchanged (until U6). Upload pipeline unaffected.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Workers 30s CPU timeout exceeded (gemma takes long + gpt-image-2 takes long) | gemma-4 <10s, gpt-image-2 <20s = <30s total. If exceeded, store partial results and fail gracefully. |
| Workers memory overflow from base64 conversion of large R2 images | Skip images >1MB during download. Log diagnostic. Minimum 3 usable images required. |
| AI Gateway not configured (gpt-image-2 requires gateway) | Instructions in MODELS.md and wrangler setup. The gateway `opinionated-imagen-ig` must exist in Cloudflare dashboard. |
| gemma-4 output quality is too low for the reference sheet prompt | Fallback to kimi-k2.6 (same prompt). If both fail, text-only profile. If text quality is marginal, the gpt-image-2 output will reflect that — acceptable for MVP. |
| **gemma-4 fails to produce a recognizable description of Huy** | **This is the highest-risk single point.** If the vision model can't describe a known face with 9 multi-angle photos, the architecture is wrong (e.g., the prompt needs tuning, or a different model is needed). Mitigation: test gemma-4 first (Phase 1) before building any Worker code. |
| **gpt-image-2 produces unusable multi-angle reference sheets** | Try single-portrait instead of multi-angle. Or use a different model (seedream-5-lite if multi-ref is confirmed). The verification script is the fail-fast gate. |
| `waitUntil` doesn't survive Worker scale-to-zero | On Workers paid plan, `waitUntil` keeps the isolate alive for up to 30s. If terminated, profile stuck in `building_profile` — retrigger required. |
| D1 migration 0005 fails on production | Test on local D1 first. Sessions table has no FK constraints referencing it. |

---

## Documentation / Operational Notes

- **AI Gateway setup**: `opinionated-imagen-ig` gateway must exist in Cloudflare dashboard (AI → AI Gateway → Create Gateway). Required for gpt-image-2 calls.
- **D1 migration ordering**: U1 (0004) before U6 (0005). The profile_failed status migration is separate because it's cosmetic — the system works with `'error'` in the meantime.
- **Monitoring**: After deployment, watch for sessions stuck in `building_profile` — this indicates the `waitUntil` work terminated before completion.
- **Prompt tuning**: The gemma-4 prompt and gpt-image-2 prompt are starting points. The canonical test data (Huy's photos + ground truth JSON) drives iteration. Record all prompt changes and their impact on the 11-point comparison.
- **Test data path**: `~/.agents/skills/huy-face/photos/` (9 photos) and `~/.agents/skills/huy-face/huy-facial-profile.json` (ground truth). These are referenced by `codex-scripts/verify-identity-profile.ts`.

---

## Sources & References

- **Origin document:** GitHub Issue #10 (updated) — Identity extraction
- **Related code:** `functions/routes/profile.ts`, `functions/lib/storage.ts`, `functions/lib/diagnostics.ts`, `functions/index.ts`
- **Related plans:** `docs/plans/2026-05-09-001-feat-upload-pipeline-plan.md`, `docs/plans/2026-05-09-003-feat-magic-link-auth-plan.md`
- **Models reference:** `MODELS.md`
- **Domain language:** `CONTEXT.md`
- **Test subject:** `~/.agents/skills/huy-face/` — canonical test data (photos + facial profile JSON)
- **Related issues:** #4 (upload pipeline), #12 (background worker), #13 (Style Presets)
