# AGENTS.md — functions/

Cloudflare Worker backend (Hono v4 + D1 + R2 + Workers AI).

## Stack

| Layer | Tool |
|-------|------|
| Runtime | Cloudflare Workers (`workerd`) |
| Framework | Hono v4 |
| Database | Cloudflare D1 (SQLite) |
| Object Storage | Cloudflare R2 (S3-compatible) |
| AI Inference | Cloudflare Workers AI |
| Auth (future) | Cloudflare Email Workers (magic links) |
| Payments (future) | Stripe |
| S3 SDK (presigned URLs) | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` |
| TypeScript | `@cloudflare/workers-types` v4 |

## Dev

```bash
# Start API server (port 8787)
pnpm dev:api

# Start with remote R2 access (needed for presigned URLs)
wrangler dev functions/index.ts --remote --port=8787

# Typecheck
npx tsc --noEmit -p functions/tsconfig.json

# Deploy dry-run
npx wrangler deploy --dry-run

# Deploy
npx wrangler deploy
```

## D1 Migrations

Migrations live in `functions/migrations/`. Applied in order (`0001_`, `0002_`, ...).

```bash
# Create new migration
npx wrangler d1 migrations create opinionated-imagen-db <description>

# Apply locally
npx wrangler d1 migrations apply opinionated-imagen-db

# Apply to production
npx wrangler d1 migrations apply opinionated-imagen-db --remote

# Ad-hoc SQL
npx wrangler d1 execute opinionated-imagen-db --local --command "SELECT * FROM sessions;"
```

## Route Structure

Routes are registered in `functions/index.ts` via `app.route()`.
Each route group is a separate Hono app in `functions/routes/`.

### Current Routes

| Method | Path | File | Description |
|--------|------|------|-------------|
| GET | `/api/health` | `index.ts` inline | Health check |
| GET | `/api/presets` | `index.ts` inline | List available Scenes |
| POST | `/api/upload/presigned` | `routes/upload.ts` | Batch presigned R2 upload URLs |
| GET | `/api/profile/status` | `routes/profile.ts` | Poll session/profile build status |
| POST | `/api/profile/build` | `routes/profile.ts` | Trigger async profile building |

### Adding a New Route

1. Create `functions/routes/<name>.ts` with a Hono app
2. Export it as default
3. Import + mount in `functions/index.ts`: `app.route('/api/<name>', routeApp)`
4. Extend `Bindings` type in `index.ts` if new env vars/bindings are needed

## D1 Schema

### `sessions`

| Column | Type | Notes |
|--------|------|-------|
| `token` | TEXT PK | UUID v4 |
| `status` | TEXT | `collecting` / `building_profile` / `ready` / `error` |
| `selfie_count` | INTEGER | Optimistic count (incremented on presigned URL generation) |
| `moodboard_count` | INTEGER | Same |
| `created_at` | TEXT | ISO 8601, auto-set |
| `updated_at` | TEXT | ISO 8601, auto-set |

### `uploads`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID v4 |
| `session_token` | TEXT FK | → sessions.token |
| `upload_type` | TEXT | `selfie` or `moodboard` |
| `r2_key` | TEXT | Full R2 object key |
| `original_filename` | TEXT | Original filename from Creator |
| `content_type` | TEXT | MIME type |
| `size_bytes` | INTEGER | File size in bytes |
| `created_at` | TEXT | ISO 8601, auto-set |

## Error Handling

**No `console.log`.** All errors return structured JSON via `functions/lib/diagnostics.ts`:

```typescript
{
  error_code: "UPPER_SNAKE_CASE",
  message: "Human-readable description",
  operation: "operation_name",
  context?: { "optional": "fields" },
  retriable: false,
  recovery_hint: "What to do next"
}
```

Available error builders:
- `badRequest(code, message, context?)` — 400/422, invalid input
- `notFound(code, message, context?)` — 404, resource missing
- `conflict(code, message, context?)` — 409, invalid state transition
- `preconditionFailed(code, message, context?)` — 422, thresholds not met
- `serviceUnavailable(code, message, context?)` — 503, downstream failure, `retriable: true`

## R2 + S3 SDK

**R2 access keys** must be set as secrets (production: `wrangler secret put`; local: `.dev.vars`):
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `ACCOUNT_ID`

**Presigned URLs**: Generated in `functions/lib/storage.ts`.
- S3Client must use `region: 'auto'` (required for R2 — without it, all S3 SDK calls fail).
- Presigned URLs do not work in local `wrangler dev` without `--remote`.
- Default expiry: 10 minutes. Returned alongside each URL so the frontend can track and refresh.
- Uploads go directly to R2 (browser → R2, one hop). Worker never sees file data.
- Key format: `uploads/{sessionToken}/{type}/{timestamp}-{random6}.{ext}`

**Uncompleted multipart uploads** auto-abort after 7 days. Orphan upload lifecycle is managed by a bucket-level lifecycle rule (prefix: `uploads/`, expiry: 7 days).

## Bindings

```typescript
type Bindings = {
  DB: D1Database;                          // opinionated-imagen-db
  STORAGE: R2Bucket;                       // opinionated-imagen-storage
  AI: Ai;                                  // Workers AI
  EMAIL: SendEmail;                         // Email Workers (future)
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  ACCOUNT_ID: string;
};
```

## Domain Language (Backend-Specific)

- **Creator** — never "user" or "customer"
- **Selfie Set** — never "training data"
- **Moodboard / Style References** — photos teaching taste
- **Profile** — not "model"
- **Process** — not "generate"
- **Session** — anonymous, pre-auth identity (UUID in localStorage)
- **Drop** — one execution unit (one Brief → one Edit of 8 shots)

## Identity Extraction Engine

The identity extraction pipeline lives in `lib/vision.ts` and `lib/prompts.ts`. It runs in the `POST /api/profile/build` handler via `c.executionCtx.waitUntil()` — the handler returns immediately, and extraction continues in the background. The frontend polls `GET /api/profile/status` until `status: 'ready'`.

### Pipeline

1. `listSelfieObjects(sessionToken, STORAGE)` — lists R2 objects at `uploads/{sessionToken}/selfie/`
2. `downloadAsBase64(r2Object, STORAGE)` — downloads and converts to base64 (skips >1MB images as memory safeguard)
3. `extractIdentity(env, base64Photos)` — calls `@cf/google/gemma-4-26b-a4b-it` with vision (OpenAI-compatible `image_url` format, not `source` format)
4. Writes text description to D1 `identity_profiles` table
5. `generateReferenceSheet(env, description, sessionToken)` — calls `openai/gpt-image-2` via AI Gateway (requires `opinionated-imagen-ig` gateway with OpenAI API key configured)
6. Reference sheet is non-critical — pipeline degrades gracefully to text-only

### Key Files

| File | Purpose |
|------|---------|
| `lib/prompts.ts` | Production identity extraction prompt + reference sheet prompt builder |
| `lib/vision.ts` | `extractIdentity`, `generateReferenceSheet`, `buildIdentityProfile` |
| `routes/profile.ts` | Status polling + build trigger with extraction wired in |

### Model Names (Workers AI)

Model names in `env.AI.run()` use `@cf/<provider>/<model>` format, NOT the shorthand format:
- ✅ `'@cf/google/gemma-4-26b-a4b-it'` (vision via `messages` with `image_url`)
- ✅ `'@cf/moonshotai/kimi-k2.6'` (fallback)
- ✅ `'openai/gpt-image-2'` (proxied via AI Gateway, needs gateway config)

### Vision Input Format

Do NOT use the `source` format (`type: 'base64'`, `media_type`, `data`). Use the OpenAI-compatible `image_url` format:
```typescript
{ type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } }
```

## Testing

No test framework installed yet. When adding tests:

```bash
# Expected test framework: vitest or mocha
# Tests go in functions/__tests__/ or colocated
```

Test patterns to follow:
- Integration tests first. Hit the real Hono routes with mock D1 + storage.
- Test handlers in isolation by constructing Hono `c` objects.
- Use the diagnostic error builders to assert error shapes.
- Tests are code: reusable fixtures for session tokens, file lists, and API payloads.

### Identity Profile Verification Gate

The product requires persistent character identity across generations. The canonical test subject for verifying identity extraction is the product creator (Huy).

- **Source photos:** `~/.agents/skills/huy-face/photos/` (9 photos, multiple angles/lighting)
- **Ground truth:** `~/.agents/skills/huy-face/huy-facial-profile.json` (11 tracked features)
- **Verification script:** `functions/scripts/verify-identity-profile.ts` (gitignored)
- **Gate:** ≥9/11 features must match ground truth
- **Reference sheet gate:** 4/4 visual criteria (same person, consistent angles, would stranger agree)

Run `npx tsx core/functions/scripts/verify-identity-profile.ts` after any prompt or model change to verify identity persistence.

## wrangler.toml (gitignored)

The `wrangler.toml` is gitignored (contains D1 database IDs). When changing bindings, update:
1. `wrangler.toml` locally
2. The `Bindings` type in `functions/index.ts`
3. This AGENTS.md if it affects route conventions

## Secrets

| Secret | Source | Used By |
|--------|--------|---------|
| `R2_ACCESS_KEY_ID` | R2 API Token (Object Read & Write) | `lib/storage.ts` |
| `R2_SECRET_ACCESS_KEY` | R2 API Token | `lib/storage.ts` |
| `ACCOUNT_ID` | Cloudflare Dashboard → R2 Overview | `lib/storage.ts` (S3 endpoint) |

Set via `wrangler secret put <name>`. Local values go in `.dev.vars` at project root.
