# AGENTS.md

## Project

Opinionated Imagen — niche AI image generation framework. First niche: Instagram content for individual creators.

Read [PRODUCT.md](PRODUCT.md) for full product context and [CONTEXT.md](CONTEXT.md) for domain language.

## Stack

| Layer | Tool |
|-------|------|
| Static pages | Astro |
| Interactive UI | Arrow JS (`reactive()`, `html`, `component`) |
| Styling | Tailwind CSS |
| Build | Vite (from `create-arrow-js@latest`) |
| Backend | Cloudflare Workers (Hono) |
| Database | Cloudflare D1 |
| Storage | Cloudflare R2 |
| AI | Cloudflare Workers AI |
| Auth | Email magic links (Cloudflare Email Workers) |
| Payments | Stripe |

## Rules

- **No React** except where absolutely unavoidable. Interactive surfaces are Arrow JS.
- **No pre-built component libraries** (no shadcn, no Radix). Build from DOM primitives.
- **One person per generation.** Multi-person is out of scope.
- **One turn** of tweaking in the Intention Confirmation step. No prolonged dialogue.

## Architecture Decisions

- **Astro** handles marketing/landing/static pages.
- **Arrow JS** mounts as islands for the interactive app: onboarding, intention confirmation, gallery, dashboard.
- **gpt-image-2** is the generation model for v1. It's the only Workers AI model that supports multi-image editing (up to 16 base64 refs blended into one output).
- Identity consistency comes from passing the Selfie Set as reference images in the generation call, not from fine-tuning or LoRAs.

## Domain Language

Key terms from CONTEXT.md:

- **Creator** — the user (not "user" or "customer")
- **Selfie Set** → **Identity Profile**
- **Style References** → **Style Profile**
- **Intention** — structured generation plan
- **Intention Confirmation** — inline-editable natural language preview
- **One Turn** — single adjustment cycle after confirmation
- **Contact Sheet** — 8 variations of one scene
- **Pack** — one execution unit (one Intention → one Contact Sheet)
- **Preset** — JSON-defined template with composition plan

## Runtime Requirements

- **Node `22.12.0`** or higher (Astro v6 requirement)
- **pnpm** as package manager

## Astro / Vite / Tailwind Versions

| Tool | Version | Notes |
|------|---------|-------|
| Astro | v6.3 | Vite 7 under the hood. `import.meta.env.ASSETS_PREFIX` deprecated; use `astro:config/server` if needed. |
| Vite | v7 | Bundled by Astro. Compatible with current Tailwind v4 + `@tailwindcss/vite`. |
| Tailwind | v4 | CSS-first config via `@theme` in `src/styles/global.css`. |

### Astro v6 Gotchas

- **Tailwind v4 scoped styles**: Astro 6.2.2 fixed a bug where Tailwind `space-x-*`, `space-y-*`, `divide-*` utilities leaked out of `.astro` component scoped `<style>` blocks. If using those utilities inside components with `scoped`, verify styles don't escape.
- **SVG images**: Astro no longer rasterizes SVGs by default. Set `image.dangerouslyProcessSVG: true` in `astro.config.mjs` if you need rasterized SVG output.
- **Zod 4**: Shipps with Astro. Future schema work (content config, form validation) should import `z` from `astro/zod` (not `zod` directly) to stay in sync.

## Backend Architecture

- **Hono lives in `/functions/index.ts` as a standalone Cloudflare Worker.** It is NOT integrated into Astro via `astro/hono` or experimental advanced routing.
- The frontend talks to the Worker via `fetch('/api/...')` in dev (proxied by Vite) and via the same origin in production.
- Keep the boundary clean: Astro pages are static shells; Arrow JS islands handle UI state; Hono handles data, auth, payments, and AI generation.

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server (Astro + Hono Worker concurrently)
pnpm dev

# Typecheck (both frontend and functions)
pnpm typecheck

# Build for production
pnpm build

# Dry-run Worker deploy
pnpm wrangler deploy --dry-run
```

## Project Structure

```
/src
  /components      # Arrow JS components
  /pages           # Astro pages (static)
  /islands         # Arrow JS islands mounted in Astro
  /lib             # Shared utilities
  /styles          # Tailwind + global CSS
/functions         # Cloudflare Workers (Hono API)
/niches
  /ig-content      # First niche config
    /presets       # JSON preset files
```

## AI Models (Cloudflare Workers AI)

- **Generation**: `openai/gpt-image-2` — multi-image editing with identity + style + product refs
- **Curation/Vision**: `google/gemma-4-26b-a4b-it` or `moonshot-ai/kimi-k2.6`
- **Fallback to test**: `bytedance/seedream-5-lite` — if multi-reference works, cheaper for variations

## Preset Format

```json
{
  "id": "cafe-aesthetic",
  "name": "Cafe Aesthetic",
  "description": "Relaxed cafe moments",
  "baseScene": "A person sitting at a cafe table...",
  "compositionPlan": [
    { "type": "seated-portrait", "ratio": 3 },
    { "type": "candid-over-shoulder", "ratio": 2 }
  ],
  "defaultStyleTags": ["warm", "film-like"],
  "requiresProductImage": false
}
```

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

## Owners

- Huy: product, architecture
- Dani: UI, UX
