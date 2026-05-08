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
| Auth | Email magic links |
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

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Typecheck
npm run typecheck

# Build for production
npm run build
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

## Owners

- Huy: product, architecture
- Dani: implementation
