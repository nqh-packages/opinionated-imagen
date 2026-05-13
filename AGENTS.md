# AGENTS.md

<!-- markdownlint-disable MD013 -->

## Project

Opinionated Imagen — a framework for creating market products in AI image generation. One engine, many products.

Read [PRODUCT.md](PRODUCT.md) for the framework vision. Read [CONTEXT.md](CONTEXT.md) for the canonical domain language. Read [MODELS.md](MODELS.md) for AI model reference. Each deployable product has its own workspace under `products/{product}/`.

## Structure Law

The directory layout below is enforced. Every agent must maintain it.

```
core/                       ← All shared source code.
  pipelines/                ← Shared Generation Pipeline definitions and Pipeline Type templates.
  src/                      ← Astro frontend (shared across products)
    components/ui/          ← shadcn/ui components
    islands/                ← React islands (OnboardApp, CreateApp, GalleryApp)
    layouts/                ← Astro layouts
    lib/                    ← Utilities (api.ts, utils.ts)
    pages/                  ← Astro pages
    styles/                 ← Tailwind CSS
  functions/                ← Hono backend (shared across products)
    index.ts                ← App entry, route mounting, bindings
    middleware/auth.ts      ← requireAuth
    generated/              ← Derived product workspace bundle. Do not edit by hand.
    lib/                    ← diagnostics, id, storage, email
    routes/                 ← auth, upload, profile, scenes
    migrations/             ← D1 SQL migrations
    scripts/                ← setup-lifecycle
    AGENTS.md               ← Backend-specific reference (for Workers-only work)
  tools/                    ← Repo-local build/validation tools
products/
  {product}/                ← One source-of-truth workspace per deployable product
    product.json            ← Machine-readable Product Manifest.
    scenes/                 ← Scene/Preset JSON definitions
    PRODUCT.md              ← Market vision. Price table, core flow, positioning.
    CONTEXT.md              ← Maps user-facing terms to CONTEXT.md canon.
    context.md              ← Agent-native dynamic context for this product.
    brand/                  ← Design tokens, copy assets.
    pipelines/              ← Product-specific Generation Pipeline selection/configuration.
AGENTS.md                   ← This file. Root level only.
CONTEXT.md                  ← Canonical domain terms. Do not add product-specific terms here.
MODELS.md                   ← Shared AI model decisions. Do not duplicate per product.
PRODUCT.md                  ← Framework vision. Do not add product-specific content here.
astro.config.mjs            ← Build config. srcDir must point to core/src/.
package.json                ← Root build config. Scripts point to core/* paths.
```

### Rules

| Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Why                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **No source code at root level.** All shared code lives in `core/`.                                                                                                                                                                                                                                                                                                                                                                                                     | Root should only have configs, docs, `core/`, and `products/`.                                                                      |
| **No product-specific terms in root CONTEXT.md.** Root CONTEXT.md is canonical/shared only. Product aliases go in `products/{product}/CONTEXT.md`.                                                                                                                                                                                                                                                                                                                      | SSOT for internal terms. User-facing language is per product.                                                                       |
| **Each product must have product.json + PRODUCT.md + CONTEXT.md + context.md + brand/.** These are not optional.                                                                                                                                                                                                                                                                                                                                                        | Every deployable product needs machine config, vision, term mapping, agent context, and brand identity.                             |
| **Generation Pipelines are file-native.** Shared Pipeline Type templates live in `core/pipelines/`; product selection/configuration lives in `products/{product}/pipelines/`.                                                                                                                                                                                                                                                                                           | Agents and humans must inspect, edit, review, validate, and render the same pipeline source before any visual/admin builder exists. |
| **Pipeline Steps are shared core primitives.** Product workspaces configure shared Pipeline Steps; they do not define custom product-private steps. Future needs widen `core/pipelines/` instead.                                                                                                                                                                                                                                                                       | Keeps one reusable engine across products and gives agents a stable step catalog.                                                   |
| **Pipeline agent tools stay primitive.** Agents get list/read/write/validate/run/cancel/retry/score artifact capabilities; product outcomes such as Contact Sheet generation or profile building are prompt-defined compositions, not monolithic tools.                                                                                                                                                                                                                 | Preserves agent-native parity, composability, and future product discovery.                                                         |
| **Pipeline truth is split by lifecycle.** Files own Generation Pipeline definitions/configuration, D1 owns Pipeline Run and Pipeline Step Run metadata, and R2 owns media artifacts.                                                                                                                                                                                                                                                                                    | Keeps agent-editable source separate from queryable runtime state and large generated assets.                                       |
| **Pipeline v1 is agent-first.** V1 prioritizes agent tools plus file/D1/R2 primitives: list Pipeline Types and Steps, read definitions/config, write proposed config, validate, estimate cost, list Provider Routes, create evaluation runs with test fixtures, read run status/results, score artifacts, compare routes, and prepare promotion diffs. Visual/admin editing comes later.                                                                                | The first system must be useful to agents before a visual builder exists.                                                           |
| **Pipeline UI must preserve action parity.** Any future admin UI action for Generation Pipelines must have an equivalent agent capability in the same change.                                                                                                                                                                                                                                                                                                           | Prevents orphan UI actions and keeps the visual builder a view over the same system agents use.                                     |
| **Pipeline promotion requires approval.** Evaluation Pipeline Runs may recommend Provider Routes and prepare config diffs, but production Provider Route promotion is never automatic.                                                                                                                                                                                                                                                                                  | Provider quality and paid output behavior require human judgment.                                                                   |
| **Pipeline approvals match data risk.** Agents may run evaluations with synthetic/test fixtures, estimate cost, validate configs, score artifacts, and prepare diffs autonomously. Approval is required before changing production Contact Sheet configuration, modifying profile-building configuration, deleting artifacts, changing retention policy, running profile-building on real Creator Selfie Sets, or sending identity/profile artifacts to a new provider. | Real identity data and paid production output are high-stakes surfaces.                                                             |
| **Pipeline evaluation uses weighted scores plus hard gates.** Evaluation dimensions are identity preservation (25), photorealism (25), intention adherence (15), style match (10), artifact defects (10), composition variety (5), cost (5), latency (3), and retry/failure rate (2). Hard gates fail Provider Routes that damage identity, look obviously AI-generated, mishandle identity data, or create face/body/product-critical artifacts.                       | Numeric scores help compare routes, but paid output quality and privacy require non-negotiable gates.                               |
| **Product CONTEXT.md must map every user-facing term to CONTEXT.md.** If a term is used in UI but absent from the product's CONTEXT.md, it's drift.                                                                                                                                                                                                                                                                                                                     | Prevents agents from inventing terms that don't map to canon.                                                                       |
| **API routes return CONTEXT.md terms, not user-facing terms.** Only the frontend translates.                                                                                                                                                                                                                                                                                                                                                                            | One backend, N products. API stays generic.                                                                                         |
| **New file types at root require a justification comment in this file.** Config files, deploy scripts, and root docs are the only valid root-level entries.                                                                                                                                                                                                                                                                                                             | Prevents root from accumulating misc files.                                                                                         |
| **New products add a script to package.json: `deploy:{product}`.** Runs `PRODUCT_ID={product} pnpm build && wrangler deploy`.                                                                                                                                                                                                                                                                                                                                           | Every product must be deployable independently.                                                                                     |
| **Products compile before runtime.** Run `pnpm product:validate` and `pnpm product:compile` after product workspace changes.                                                                                                                                                                                                                                                                                                                                            | Worker bundles derived files from `core/functions/generated/`; `products/` remains canonical.                                       |
| **Product Workspace drift must be blocked.** `pnpm product:check` and qlty's `product-workspace` driver block stale generated artifacts, legacy `niches/` mirrors, legacy Scene mirrors in `core`, and derived fields in source Scene JSON.                                                                                                                                                                                                                             | Product Workspace files are the source; runtime artifacts are derived.                                                              |

## Stack

| Layer              | Technology                                                                            |
| ------------------ | ------------------------------------------------------------------------------------- |
| Static pages       | Astro v6.3 (Vite 8, Tailwind v4)                                                      |
| App UI             | React 19 + shadcn/ui (`@base-ui/react`)                                               |
| Styling            | Tailwind CSS v4 via PostCSS                                                           |
| Backend            | Cloudflare Workers (Hono v4)                                                          |
| Database           | Cloudflare D1                                                                         |
| Storage            | Cloudflare R2 (presigned URLs via @aws-sdk/client-s3)                                 |
| Generation         | Cloudflare AI Gateway — `openai/gpt-image-2` (proxied)                                |
| Vision/Curation    | Cloudflare Workers AI — `google/gemma-4-26b-a4b-it`, `moonshot-ai/kimi-k2.6` (hosted) |
| Auth               | Email magic links (Cloudflare Email Workers)                                          |
| Payments           | Stripe                                                                                |
| Sandboxed LLM code | Arrow JS Sandbox — LLM-generated snippets only                                        |

## Setup

```bash
pnpm install
pnpm dev            # Astro port 4321 + Worker port 8787
pnpm typecheck
pnpm build
```

## Deploy

```bash
# Each product deploys independently
pnpm deploy:ig        # PRODUCT_ID=ig-content pnpm build && wrangler deploy
pnpm deploy:headshots # (future)
pnpm deploy:dating    # (future)

# D1 migrations
npx wrangler d1 migrations apply opinionated-imagen-db
npx wrangler d1 migrations apply opinionated-imagen-db --remote
```

The `PRODUCT_ID` env var selects which Product Workspace the Worker loads at runtime. `NICHE` is accepted only as a temporary backward-compatible alias. Each product deploys to its own domain.

## API Routes

Routes return CONTEXT.md canonical terms. Only the frontend maps to user-facing language per product config.

| Method | Path                                | Description                          |
| ------ | ----------------------------------- | ------------------------------------ |
| GET    | `/api/health`                       | Health check                         |
| GET    | `/api/scenes`                       | List Presets for the active product  |
| POST   | `/api/upload/presigned`             | Batch presigned upload URLs to R2    |
| GET    | `/api/profile/status?sessionToken=` | Poll session/profile build status    |
| POST   | `/api/profile/build`                | Trigger async profile building       |
| POST   | `/api/auth/magic-link`              | Send magic link (rate-limited)       |
| GET    | `/api/auth/verify?token=`           | Validate token, issue session cookie |
| GET    | `/api/auth/me`                      | Return authenticated Creator or 401  |
| POST   | `/api/auth/logout`                  | Clear session cookie                 |

All routes return structured JSON. Errors follow the diagnostic schema from `core/functions/lib/diagnostics.ts`.

## Domain Language (Canonical)

These are the single source of truth. Code, API, and internal docs use these exclusively. See [CONTEXT.md](CONTEXT.md) for full definitions and relationship diagram.

| Canonical Term         | Avoid                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Creator                | user, customer, client, influencer                                                     |
| Selfie Set             | training data, dataset                                                                 |
| Identity Profile       | model, face model, avatar                                                              |
| Style References       | mood board, reference images                                                           |
| Style Profile          | filter, preset style                                                                   |
| Preset                 | template, theme, pack template                                                         |
| Prompt                 | prompt engineering, query                                                              |
| Product Image          | prop, item, object                                                                     |
| Intention              | prompt, request, generation spec                                                       |
| Generation Pipeline    | workflow, node graph, app, automation                                                  |
| Pipeline Type          | workflow category, node template, app type                                             |
| Pipeline Step          | node, task, stage, block                                                               |
| Pipeline Run           | job, session, workflow run, generation                                                 |
| Provider Route         | model picker, backend, integration, gateway                                            |
| Intention Confirmation | preview, summary, confirmation dialog                                                  |
| One Turn               | iteration, round, refinement pass                                                      |
| Contact Sheet          | gallery, album, batch, pack output                                                     |
| Variation              | shot, frame, alternative                                                               |
| Pack                   | credit, session, job, generation                                                       |
| Gateway                | AI Gateway instance, named in the Product Manifest (`products/{product}/product.json`) |

Resolved ambiguities:

- "style" = extracted fingerprint (**Style Profile**) vs shipped template (**Preset**)
- "reference" = identity photos (**Selfie Set**) vs aesthetic inputs (**Style References**) vs commercial objects (**Product Images**)

## Code Style

- **No `console.log`**. Use `core/functions/lib/diagnostics.ts`.
- **No silent `.catch(() => {})`**. Explain why in a comment.
- **Model names in code use `@cf/` prefix.** Workers AI model names follow `@cf/<provider>/<model>` format (e.g. `@cf/google/gemma-4-26b-a4b-it`). The shorthand format (`google/gemma-...`) does not work in `env.AI.run()`. See `MODELS.md`.
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
- `products/ig-content/` — Reference implementation for the first product

## Prompting References

- [OpenAI Image Generation Prompting Guide](https://github.com/openai/openai-cookbook/blob/main/examples/multimodal/image-gen-models-prompting-guide.ipynb)
- [GPT Image 2 Skill](https://github.com/wuyoscar/gpt_image_2_skill)

## Owners

- Huy: product, architecture
- Dani: UI, UX
