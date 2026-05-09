# AGENTS.md

## Project

Opinionated Imagen — a framework for creating niche market products in AI image generation. One engine, many products.

Read [PRODUCT.md](PRODUCT.md) for the framework vision. Read [CONTEXT.md](CONTEXT.md) for the canonical domain language. Read [MODELS.md](MODELS.md) for AI model reference. Each niche has its own PRODUCT.md and CONTEXT.md under `niches/{niche}/`.

## Structure Law

The directory layout below is enforced. Every agent must maintain it.

```
core/                       ← All shared source code.
  src/                      ← Astro frontend (shared across niches)
    components/ui/          ← shadcn/ui components
    islands/                ← React islands (OnboardApp, CreateApp, GalleryApp)
    layouts/                ← Astro layouts
    lib/                    ← Utilities (api.ts, utils.ts)
    pages/                  ← Astro pages
    styles/                 ← Tailwind CSS
  functions/                ← Hono backend (shared across niches)
    index.ts                ← App entry, route mounting, bindings
    middleware/auth.ts      ← requireAuth
    lib/                    ← diagnostics, id, storage, email, scenes-data
    routes/                 ← auth, upload, profile, scenes
    migrations/             ← D1 SQL migrations
    scripts/                ← setup-lifecycle
    AGENTS.md               ← Backend-specific reference (for Workers-only work)
niches/
  {niche}/                  ← One directory per market product
    scenes/                 ← Scene/Preset JSON definitions
    PRODUCT.md              ← Market vision. Price table, core flow, positioning.
    CONTEXT.md              ← Maps user-facing terms to CONTEXT.md canon.
    brand/                  ← Design tokens, copy assets.
AGENTS.md                   ← This file. Root level only.
CONTEXT.md                  ← Canonical domain terms. Do not add niche-specific terms here.
MODELS.md                   ← Shared AI model decisions. Do not duplicate per niche.
PRODUCT.md                  ← Framework vision. Do not add niche-specific content here.
astro.config.mjs            ← Build config. srcDir must point to core/src/.
package.json                ← Root build config. Scripts point to core/* paths.
```

### Rules

| Rule | Why |
|------|-----|
| **No source code at root level.** All shared code lives in `core/`. | Root should only have configs, docs, and `niches/`. |
| **No niche-specific terms in CONTEXT.md.** Root CONTEXT.md is canonical/shared only. Niche aliases go in `niches/{niche}/CONTEXT.md`. | SSOT for internal terms. User-facing language is per-niche. |
| **Each niche must have PRODUCT.md + CONTEXT.md + brand/.** These are not optional. | Every market product needs its own vision, term mapping, and brand identity. |
| **Niche CONTEXT.md must map every user-facing term to CONTEXT.md.** If a term is used in UI but absent from the niche's CONTEXT.md, it's a drift. | Prevents agents from inventing terms that don't map to canon. |
| **API routes return CONTEXT.md terms, not user-facing terms.** Only the frontend translates. | One backend, N niches. API stays generic. |
| **New file types at root require a justification comment in this file.** Config files, deploy scripts, and root docs are the only valid root-level entries. | Prevents root from accumulating misc files. |
| **New niches add a script to package.json: `deploy:{niche}`.** Runs `NICHE={niche} pnpm build && wrangler deploy`. | Every niche must be deployable independently. |

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
| Sandboxed LLM code | Arrow JS Sandbox — LLM-generated snippets only |

## Setup

```bash
pnpm install
pnpm dev            # Astro port 4321 + Worker port 8787
pnpm typecheck
pnpm build
```

## Deploy

```bash
# Each niche deploys independently
pnpm deploy:ig        # NICHE=ig-content pnpm build && wrangler deploy
pnpm deploy:headshots # (future)
pnpm deploy:dating    # (future)

# D1 migrations
npx wrangler d1 migrations apply opinionated-imagen-db
npx wrangler d1 migrations apply opinionated-imagen-db --remote
```

The `NICHE` env var selects which niche config the Worker loads at runtime. Each niche deploys to its own domain.

## API Routes

Routes return CONTEXT.md canonical terms. Only the frontend maps to user-facing language per niche config.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/scenes` | List Presets for the active niche |
| POST | `/api/upload/presigned` | Batch presigned upload URLs to R2 |
| GET | `/api/profile/status?sessionToken=` | Poll session/profile build status |
| POST | `/api/profile/build` | Trigger async profile building |
| POST | `/api/auth/magic-link` | Send magic link (rate-limited) |
| GET | `/api/auth/verify?token=` | Validate token, issue session cookie |
| GET | `/api/auth/me` | Return authenticated Creator or 401 |
| POST | `/api/auth/logout` | Clear session cookie |

All routes return structured JSON. Errors follow the diagnostic schema from `core/functions/lib/diagnostics.ts`.

## Domain Language (Canonical)

These are the single source of truth. Code, API, and internal docs use these exclusively. See [CONTEXT.md](CONTEXT.md) for full definitions and relationship diagram.

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
| Gateway | AI Gateway instance, named `opinionated-imagen-{niche}` |

Resolved ambiguities:
- "prompt" = freeform Creator input. Internal generation parameters = **Intention**
- "style" = extracted fingerprint (**Style Profile**) vs shipped template (**Preset**)
- "reference" = identity photos (**Selfie Set**) vs aesthetic inputs (**Style References**) vs commercial objects (**Product Images**)

## Code Style

- **No `console.log`**. Use `core/functions/lib/diagnostics.ts`.
- **No silent `.catch(() => {})`**. Explain why in a comment.
- **Every async island wrapped in `<ErrorBoundary>`**.
- **Use `cn()` from `~core/src/lib/utils`** (`clsx` + `tailwind-merge`). Never hand-roll.
- **No emojis** in source code. Use `@tabler/icons-react`.
- **Design token SSOT**. No raw colors in JSX.
- **Mobile first.**

## Visual Standards (Product Level)

- **No AI-generated look.** Every output must pass the "is this a photo?" test.
- **Photorealistic by default.** Like iPhone or mirrorless camera.
- **No perfection.** Pores, flyaways, wrinkles, uneven light.
- **No generic stock posing.** Candid, moment-like shots.
- **No composited-on-background feeling.** Subject and scene in the same physical space.

The target: a friend took this photo with their phone.

## Resources

- `core/functions/AGENTS.md` — Backend API, D1 schema, binding types, R2 setup
- `niches/ig-content/` — Reference implementation for the first niche

## Prompting References

- [OpenAI Image Generation Prompting Guide](https://github.com/openai/openai-cookbook/blob/main/examples/multimodal/image-gen-models-prompting-guide.ipynb)
- [GPT Image 2 Skill](https://github.com/wuyoscar/gpt_image_2_skill)

## Owners

- Huy: product, architecture
- Dani: UI, UX
