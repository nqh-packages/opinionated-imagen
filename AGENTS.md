# AGENTS.md

## Project Overview

Opinionated Imagen — niche AI image generation framework. First niche: Instagram content for individual creators. The product is a premium creative service, not an "AI tool." Never use "AI" or "training" language in any surface.

### Stack

| Layer | Tool |
|-------|------|
| Static pages | Astro v6.3 (Vite 8, Tailwind v4) |
| App UI | React 19 + shadcn/ui (`@base-ui/react` primitives) |
| Styling | Tailwind CSS v4 via PostCSS (`@tailwindcss/postcss`) |
| LLM-generated sandboxed code | Arrow JS Sandbox (`@arrow-js/sandbox`) |
| Backend API | Cloudflare Workers (Hono v4) |
| Database | Cloudflare D1 (SQLite) |
| Object Storage | Cloudflare R2 (S3-compatible presigned URLs) |
| AI inference | Cloudflare Workers AI (gpt-image-2 for generation) |
| Auth | Email magic links (Cloudflare Email Workers) |
| Payments | Stripe |

### Architecture

Single Cloudflare Worker serves both the frontend and API:

1. **Astro** (`astro dev`) — builds static pages + mounts React islands on interactive surfaces. Listens on port 4321 in dev. API calls are proxied to the Worker via Vite's `server.proxy` in `astro.config.mjs`.
2. **Hono Worker** (`wrangler dev`) — Cloudflare Worker at `functions/index.ts` handling all API routes. Serves static Astro assets via `ASSETS` binding in production.

In dev, the frontend runs separately (port 4321) and proxies `/api/*` to the Worker (port 8787). In production, both live on the same origin — the Worker serves `dist/` as static assets and handles `/api/*` routes.

---

## Setup Commands

```bash
# Install dependencies (pnpm required, Node >= 22.12)
pnpm install

# Start full dev environment (Astro + Worker concurrently)
pnpm dev

# Typecheck both frontend and backend
pnpm typecheck

# Build static site for production
pnpm build

# Preview production build (uses workerd runtime)
pnpm preview

# Run Worker only (standalone, for API debugging)
pnpm dev:api

# Run Astro only (standalone, for UI debugging)
pnpm dev:astro
```

---

## Project Structure

```
  astro.config.mjs         # Astro config (proxy, integrations)
  wrangler.toml            # Cloudflare Worker config (bindings, routes, assets)
  package.json             # pnpm workspace root
  tsconfig.json            # Frontend TypeScript config
  postcss.config.mjs       # PostCSS config (Tailwind v4)
  AGENTS.md                # This file
  .dev.vars                # Local dev secrets (gitignored)

  src/                     # Astro frontend
    components/ui/         # shadcn/ui components (Button, etc.)
    islands/               # React islands (OnboardApp, CreateApp, GalleryApp)
    layouts/               # Astro layouts (Base.astro)
    lib/                   # Frontend utilities (api.ts, utils.ts)
    pages/                 # Astro pages (index, onboard, create, gallery, dashboard)
    styles/                # Tailwind v4 CSS config (global.css)

  functions/               # Hono Cloudflare Worker (backend)
    index.ts               # App entry — route mounting, bindings
    tsconfig.json          # Backend TypeScript config (uses @cloudflare/workers-types)
    lib/                   # Backend utilities
      diagnostics.ts       # Structured error helpers (no console.log)
      id.ts                # UUID v4 generator
      storage.ts           # R2 S3-compatible client + presigned URL generation
    routes/                # Route handlers
      upload.ts            # POST /api/upload/presigned — batch presigned URLs + session creation
      profile.ts           # GET /api/profile/status + POST /api/profile/build — polling + build trigger
    migrations/            # D1 SQL migrations (applied via wrangler d1 migrations)
    scripts/               # One-shot setup scripts
      setup-lifecycle.ts   # R2 lifecycle rule configuration (7-day TTL on orphan uploads)

  dist/                    # Astro build output (gitignored)
  .wrangler/               # Wrangler state (gitignored)
```

---

## Domain Language

From PRODUCT.md and brand guidelines. Use consistently:

| User-Facing | Internal | Rule |
|------------|----------|------|
| Creators | — | The user. Never "user" or "customer". |
| Selfie Set | — | Onboarding selfies. Never "training data". |
| Moodboard | Style References | Photos teaching taste. |
| Identity Profile | — | Extracted face/body representation. |
| Style Profile | — | Extracted aesthetic fingerprint. |
| Scene | Preset | Curated setup JSON-defined. |
| Drop | Pack | One execution unit (Brief → Edit). |
| The Brief | Intention Confirmation | Inline-editable paragraph. |
| Process | Generate | Background batch. Never "generate" or "AI". |
| The Edit | Contact Sheet | 8-shot output of one Drop. |
| Archive | Gallery | Saved output library. |
| Monthly Access | Subscription | Recurring: 4 Drops/month. |
| Single Drop | One-off | Single purchase: 1 Drop. |
| One Turn | — | Single adjustment cycle after Brief. |

No emojis in source code. Use `@tabler/icons-react` instead.

---

## Development Workflow

### Astro Dev

```bash
pnpm dev:astro     # http://localhost:4321
```

Astro handles:
- Static page generation (`src/pages/`)
- React island mounting (islands auto-load in Astro pages)
- API proxy: `/api/*` → `http://localhost:8787`

### API Dev

```bash
pnpm dev:api       # http://localhost:8787
```

Hono Worker handles:
- All data operations (D1 queries)
- File uploads (R2 presigned URLs via S3 SDK)
- Auth (email magic links)
- AI generation (Workers AI)
- Payments (Stripe)

Some features require `--remote`:
```bash
wrangler dev functions/index.ts --remote --port=8787
```
Presigned URLs (S3 SDK) and production R2 access require remote mode.

### Both Together

```bash
pnpm dev           # Astro + Worker concurrently
```

### Full Production Preview

```bash
pnpm build && npx wrangler dev
```

Builds the static site, then runs the Worker locally with `workerd`, serving both frontend assets and API on the same port.

---

## API Routes (Backend)

All deployed at `https://opinionated-imagen.nqh.workers.dev`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/presets` | List available Scenes |
| POST | `/api/upload/presigned` | Generate batch presigned upload URLs to R2 |
| GET | `/api/profile/status?sessionToken=` | Poll session/profile build status |
| POST | `/api/profile/build` | Trigger async profile building |

All routes return structured JSON. Errors follow the diagnostic schema described under Code Style.

### Upload Pipeline

The upload flow:
1. Creator drops photos → POST `/api/upload/presigned` with `{ sessionToken?, files: [...] }`
2. Worker creates session (lazy), returns presigned PUT URLs (10 min expiry)
3. Browser uploads directly to R2 (bypasses Worker — no bandwidth cost)
4. Creator taps "I'm done" → POST `/api/profile/build`
5. Worker validates thresholds (10 selfies, 5 moodboard), transitions session to `building_profile`
6. Frontend polls GET `/api/profile/status?sessionToken=` while showing "Building your Profile..."

Counts are optimistic (incremented at presigned URL generation, not at actual upload). If the Creator generates URLs for files that don't upload, the count inflates slightly — retry by re-requesting presigned URLs.

---

## Code Style

### General Rules

- **No `console.log`** in app source. Use structured diagnostics from `functions/lib/diagnostics.ts` with `error_code`, `operation`, `context`, `retriable`, `recovery_hint`.
- **No silent `.catch(() => {})`**. Annotate with `// @silent-catch reason:` or handle visibly. Every error state needs a recovery CTA.
- **Every async island wrapped in `<ErrorBoundary>`**. Dev: red overlay + stack. Prod: graceful fallback + retry action.
- **Use `cn()` from `~/lib/utils`** (`clsx` + `tailwind-merge`). Never hand-roll.
- **No emojis** in source code. Use `@tabler/icons-react`.
- **Design token SSOT**. No raw colors (`text-[10px]`, `bg-[#ff0000]`). Use CSS variables or semantic Tailwind tokens (`bg-primary`, `text-muted-foreground`).

### Diagnostic Response Shape

All API errors return:
```json
{
  "error_code": "UPPER_SNAKE_CASE_CODE",
  "message": "Human-readable description",
  "operation": "operation_name",
  "context": { "optional": "fields" },
  "retriable": false,
  "recovery_hint": "What to do next"
}
```

### Backend Conventions

- Route handlers in `functions/routes/` mounted in `functions/index.ts` via `app.route()`.
- Shared logic lives in `functions/lib/`.
- D1 migrations in `functions/migrations/`, applied via `wrangler d1 migrations`.
- Bindings typed in Hono generic `{ Bindings: T }`.
- S3 SDK presigned URLs use `region: 'auto'` (required for R2 compatibility).
- R2 S3 credentials with `sessionToken` (temp credentials) are supported via `R2_SESSION_TOKEN` env var. Permanent R2 API tokens don't need it.

### Frontend Conventions

- React for all interactive app surfaces. Arrow JS is LLM-generated sandboxed code only.
- shadcn/ui with `@base-ui/react` primitives. No Radix.
- Mobile first. Every screen designed for phone viewport first, desktop second.
- PWA architecture from day one (manifest, service worker, offline-aware).

---

## Build and Deployment

```bash
# Build static site
pnpm build          # Outputs to dist/

# Deploy (builds Astro + deploys Worker with static assets)
pnpm build && npx wrangler deploy

# Deploy — dry run first
npx wrangler deploy --dry-run
```

### Production Architecture

The Worker serves both frontend and API on the same origin:
- `[assets]` block in `wrangler.toml` reads `dist/` — static assets served directly by Cloudflare's edge
- `main = "functions/index.ts"` handles `/api/*` routes
- Non-API, non-asset paths fall through to the Worker (currently unused — all pages are static)

### Environment Variables (Secrets)

Set via `wrangler secret put`:
```
R2_ACCESS_KEY_ID         # R2 S3-compatible API access key (permanent)
R2_SECRET_ACCESS_KEY     # R2 S3-compatible API secret key (permanent)
ACCOUNT_ID               # Cloudflare account ID (9a46bf386fe59a2ee57558506623aaac)
```

Local dev values go in `.dev.vars` (gitignored).

### D1 Migrations

```bash
# Create a new migration
npx wrangler d1 migrations create opinionated-imagen-db <description>

# Apply pending migrations (local)
npx wrangler d1 migrations apply opinionated-imagen-db

# Apply pending migrations (remote/production)
npx wrangler d1 migrations apply opinionated-imagen-db --remote

# Execute ad-hoc SQL (local)
npx wrangler d1 execute opinionated-imagen-db --local --command "SELECT * FROM sessions;"

# Execute ad-hoc SQL (remote)
npx wrangler d1 execute opinionated-imagen-db --remote --command "SELECT * FROM sessions;"
```

Migrations directory: `functions/migrations/` (configured via `migrations_dir` in `wrangler.toml`). Each migration is numbered sequentially (`0001_`, `0002_`, ...).

### R2 Bucket Management

```bash
# List buckets
npx wrangler r2 bucket list

# Create bucket
npx wrangler r2 bucket create opinionated-imagen-storage

# List objects in bucket
npx wrangler r2 object list opinionated-imagen-storage

# Generate temp S3 credentials (7-day TTL, requires R2_PARENT_KEY_ID)
# Uses temp-access-credentials API — see functions/scripts/setup-lifecycle.ts
```

The lifecycle rule `expire-orphan-uploads` deletes objects under `uploads/` prefix after 7 days (configured via Cloudflare API/dashboard).

---

## Testing

No test suite established yet.

```bash
# Run tests for frontend (expected: vitest — not yet configured)
pnpm test

# Typecheck (use this as a minimum gate)
pnpm typecheck
```

Conventions to follow when adding tests:
- **Integration tests first.** E2E for critical user journeys. Unit tests only for non-obvious logic.
- **Test order**: Integration → targeted real tests → lint/format → broader suite.
- **No coverage theater.** Test real behavior, not coverage numbers.
- Tests are code: modularity, SSOT, naming, and no-monolith rules apply.
- Reusable fixtures for IDs, locales, routes, ports, and auth identities.

---

## PR Guidelines

- **Title format**: `feat:`, `fix:`, `refactor:`, `chore:` prefix per conventional commits.
- **Include WHY** in the commit body. Reference issue numbers when applicable.
- **Run before submitting**:
  ```bash
  pnpm typecheck
  npx wrangler deploy --dry-run
  ```
- Always write tests for changed code.
- Never squash commits.

---

## Additional Notes

- Node.js >= 22.12 required (Astro v6 constraint).
- `wrangler.toml` is gitignored (contains database IDs). Template any changes in AGENTS.md or deploy scripts.
- The project root `.dev.vars` stores local-only R2 credentials (gitignored).
- Active sessions are anonymous (no auth). Future auth via email magic links links sessions to Creator accounts.
- **Brand**: All products carry a "designed by brandr" footer linking to bybrandr.com. Never use "AI" language.
- **Visual standards**: No AI-generated look. Photorealistic only. No perfection (skin texture, flyaways, natural lighting). No fake depth of field.
- **Production URL**: `https://opinionated-imagen.nqh.workers.dev`
- **Worker name**: `opinionated-imagen` (deployed via wrangler)
