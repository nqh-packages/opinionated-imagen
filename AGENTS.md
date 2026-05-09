# AGENTS.md

## Project Overview

Opinionated Imagen — niche AI image generation framework. First niche: Instagram content for individual creators. The product is a premium creative service, not an "AI tool." Never use "AI" or "training" language in any surface.

### Stack

| Layer | Tool |
|-------|------|
| Static pages | Astro v6.3 (Vite 7, Tailwind v4) |
| App UI | React 19 + shadcn/ui (`@base-ui/react` primitives) |
| Styling | Tailwind CSS v4 (CSS-first config via `@theme`) |
| LLM-generated sandboxed code | Arrow JS Sandbox (`@arrow-js/sandbox`) |
| Backend API | Cloudflare Workers (Hono v4) |
| Database | Cloudflare D1 (SQLite) |
| Object Storage | Cloudflare R2 |
| AI inference | Cloudflare Workers AI (gpt-image-2 for generation) |
| Auth | Email magic links (Cloudflare Email Workers) |
| Payments | Stripe |

### Architecture

Two parallel runtimes:

1. **Astro** (`astro dev`) — serves static pages + mounts React islands on interactive surfaces. Listens on port 4321. API calls are proxied to the backend via Vite's `server.proxy` in `astro.config.mjs`.
2. **Hono Worker** (`wrangler dev`) — standalone Cloudflare Worker at `functions/index.ts` handling all data, auth, AI generation, and upload. Listens on port 8787.

The frontend talks to the Worker via `fetch('/api/...')` in dev (proxied) and via the same origin in production.

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

# Preview production build
pnpm preview

# Run Worker only (standalone, for API debugging)
pnpm dev:api

# Run Astro only (standalone, for UI debugging)
pnpm dev:astro
```

---

## Project Structure

```
/Volumes/BIWIN/CODES/opinionated-imagen
  astro.config.mjs        # Astro config (proxy, integrations, Tailwind)
  wrangler.toml            # Cloudflare Worker config (bindings, routes)
  package.json             # pnpm workspace root
  tsconfig.json            # Frontend TypeScript config
  AGENTS.md                # This file

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
- File uploads (R2 presigned URLs)
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

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/presets` | List available Scenes |
| POST | `/api/upload/presigned` | Generate batch presigned upload URLs to R2 |
| GET | `/api/profile/status?sessionToken=` | Poll session/profile build status |
| POST | `/api/profile/build` | Trigger async profile building |

All routes return structured JSON. Errors follow the diagnostic schema described under Code Style.

---

## Code Style

### General Rules (from AGENTS.md)

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

- Route handlers in `functions/routes/` are mounted in `functions/index.ts` via `app.route()`.
- Shared logic lives in `functions/lib/`.
- D1 migrations in `functions/migrations/`, applied via `wrangler d1 migrations`.
- Bindings are typed in the Hono generic `{ Bindings: T }`.
- S3 SDK presigned URLs use `region: 'auto'` (required for R2 compatibility).

### Frontend Conventions

- React for all interactive app surfaces. Arrow JS is LLM-generated sandboxed code only.
- shadcn/ui with `@base-ui/react` primitives. No Radix.
- Mobile first. Every screen designed for phone viewport first, desktop second.
- PWA architecture from day one (manifest, service worker, offline-aware).

---

## Testing

No test suite established yet. When adding tests:

```bash
# Run tests for frontend (expected: vitest)
pnpm test

# Run tests for functions (expected: vitest or mocha)
# No testing framework installed yet for the backend
```

Conventions from project AGENTS.md:
- **Integration tests first.** E2E for critical user journeys. Unit tests only for non-obvious logic.
- **Test order**: Integration → targeted real tests → lint/format → broader suite
- **No coverage theater.** Test real behavior, not coverage numbers.
- Tests are code: modularity, SSOT, naming, and no-monolith rules apply.
- Reusable fixtures for IDs, locales, routes, ports, and auth identities.

---

## Build and Deployment

```bash
# Build static site
pnpm build     # Outputs to dist/

# Preview build
pnpm preview

# Deploy Worker (requires wrangler authentication)
pnpm wrangler deploy

# Deploy Worker — dry run first
pnpm wrangler deploy --dry-run
```

### Environment Variables (Secrets)

Set via `wrangler secret put`:
```
R2_ACCESS_KEY_ID         # R2 S3-compatible API access key
R2_SECRET_ACCESS_KEY     # R2 S3-compatible API secret key
ACCOUNT_ID               # Cloudflare account ID
```

Local dev values go in `.dev.vars` (gitignored).

---

## D1 Migrations

```bash
# Create a new migration
npx wrangler d1 migrations create opinionated-imagen-db <description>

# Apply pending migrations (local)
npx wrangler d1 migrations apply opinionated-imagen-db

# Apply pending migrations (remote/production)
npx wrangler d1 migrations apply opinionated-imagen-db --remote

# Execute ad-hoc SQL
npx wrangler d1 execute opinionated-imagen-db --local --command "SELECT * FROM sessions;"
```

Migrations live in `functions/migrations/`. Each migration is numbered sequentially (`0001_`, `0002_`, ...).

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
- wrangler.toml is gitignored (contains database IDs). Template any changes in AGENTS.md or deploy scripts.
- The project root `.dev.vars` stores local-only R2 credentials (gitignored).
- Active sessions are anonymous (no auth). Future auth via email magic links links sessions to Creator accounts.
- **Brand**: All products carry a "designed by brandr" footer linking to bybrandr.com. Never use "AI" language.
- **Visual standards**: No AI-generated look. Photorealistic only. No perfection (skin texture, flyaways, natural lighting). No fake depth of field.
