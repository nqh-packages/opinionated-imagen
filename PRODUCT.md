# Opinionated Imagen

A framework for creating market products in AI image generation. One engine, many products.

Each product is a standalone market product with its own Scene catalog, pricing, user-facing language, and brand. The engine is shared. The output is photorealistic editorial content — like a magazine team produced it, not like an AI generated it.

Read [AGENTS.md](AGENTS.md) for how to build a product workspace. Read [CONTEXT.md](CONTEXT.md) for the canonical terms.

## What It Makes

Each product is a web product where a narrow market uploads real photos, teaches the system its visual taste, and gets back curated content packs — no prompt engineering, one-turn confirmation, photorealistic output.

Right now there is one product: **Nail Content Ekip** for nail salons and independent nail techs. See `products/nail-content/PRODUCT.md`.

## Not in Scope

- Multi-person generation
- Video
- 3D models
- Face swapping
- Community presets (v1)
- Mobile native app
- Open source

## Architecture

```
core/               ← shared engine, backend, auth, payments
products/{product}/
  product.json      ← machine-readable product manifest
  scenes/           ← JSON Scene definitions
  PRODUCT.md        ← market-facing product doc
  CONTEXT.md        ← product-specific term aliases
  context.md        ← agent-native product context
  brand/            ← design tokens, copy
```

A product workspace is a configuration and content directory, not a fork. The engine lives in `core/` and drives every product.

## Product Stack

Each product deploys as a Cloudflare Worker. Same code, different config, different domain.

- Frontend: Astro + React 19 islands
- Backend: Cloudflare Workers (Hono) + D1 + R2
- Generation: Cloudflare AI Gateway (proxied) — gpt-image-2
- Curation: Cloudflare Workers AI (hosted) — gemma-4 / kimi-k2.6
- Auth: Email magic links
- Payments: Stripe

## Design Standards

- **No AI-generated look.** Every output must pass the "is this a photo?" test.
- **Photorealistic by default.** Like iPhone or mirrorless camera. Natural light, real skin texture.
- **No perfection.** Pores, flyaways, wrinkles, uneven light. Imperfection is signal.
- **No generic stock posing.** Candid, moment-like shots.
- **No composited-on-background feeling.** The subject and scene must feel like the same physical space.

The target: a friend took this photo with their phone.
