# AGENTS.md

## Project

Opinionated Imagen — one codebase, many niche market products in AI image generation.

Read [PRODUCT.md](PRODUCT.md) for the product vision. Read [MODELS.md](MODELS.md) for AI model reference.

Domain language is defined below in this file — these same terms are the single source of truth for all code, API contracts, and internal docs.

### Stack

| Layer | Technology |
|-------|-----------|
| Static pages | Astro v6.3 (Vite 8, Tailwind v4 via PostCSS) |
| App UI | React 19 + shadcn/ui (`@base-ui/react` primitives) |
| Styling | Tailwind CSS v4 via `@tailwindcss/postcss` |
| Backend | Cloudflare Workers (Hono v4) |
| Database | Cloudflare D1 (SQLite) |
| Object Storage | Cloudflare R2 (S3 presigned URLs via `@aws-sdk/client-s3`) |
| AI Generation | Cloudflare AI Gateway (proxied) — `openai/gpt-image-2` |
| AI Vision/Curation | Cloudflare Workers AI (hosted) — `google/gemma-4-26b-a4b-it`, `moonshot-ai/kimi-k2.6` |
| Auth | Email magic links (Cloudflare Email Workers) |
| Payments | Stripe |
| LLM-generated sandboxed code | Arrow JS Sandbox (`@arrow-js/sandbox`) — for LLM-generated preview snippets only |

### Architecture

Single Cloudflare Worker serves both the frontend and API:

1. **Astro** (`astro dev`, port 4321) — builds static pages + mounts React islands on interactive surfaces. API calls proxied to Worker via `astro.config.mjs`.
2. **Hono Worker** (`wrangler dev`, port 8787) — all API routes. Serves `dist/` as static assets via `ASSETS` binding in production.

In dev, frontend and API run separately (proxied). In production, same origin — Worker serves static assets + handles `/api/*`.

---

## One Codebase, N Niches

The same codebase deploys into different market products. A niche is a configuration directory, not a fork.

### Directory Structure

```
/niches/{niche}/
  scenes/*.json       # Scene/Preset catalog
  config.ts           # Niche config (pricing, terms, scenes, AI)
```

### Niche Config Shape

```typescript
// /niches/ig-content/config.ts
export default {
  brand: {
    productName: "Opinionated Imagen",
  },
  scenes: [
    require("./scenes/cafe-aesthetic.json"),
  ],
  pricing: {
    single: 10,
    subscription: { name: "Monthly Access", price: 29, drops: 4 },
  },
  userFacingTerms: {
    preset: "Scene",
    intentionConfirmation: "The Brief",
    contactSheet: "The Edit",
    pack: "Drop",
    gallery: "Archive",
    styleReferences: "Moodboard",
    process: "Process",
  },
  ai: {
    gateway: "opinionated-imagen-ig",
  },
};
```

### Deployment

- The Worker reads a `NICHE` env var at runtime (e.g., `NICHE=ig-content`)
- At Astro build time, the site generates for the active niche
- Each niche deploys to its own domain via its own wrangler deploy pass
- Package.json has per-niche deploy scripts: `deploy:ig`, `deploy:headshots`

### Naming Rule

- **Internal / API / code**: CONTEXT.md terms everywhere. Never change between niches.
- **User-facing**: configured per niche via `config.ts > userFacingTerms`. The IG niche uses "Scene" for Presets, "The Brief" for Intention Confirmation, "The Edit" for Contact Sheet, "Drop" for Pack, "Moodboard" for Style References.
- **API routes stay generic**: `/api/scenes`, `/api/upload/presigned`, `/api/auth/*`. Backend returns internal terms. Frontend maps to user-facing language per niche config.

---

## Domain Language (Canonical)

These terms are the single source of truth for all code, API contracts, and internal docs. See [CONTEXT.md](CONTEXT.md) for full definitions.

| Canonical Term | Avoid |
|---------------|-------|
| Creator | user, customer, client, influencer |
| Selfie Set | training data, dataset |
| Identity Profile | model, face model, avatar |
| Style References | mood board, reference images |
| Style Profile | filter, preset style |
| Preset | template, theme, pack template |
| Prompt | prompt engineering, query |
| Product Image | prop, item, object |
| Intention | prompt, request, generation spec |
| Intention Confirmation | preview, summary, confirmation dialog |
| One Turn | iteration, round, refinement pass |
| Contact Sheet | gallery, album, batch, pack output |
| Variation | shot, frame, alternative |
| Pack | credit, session, job, generation |
| Niche | vertical, segment |

### Niche-Specific User-Facing Mappings (IG Example)

| User sees | Maps to internal |
|-----------|-----------------|
| Scene | Preset |
| The Brief | Intention Confirmation |
| The Edit | Contact Sheet |
| Drop | Pack |
| Archive | Gallery |
| Moodboard | Style References |
| Monthly Access | Subscription (4 Drops/month) |
| Single Drop | One-off pack ($10) |
| Process | Generate (background batch) |

---

## Setup Commands

```bash
# Install (pnpm required, Node >= 22.12)
pnpm install

# Full dev environment (Astro + Worker concurrently)
pnpm dev

# Typecheck
pnpm typecheck

# Build
pnpm build

# Preview production build
pnpm preview

# Worker only (API debugging)
pnpm dev:api

# Astro only (UI debugging)
pnpm dev:astro

# D1 migrations
npx wrangler d1 migrations apply opinionated-imagen-db
npx wrangler d1 migrations apply opinionated-imagen-db --remote

# Deploy
pnpm build && npx wrangler deploy
```

---

## Project Structure

```
/niches/{niche}/          # Niche configuration
  scenes/*.json           # Preset catalog (e.g., cafe-aesthetic.json)
  config.ts               # Pricing, AI defaults, brand overrides

/src                      # Astro frontend (shared across niches)
  components/ui/          # shadcn/ui components
  islands/                # React islands (OnboardApp, CreateApp, GalleryApp)
  layouts/                # Astro layouts
  lib/                    # Utilities (api.ts, utils.ts)
  pages/                  # Astro pages
  styles/                 # Tailwind CSS

/functions                # Cloudflare Worker backend
  index.ts                # App entry, route mounting, bindings
  middleware/auth.ts       # requireAuth middleware
  lib/                    # diagnostics.ts, id.ts, storage.ts, email.ts, scenes-data.ts
  routes/                 # auth.ts, upload.ts, profile.ts, scenes.ts
  migrations/             # D1 SQL migrations
  scripts/                # setup-lifecycle.ts
  AGENTS.md               # Backend-specific reference
```

See `functions/AGENTS.md` for backend-specific docs (route structure, D1 schema, binding types, R2 setup, error handling patterns).

---

## API Routes

Deployed at `https://opinionated-imagen.nqh.workers.dev`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/scenes` | List available Presets for the active niche |
| POST | `/api/upload/presigned` | Batch presigned upload URLs to R2 |
| GET | `/api/profile/status?sessionToken=` | Poll session/profile build status |
| POST | `/api/profile/build` | Trigger async profile building |
| POST | `/api/auth/magic-link` | Send magic link (rate-limited 3/email/hour) |
| GET | `/api/auth/verify?token=` | Validate token, issue session cookie |
| GET | `/api/auth/me` | Return authenticated Creator or 401 |
| POST | `/api/auth/logout` | Clear session cookie |

All routes return structured JSON. Errors follow the diagnostic schema from `functions/lib/diagnostics.ts`.

---

## Code Style

- **No `console.log`**. Use structured diagnostics from `functions/lib/diagnostics.ts` (`error_code`, `operation`, `context`, `retriable`, `recovery_hint`).
- **No silent `.catch(() => {})`**. Annotate with `// @silent-catch reason:` or handle visibly.
- **Every async island wrapped in `<ErrorBoundary>`**.
- **Use `cn()` from `~/lib/utils`** (`clsx` + `tailwind-merge`). Never hand-roll.
- **No emojis** in source code. Use `@tabler/icons-react`.
- **Design token SSOT**. No raw colors in JSX. Use CSS variables or semantic Tailwind tokens.
- **Mobile first.** Every screen designed for phone viewport first, desktop second.
- **PWA architecture** from day one.

---

## Big Fucking No's

These are product-level visual standards. Non-negotiable.

- **No AI-generated look.** None. If it reads as AI to a casual viewer, it failed. Every output must pass the "is this a photo?" test.
- **Photorealistic by default.** Every image should look like it came from an iPhone or a mirrorless camera. Natural lens behavior, natural light falloff, natural skin texture.
- **No perfection.** Skin has pores. Hair has flyaways. Light has uneven color temp. Backgrounds are slightly out of focus, not razor-sharp CGI. Clothing wrinkles. Imperfection is signal.
- **No uncanny smoothness.** Plastic skin, oversized eyes, symmetrical faces, impossible jawlines — all rejected. The model should generate humans who look real, not catalog models.
- **No fake depth of field.** Bokeh should look like actual optics, not Gaussian blur layers. Wrong blur shape is a tell.
- **No composited-on-background feeling.** The subject and the scene must feel like they were in the same physical space. No halo edges, no mismatched shadows, no floating feeling.
- **No generic stock-photo posing.** The variation plan should produce candid, moment-like shots — not "woman smiling at camera in front of blank wall" energy.
- **No oversaturation or hyper-clarity.** Film grain is fine. Slight softness is fine. Everything does not need to glow.

The target aesthetic: a friend took this photo with their phone. Not a studio. Not a renderer. A photo.

---

## Prompting References

- [OpenAI Image Generation Prompting Guide](https://github.com/openai/openai-cookbook/blob/main/examples/multimodal/image-gen-models-prompting-guide.ipynb) — best practices for GPT image models, photorealism patterns, multi-image editing
- [GPT Image 2 Skill](https://github.com/wuyoscar/gpt_image_2_skill) — curated prompt gallery, agentic skill, CLI tooling for gpt-image-2

---

## Testing

```bash
pnpm test    # vitest (configured at root)
pnpm typecheck
```

E2E auth test at `tests/e2e/auth-e2e.mjs` using `agent-mailbox` CLI. Integration tests hit real Hono routes with mocks when possible. No coverage theater — test real behavior.

---

## Owners

- Huy: product, architecture
- Dani: UI, UX
