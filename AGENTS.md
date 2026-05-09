# AGENTS.md

## Project

Opinionated Imagen — a framework for creating niche market products in AI image generation. One engine, many products.

Read [PRODUCT.md](PRODUCT.md) for the framework vision. Read [CONTEXT.md](CONTEXT.md) for the canonical domain language. Read [MODELS.md](MODELS.md) for AI model reference.

## Project Structure

```
core/                       ← shared engine
  src/                      ← Astro frontend
    components/ui/          ← shadcn/ui components
    islands/                ← React islands (OnboardApp, CreateApp, GalleryApp)
    layouts/                ← Astro layouts
    lib/                    ← Utilities (api.ts, utils.ts)
    pages/                  ← Astro pages
    styles/                 ← Tailwind CSS
  functions/                ← Cloudflare Worker backend
    index.ts                ← App entry, route mounting
    middleware/auth.ts       ← requireAuth
    lib/                    ← diagnostics, id, storage, email, scenes-data
    routes/                 ← auth, upload, profile, scenes
    migrations/             ← D1 SQL migrations
    scripts/                ← setup-lifecycle
    AGENTS.md               ← backend-specific reference
niches/
  ig-content/               ← first market product
    scenes/*.json           ← Scene definitions
    PRODUCT.md              ← product vision for this niche
    CONTEXT.md              ← user-facing term aliases
    brand/                  ← design tokens, copy
  headshots/                ← future
  dating/                   ← future
AGENTS.md                   ← this file — describes the framework
CONTEXT.md                  ← canonical domain language (shared)
MODELS.md                   ← shared AI model decisions
PRODUCT.md                  ← framework vision (not niche-specific)
```

## How to Create a New Niche

1. Copy the scene JSON files from an existing niche as a starting point
2. Create `niches/{niche-name}/PRODUCT.md` describing the niche's market
3. Create `niches/{niche-name}/CONTEXT.md` mapping user-facing terms to CONTEXT.md canon
4. Create `niches/{niche-name}/brand/` with niche-specific design tokens
5. Create a Cloudflare AI Gateway named `opinionated-imagen-{niche-name}`
6. Add a deployment script in `package.json`: `deploy:{niche-name}`

See `niches/ig-content/` as the reference implementation.

## Stack

| Layer | Technology |
|-------|-----------|
| Static pages | Astro v6.3 (Vite 8, Tailwind v4) |
| App UI | React 19 + shadcn/ui (`@base-ui/react`) |
| Styling | Tailwind CSS v4 via PostCSS |
| Backend | Cloudflare Workers (Hono v4) |
| Database | Cloudflare D1 |
| Storage | Cloudflare R2 (presigned URLs via @aws-sdk/client-s3) |
| Generation | Cloudflare AI Gateway — `openai/gpt-image-2` (proxied) |
| Vision/Curation | Cloudflare Workers AI — `google/gemma-4-26b-a4b-it`, `moonshot-ai/kimi-k2.6` (hosted) |
| Auth | Email magic links (Cloudflare Email Workers) |
| Payments | Stripe |
| Sandboxed LLM code | Arrow JS Sandbox (`@arrow-js/sandbox`) — LLM-generated snippets only |

## Setup

```bash
pnpm install

# Dev (Astro port 4321 + Worker port 8787)
pnpm dev

# Typecheck
pnpm typecheck

# Build + deploy IG niche
pnpm deploy:ig

# D1 migrations
npx wrangler d1 migrations apply opinionated-imagen-db
npx wrangler d1 migrations apply opinionated-imagen-db --remote
```

## Deploying a Niche

Run `pnpm build` to build the static site. Then deploy the Worker:

```bash
# Deploy IG niche
NICHE=ig-content pnpm build && npx wrangler deploy

# Deploy other niches (once they exist)
NICHE=headshots pnpm build && npx wrangler deploy
```

The `NICHE` env var tells the Worker which niche config to load at runtime. Each niche deploys to its own domain.

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/scenes` | List Scenes for the active niche |
| POST | `/api/upload/presigned` | Batch presigned upload URLs to R2 |
| GET | `/api/profile/status?sessionToken=` | Poll session/profile build status |
| POST | `/api/profile/build` | Trigger async profile building |
| POST | `/api/auth/magic-link` | Send magic link (rate-limited) |
| GET | `/api/auth/verify?token=` | Validate token, issue session cookie |
| GET | `/api/auth/me` | Return authenticated Creator or 401 |
| POST | `/api/auth/logout` | Clear session cookie |

## Domain Language

These are the canonical terms — used in all code, API contracts, and internal docs. Each niche overrides the user-facing labels via its own `CONTEXT.md`.

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
| Gateway | opinionated-imagen-{niche}

Resolved ambiguities:
- "prompt" = freeform Creator input. Internal generation parameters = **Intention**
- "style" = extracted fingerprint (**Style Profile**) vs shipped template (**Preset**)
- "reference" = identity photos (**Selfie Set**) vs aesthetic inputs (**Style References**) vs commercial objects (**Product Images**)

## Code Style

- **No `console.log`**. Use `core/functions/lib/diagnostics.ts` with `error_code`, `operation`, `context`, `retriable`, `recovery_hint`
- **No silent `.catch(() => {})`**
- **Every async island wrapped in `<ErrorBoundary>`**
- **Use `cn()` from `~/lib/utils`** (`clsx` + `tailwind-merge`)
- **No emojis** in source code. Use `@tabler/icons-react`
- **Design token SSOT** — no raw colors in JSX
- **Mobile first**

## Prompting References

- [OpenAI Image Generation Prompting Guide](https://github.com/openai/openai-cookbook/blob/main/examples/multimodal/image-gen-models-prompting-guide.ipynb)
- [GPT Image 2 Skill](https://github.com/wuyoscar/gpt_image_2_skill)

## Owners

- Huy: product, architecture
- Dani: UI, UX
