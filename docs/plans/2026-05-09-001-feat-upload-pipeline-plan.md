---
title: Upload Pipeline — Selfies + Moodboard → Profile
type: feat
status: active
date: 2026-05-09
---

# Upload Pipeline — Selfies + Moodboard → Profile

## Overview

Zero-friction onboarding: the Creator drops 10+ selfies and 5+ Moodboard photos. The system uploads directly to R2 via presigned URLs and triggers async profile building. No auth — a session token in localStorage identifies the Creator. This is the activation funnel: photos land before any friction.

---

## Problem Frame

Onboarding is the product's activation funnel. Every step between "open the page" and "photos are in the cloud" is a drop-off risk. The current backend has a health check and a preset list — no upload infrastructure exists. The upload pipeline must:

1. Let photos land before the Creator commits to anything (no account, no email)
2. Accept two distinct categories: Selfie Set (identity) and Moodboard (aesthetic taste)
3. Store files in R2 with a session-scoped key scheme so orphan cleanup is trivial
4. Expose a progress-driven polling state so the frontend can show "Building your Profile..."
5. Never use "AI" or "training" language in any surface

---

## Requirements Trace

- R1. `POST /api/upload/presigned` returns R2 presigned PUT URLs for a batch of files
- R2. Frontend: drag/drop dropzone for Selfie Set + Moodboard (separate zones)
- R3. Thumbnail grid appears as photos upload
- R4. Minimum thresholds: 10 selfies, 5 moodboard (gentle nudge, not hard block)
- R5. "Building your Profile..." screen with async status polling
- R6. Session token (UUID) in localStorage, passed to all API calls
- R7. Orphaned uploads: TTL 7 days via R2 lifecycle rule
- R8. No "AI" language anywhere

---

## Scope Boundaries

- **Backend only.** This plan covers the Worker routes, D1 schema, R2 storage, and S3 presigned URL setup. The React frontend (dropzone, thumbnail grid, profile-build screen, session token bootstrap) is a separate implementation unit or issue.
- **Async profile build is scaffolding only.** The `POST /api/profile/build` triggers state transition and returns a status. The actual vision model extraction (Identity Profile / Style Profile construction) is deferred — a future issue hooks into the "building_profile" → "ready" transition.
- **No file validation server-side.** Browser validates type/size client-side. R2 receives whatever the presigned URL allows. Malicious uploads are safe because R2 does not execute content.
- **No thumbnailing/variant generation.** R2 stores originals only.
- **Auth remains deferred.** Session token is anonymous. Magic link comes later at first Drop creation.

---

## Context & Research

### Relevant Code and Patterns

- **Existing Worker** (`functions/index.ts`): Hono app with CORS, health check, presets endpoint. Single-file, no route splitting. Bindings: `DB` (D1), `STORAGE` (R2), `AI`, `EMAIL`.
- **Wrangler config** (`wrangler.toml`): `compatibility_date = "2025-04-01"`, `nodejs_compat` flag. Bucket name: `opinionated-imagen-storage`. D1 database: `opinionated-imagen-db`.
- **Domain language** (from AGENTS.md): "Creator" (not user), "Selfie Set" (not training data), "Moodboard" (not style refs), "Profile" (not model), "Process" (not generate).
- **Existing patterns**: No background jobs, queues, or async processing established yet. The async build trigger will be a simple status update — no queue infrastructure needed for v1.

### External References

- **R2 presigned URLs**: S3 SDK with `region: 'auto'`, endpoint `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`. Uses `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. See Cloudflare skill `references/r2/patterns.md` (Client-Side Uploads) and `references/r2/api.md` (Presigned URLs).
- **R2 gotchas**: Must set `region: 'auto'` or S3 SDK calls fail. Presigned URLs do not work in local `wrangler dev` — must use `--remote`. Presigned URL expiry returned to client alongside URL. Stream uploads need known content-length.
- **R2 lifecycle rules**: Configured via S3 SDK `PutBucketLifecycleConfigurationCommand` or dashboard. Prefix-scoped expiration. Deleting objects under a prefix is the native orphan-cleanup mechanism.

---

## Key Technical Decisions

- **Presigned URLs (S3 SDK) instead of Worker proxy**: The Worker generates signed PUT URLs the browser uses to upload directly to R2. Zero Worker bandwidth for uploads. Browser → R2 in one hop instead of browser → Worker → R2. The Worker only spends CPU generating short strings.
- **Session lazily created at first presigned call**: No dedicated session creation endpoint. Frontend calls presigned with or without a session token. If no token, Worker creates a session row and returns the token. One less round trip, one less frontend orchestration step.
- **Explicit build trigger instead of auto-detect**: Frontend calls `POST /api/profile/build` when the Creator taps "I'm done uploading". This avoids race conditions from chunked uploads and gives the Creator control over when processing starts.
- **R2 lifecycle rule for orphans instead of Worker cron**: `uploads/` prefix — 7-day TTL. Zero code, zero cost, zero scheduling. Configurable via dashboard or S3 SDK. Deletes anything that hasn't completed onboarding in 7 days.

---

## Open Questions

### Resolved During Planning

- Min thresholds: 10 selfies, 5 moodboard. Hard reject at `POST /api/profile/build` time with 422 + threshold counts so UI can show a gentle nudge. Retry allowed.
- File size limit: 20MB per image, enforced at the presigned URL creation (reject files exceeding limit before generating URL). Smaller files upload faster and reduce R2 storage costs.

### Deferred to Implementation

- Exact S3 SDK version compatibility with workerd runtime — verify `@aws-sdk/client-s3` works with `nodejs_compat` at `compatibility_date = "2025-04-01"`.
- D1 migration tooling — first migration for this project, may need to establish conventions (manual SQL vs wrangler d1 migrations).

---

## Implementation Units

- U1. **D1 Schema + Migration Setup**

**Goal:** Create the `sessions` and `uploads` tables with initial migration infrastructure.

**Requirements:** R1, R6, R7

**Dependencies:** None

**Files:**
- Create: `functions/migrations/001_create_sessions_and_uploads.sql`
- Create: `functions/lib/id.ts`
- Modify: `wrangler.toml` (if D1 database ID needs setting)

**Approach:**
- Use `wrangler d1 migrations` for first migration — establishes the convention for the project.
- `sessions` table: token (UUID PK), status enum (`collecting`, `building_profile`, `ready`, `error`), selfie_count, moodboard_count, created_at, updated_at.
- `uploads` table: id (UUID PK), session_token (FK → sessions.token), upload_type (`selfie` | `moodboard`), r2_key, original_filename, content_type, size_bytes, created_at.
- `lib/id.ts`: UUID v4 generator using `crypto.randomUUID()` (available via `nodejs_compat`).

**Test scenarios:**
- **Happy path:** Running the migration creates both tables with correct columns and constraints.
- **Edge case:** Re-running the migration is idempotent (wrangler tracks applied migrations).
- **Integration:** A session row can be inserted and then referenced by an upload row; deleting a session cascades to its uploads (or is blocked by FK).

**Verification:**
- `wrangler d1 migrations apply opinionated-imagen-db` succeeds.
- Schema queries against the live D1 database show both tables.
- A test insert/select round-trip works for both tables.

---

- U2. **S3 SDK Setup + Presigned URL Endpoint**

**Goal:** Add S3 SDK dependencies, configure R2 S3-compatible client, implement `POST /api/upload/presigned`.

**Requirements:** R1, R6

**Dependencies:** U1 (schema exists for session creation, but session logic could be mocked — actually U1 is a hard dependency because U2 needs to write session rows)

**Files:**
- Create: `functions/lib/storage.ts` — S3Client factory, presigned URL generation
- Create: `functions/lib/diagnostics.ts` — structured error/diagnostic helpers
- Create: `functions/routes/upload.ts` — presigned route handler
- Modify: `functions/index.ts` — mount upload routes, add S3 env vars to Bindings type
- Modify: `package.json` — add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`
- Create: `.dev.vars` — local env vars template (gitignored, not committed)

**Approach:**
- `storage.ts` creates an S3Client lazily with `region: 'auto'`, R2 endpoint, and credentials from env vars. Exports `generatePresignedUploadUrl(key, contentType, sizeLimitBytes)`.
- `diagnostics.ts`: structured error objects with `error_code`, `operation`, `context`, `retriable`, `recovery_hint`. No console.log. Maps to `c.json(statusCode, { error: ... })` for API responses.
- `routes/upload.ts`: `POST /api/upload/presigned` handler.
  - Accepts `body: { sessionToken?: string, files: { uploadType, filename, contentType }[] }`.
  - Validates each file: contentType must be image/*, estimated size under 20MB.
  - If no sessionToken, creates new session row in D1 and returns token.
  - If sessionToken provided, validates session exists and is in `collecting` status.
  - Generates R2 key per file: `uploads/{sessionToken}/{uploadType}/{timestamp}-{random6}.{ext}`.
  - Calls `getSignedUrl(s3, PutObjectCommand, { expiresIn: 600 })` for each file.
  - Returns `{ sessionToken, uploads: [{ id, presignedUrl, r2Key, expiresAt }] }`.
- `index.ts`: Extend `Bindings` type with `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `ACCOUNT_ID`. Mount `/api/upload` routes.

**Patterns to follow:**
- Existing `index.ts` for route pattern (Hono `c.json()` responses, generic CORS)
- R2 skill pattern for S3Client setup: `region: 'auto'`, endpoint construction, credential env vars

**Test scenarios:**
- **Happy path (new session):** POST with no sessionToken and valid files array → returns 200 with sessionToken + presigned URLs.
- **Happy path (existing session):** POST with valid sessionToken → returns same token + new presigned URLs; D1 selfie_count or moodboard_count incremented.
- **Edge case:** POST with empty files array → returns 200 with empty uploads array, session still created if new.
- **Edge case:** POST with non-image contentType → returns 422 with validation error.
- **Edge case:** POST with sessionToken belonging to a session that is not in "collecting" status → returns 409 Conflict.
- **Edge case:** File size exceeds 20MB limit → returns 422.
- **Error path:** S3 SDK call fails (invalid credentials, network) → returns 503 with structured diagnostic and retriable=true.

**Verification:**
- `wrangler dev --remote` with test curl/requests returns presigned URLs.
- `curl -X PUT <presignedUrl> -H "Content-Type: image/jpeg" --data-binary @test.jpg` returns 200 and object appears in R2.
- Session row written to D1 with correct token.

---

- U3. **Status Polling + Profile Build Trigger**

**Goal:** Implement `GET /api/profile/status` and `POST /api/profile/build` endpoints.

**Requirements:** R4, R5

**Dependencies:** U1, U2 (U2 created session rows and presigned URLs; U3 builds on the session lifecycle)

**Files:**
- Create: `functions/routes/profile.ts` — status polling + build trigger handlers
- Modify: `functions/index.ts` — mount profile routes

**Approach:**
- `GET /api/profile/status?sessionToken={token}`:
  - Look up session by token.
  - Return `{ status, selfieCount, moodboardCount, thresholds: { selfies: 10, moodboard: 5 }, errorMessage? }`.
  - If session not found → 404.
- `POST /api/profile/build { sessionToken }`:
  - Validate session exists and is in `collecting` status.
  - Enforce minimum thresholds: selfieCount < 10 → 422 with `{ error: "not enough selfies", needed: 10, current: selfieCount }`. Same for moodboard < 5.
  - Update session status to `building_profile`, set `updated_at`.
  - Return `{ status: "building_profile" }`.
  - (Future: this endpoint will also queue the vision model extraction job.)

**Patterns to follow:**
- Same structured diagnostics pattern from U2's `diagnostics.ts`.
- Same Hono route mounting pattern from U2.

**Test scenarios:**
- **Happy path:** Session with 10+ selfies and 5+ moodboard → POST to build → returns 200 with `building_profile`. Subsequent GET returns `building_profile`.
- **Edge case (below threshold):** Session with 6 selfies, 5 moodboard → POST to build → returns 422 with specific counts and required minimums.
- **Edge case (already building):** Session with status `building_profile` → POST to build again → returns 409 Conflict.
- **Edge case (not found):** GET or POST with a token that has no session → returns 404.
- **Error path:** D1 query fails → returns 503 with structured diagnostic.

**Verification:**
- curl POST with valid session and sufficient uploads → session status transitions.
- curl POST with insufficient uploads → 422 with clear error body.
- curl GET after transition → status reflects new state.

---

- U4. **R2 Lifecycle Rule + Orphan Cleanup**

**Goal:** Configure 7-day TTL on `uploads/` prefix and verify orphan cleanup behavior.

**Requirements:** R7

**Dependencies:** None (can be done anytime the R2 bucket exists)

**Files:**
- Modify: `functions/lib/storage.ts` — add lifecycle configuration helper
- Create: `functions/scripts/setup-lifecycle.ts` or use manual S3 SDK call via dashboard

**Approach:**
- Option A (preferred): Use Cloudflare dashboard — navigate to R2 bucket → Lifecycle Rules → add rule: prefix `uploads/`, expiration 7 days. Zero code, zero S3 SDK calls.
- Option B (infra-as-code): Add a setup script using S3 SDK `PutBucketLifecycleConfigurationCommand` to apply the rule programmatically. Useful if infra-as-code is established later, but unnecessary for v1.
- Verify by checking bucket lifecycle configuration after applying.

**Test scenarios:**
- **Happy path:** Lifecycle rule applied with correct prefix and 7-day expiration.
- **Edge case:** Objects older than 7 days that are in `uploads/` — they will be deleted. Active onboarding sessions that take < 7 days are unaffected.

**Verification:**
- R2 bucket lifecycle configuration shows the rule with correct prefix and days.
- Object uploaded then manually checked after 7+ days (or verify via `head` that lifecycle is configured correctly).

---

## System-Wide Impact

- **Interaction graph:** The upload routes are called before any auth exists. Future auth (magic link) must coexist with anonymous session tokens — the session becomes a pre-auth identity that later links to a Creator account.
- **Error propagation:** All routes return structured errors (`error_code`, `message`, `retriable`). Frontend ErrorBoundary wraps all async islands. 4xx errors are user-actionable (invalid input, session expired), 5xx are retriable (infra failure).
- **State lifecycle risks:** Sessions in `collecting` status are orphan-prone. The 7-day lifecycle rule handles R2 cleanup, but D1 session and upload rows are not cleaned up by that rule. For v1 this is acceptable — D1 storage is cheap and low-volume. Future improvement: add a D1 cleanup query or cron that deletes sessions older than 7 days with status `collecting`.
- **Unchanged invariants:** Health check endpoint untouched. Presets endpoint untouched. All existing API surfaces remain unchanged and backward-compatible.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| S3 SDK doesn't work with workerd runtime / `nodejs_compat` | Test early with `wrangler dev --remote`. Fallback: use Workers R2 binding to accept uploads through the Worker (bandwidth cost accepted). |
| R2 access keys not set correctly | Document `.dev.vars` template. Add clear error diagnostic when env vars are missing. |
| Presigned URLs expire before frontend finishes uploading (default 10 min) | Return `expiresAt` alongside each URL so frontend can pre-fetch new batch if needed. Session tokens survive URL expiry — Client can call presigned again. |
| Session token collision (UUID v4) | Negligible (2^122 unique values). No mitigation needed. |
| Creator uploads non-image files despite client validation | S3 SDK presigned URL has no content-type enforcement. R2 stores them harmlessly. Vision model later fails gracefully. |

---

## Documentation / Operational Notes

- **`.dev.vars` template**: Must include `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `ACCOUNT_ID`. Document that production values are set via `wrangler secret put`.
- **Lifecycle rule**: Configure via Cloudflare dashboard at Bucket → Settings → Lifecycle Rules. Prefix: `uploads/`, expiration: 7 days. Not automation scripted yet — infra-as-code improvement deferred.
- **D1 migrations**: Establish convention: `wrangler d1 migrations create opinionated-imagen-db <name>`. Store SQL in `functions/migrations/`. Apply with `wrangler d1 migrations apply opinionated-imagen-db`.

---

## Sources & References

- **Origin document:** GitHub Issue #4 — Upload pipeline: selfies + Moodboard → Profile
- **R2 API & patterns:** `references/r2/api.md`, `references/r2/patterns.md`, `references/r2/gotchas.md` (Cloudflare skill)
- **Existing patterns:** `functions/index.ts` for Hono route conventions, `wrangler.toml` for binding config
- **Domain language:** `AGENTS.md`, `PRODUCT.md`
