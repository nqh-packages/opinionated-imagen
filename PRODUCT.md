# Opinionated Imagen

## What

Your photos, elevated. Not a tool. An invisible creative team that makes your social wall look like it came from a magazine — as if you had an ekip behind every shot.

For creators like Lily, this means no more Saturday afternoon shoots, no more praying a friend takes a good photo, no more scrolling presets to find something that sort of works. She uploads her photos, teaches the system her taste, and gets back magazine-grade content on demand.

One niche at a time. First niche: Instagram content for people like Lily.

She uploads her photos. The system learns her face and her taste. She tells it what she wants, or picks a **Scene**. The system says back: "This is what I understood." She checks it, tweaks it once if it's wrong, and hits go. **The Edit** comes back: a curated contact sheet of variations. No prompt engineering. No surprises. One turn, one **Brief**, one **Drop**.

## Why

PhotoAI ships 30+ features. Video, 3D, mocap, face combining. Most people use maybe three of those. And even then, the output looks like AI — smooth skin, impossible lighting, that telltale synthetic sheen.

I think the opportunity is in the opposite direction. Make it small. Make it about one thing done well. Make it look like a magazine editorial team produced it, not like an AI spit it out. Build the framework so it can stretch to other niches later, but ship one vertical first and make it actually work.

The positioning: this is *not* an AI product. It is a premium creative service. The language everywhere should feel like fashion editorial, not software. "Processing your Drop" not "Generating." "The Brief" not "Prompt Preview." "Scene" not "Preset." "The Edit" not "AI Output."

## Who

**Lily.** Mid-20s to early-30s. Posts to Instagram weekly, maybe more. She cares about her feed looking consistent but she doesn't want to spend Saturday afternoon on a photoshoot. She cares about quality enough to pay for it, but not enough to learn AI parameters.

She is not a prompt engineer. She is the kind of person who describes what she wants in plain words and expects it to be understood.

## Not in Scope

- Multi-person generation. No couples, no groups.
- Video. This is a photo product.
- 3D models.
- Face swapping onto existing photos.
- Community-generated presets. Not in v1.
- Mobile app. Web first.
- Open-source. Product first, framework second.

## Core Flow

### 1. Onboard

Lily uploads two kinds of photos.

First, her **Selfie Set**. Ten to twenty photos of herself. Different angles, different lighting, different expressions. Her face, her body, how she looks.

Second, her **Moodboard**. Eight to fifteen photos she actually likes. Her own past posts. Photos from other accounts she wishes were hers. Stuff that shows the system what kind of aesthetic she wants. (Internally: **Style References**.)

The **Curation Engine** runs in the background. A vision model looks at her selfies and extracts what she looks like. Another vision model looks at her style references and extracts her taste: color palette, contrast level, film grain preference, how she likes things composed. It saves both as a permanent **Identity Profile** and **Style Profile**.

Onboarding is not instant. She uploads, she waits, she gets a notification when it's ready.

### 2. Create

She opens the Create page.

Two ways in.

**Option A, Scene.** She browses the Scene catalog. "Cafe Aesthetic." "Golden Hour Portrait." "Streetwear Fit Check." Each **Scene** is a curated setup: a setting, a default composition plan, and how **The Edit** should be mixed. Scenes are presented as a browse-first card grid — magazine editorial energy, not a software catalog.

**Option B, Custom.** She types freeform. "Me at a basketball court, golden hour, wearing the Nikes I uploaded." She can upload a **Product Image** if she wants.

### 3. The Brief

This is the center of the product.

The system builds an **Intention**, which is a structured plan for what it will generate. Then it renders that plan as **The Brief** — a plain-language paragraph preview:

> You at a warm cafe table, morning window light from the left. Muted-film grade, soft shadows. 8 shots: 3 seated portraits, 2 candid over-shoulder, 2 detail shots, 1 wide environment.

Every clause is inline-editable. She clicks any phrase, changes it. The text updates live. That is her **One Turn**. She tweaks once, or she doesn't tweak at all. Then she hits **Process**.

No preview image. No cheap draft. Just a confirmation of what the system understood, in words, before it commits.

### 4. Process

The **Generation Engine** sends her confirmed Intention to Cloudflare Workers AI.

- Text-to-image and image-to-image pipelines.
- Identity Profile used for face and body consistency.
- Style Profile used for grading.
- Variations are generated in background batches (2–4 at a time) with retry logic.
- Results assembled into **The Edit**: a contact sheet of 8 variations.

Time: 2 to 5 minutes. She can leave the page; she'll get notified when **The Edit** is ready.

### 5. Archive

She sees **The Edit** as a clean contact sheet. She can save individual shots to her **Archive**. She can discard the whole set. If she flags it within 5 minutes, no charge.

She can also remix a saved shot. That starts a new Brief flow with the saved shot as a starting point.

Paid only. No free tier. No watermarks. The output is clean magazine-grade from the first pixel.

## Drop Model

A **Drop** is one execution. One confirmed Intention becomes one **Edit** (8 variations). Think of it like a film roll: one scene, multiple takes, fully processed.

**Pricing:**

| Offering | Price | What you get |
|----------|-------|-------------|
| **Single Drop** | $10 | One scene, fully produced. 8 shots. One-time purchase. |
| **Monthly Access** | $29/mo | 4 Drops per month. Priority processing. For creators who post weekly. |

Drops do not roll over. Unused Drops expire at the end of the billing period. No weekly billing. No quarterly plans in v1.

The one-off Drop is the trial. Someone who isn't sure pays $10 once, sees the quality, and converts to Monthly Access. No free tier — the product is paid from the first pixel.

## Scene Catalog

A **Scene** is a JSON-defined setup bundled with the niche. (Internal term: **Preset**.)

```json
{
  "id": "cafe-aesthetic",
  "name": "Cafe Aesthetic",
  "description": "Relaxed cafe moments — coffee, window light, candid",
  "baseScene": "A person sitting at a cafe table with a coffee cup, natural window light",
  "compositionPlan": [
    { "type": "seated-portrait", "ratio": 3 },
    { "type": "candid-over-shoulder", "ratio": 2 },
    { "type": "detail-shot", "ratio": 2 },
    { "type": "wide-environment", "ratio": 1 }
  ],
  "defaultStyleTags": ["warm", "film-like", "soft shadows"],
  "requiresProductImage": false
}
```

Scenes are rendered as a browse-first card grid on the Create surface — magazine editorial energy, not a software catalog. New niches ship their own catalog by dropping JSON files into `/niches/{niche}/scenes/`.

## Curation Engine

Two subsystems.

### Profile Builder

Runs async at onboarding and whenever references are updated.

- Vision model on Selfie Set: extracts face and body descriptors, consistent angles, lighting preferences.
- Vision model on Style References: extracts color palette, contrast curve, grain preference, composition tendencies.
- LLM synthesizes both into structured profiles stored in D1.

### Intention Assembler

Runs sync at creation time.

- Input: Identity Profile + Style Profile + Preset or Prompt + optional Product Image.
- LLM assembles a structured Intention with all fields.
- Renders as natural language for **The Brief** step.

## Generation Engine

- Runs on Cloudflare Workers AI.
- Vision / curation: `@cf/google/gemma-4-26b-a4b-it` or `@cf/moonshot-ai/kimi-k2.6` if stronger reasoning needed.
- Uses Identity Profile (image refs + text descriptions) as conditioning.
- Uses Style Profile as style conditioning.
- One confirmed Intention triggers background batch generation calls. Results assembled into **The Edit**.

### Model Comparison

I looked at four options on Cloudflare Workers AI: gpt-image-2, seedream-5-lite, imagen-4, and nano-banana-2.

| Model | Multi-image input | Person gen | Output | Price |
|-------|------------------|------------|--------|-------|
| **gpt-image-2** | Up to 16 base64 images. Blends subjects + styles + references. | Built-in | Single image, 3 sizes, 4 quality levels | Token-based |
| **seedream-5-lite** | `image_input[]` for variation, docs show single-image only | Built-in | Multiple images possible, batch gen | $0.035/image |
| **imagen-4** | Text only | `person_generation` flag: dont_allow / allow_adult / allow_all | Single image | $0.04/image |
| **nano-banana-2** | Text only | Built-in | Single image, up to 4K | Token-based |

**Why gpt-image-2 first.** It is the only one with true multi-image editing. I can pass Lily's selfie set + style refs + product image + scene reference all in one call as base64 strings. The model blends them into one output. This is exactly what the product needs: "generate Lily wearing Nikes at a basketball court, matching her film grade." No other model accepts multiple reference images.

**seedream-5-lite** might handle multi-reference too — the parameter is an array — but the docs only demo single-image variation. Worth testing later as a cheaper variation layer.

**imagen-4** and **nano-banana-2** are pure text-to-image. No reference inputs. For identity consistency I would need perfect prompt engineering, which this product explicitly avoids.

So v1 starts with gpt-image-2 for everything. Anchor image and variations. I'll revisit seedream-5-lite once I can verify multi-reference actually works.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Static sites | Astro (marketing pages, landing) |
| Interactive surfaces | Arrow JS (reactive templates + components) |
| Styling | Tailwind CSS |
| Build | Vite (from `create-arrow-js@latest`) |
| Backend | Cloudflare Workers (Hono) |
| Database | Cloudflare D1 |
| Object Storage | Cloudflare R2 |
| AI | Cloudflare Workers AI |
| Auth | Email magic links |
| Payments | Stripe |

## Decisions

### Frontend stack: Astro + Arrow JS, minimal React

React is limited to the absolute minimum. The interactive app surfaces, **The Brief**, Archive, and creator dashboard are built with Arrow JS. A ~5KB reactive runtime. Tagged templates and `reactive()` state. No JSX, no compiler.

**The Brief** is exactly what Arrow is built for. Live text editing where every field is a reactive expression. It fits the product better than React's re-render cycle.

Astro stays for static pages. Marketing, landing, docs. Arrow JS components mount as islands where interactivity is needed. No React islands. No JSX overhead.

I accept the trade-off. No shadcn. No Radix. No pre-built component library. Upload components, galleries, inline editors — all built from DOM primitives. But the product scope is narrow enough that this is manageable. Onboard, create, confirm, generate, curate. Five surfaces.

## Success Metrics

| Metric | What it measures |
|--------|-----------------|
| Activation | % of uploads who complete onboarding (selfie set + moodboard) |
| Creation | % of activated users who process a Drop within 7 days |
| Retention | % of Monthly Access users who process a Drop in 3 of 4 weeks |
| Quality | % of Edits where user saves >= 1 shot |
| Remix rate | % of saved shots that get remixed |

## MVP Architecture Decisions

1. **Intention Confirmation = Paragraph Preview.** A plain-language paragraph, inline-editable by clause. Not a form, not a dashboard. One Turn is communicated, not enforced.
2. **Upload first, auth deferred.** Zero friction before photos land. Magic link required at first Drop creation. Orphaned uploads TTL 7 days.
3. **Browse-first card grid for Scene discovery.** Scenes as editorial cards, not a command-palette search grid.
4. **Background job table + batch generation.** Drops process variations in batches of 2–4 with retry logic. Frontend polls for progress. Not all 8 in parallel.
5. **Paid-only from first Drop.** No free tier, no watermarks. The $10 Single Drop is the trial.
6. **One-off + Subscription from launch.** Single Drop ($10) and Monthly Access ($29/mo, 4 Drops). Both Stripe SKUs.
7. **Positioning: "Your photos, elevated."** Not AI. Not software. Magazine editorial with an invisible team. "Process" not "Generate." "The Brief" not "Prompt Preview."

## Phase 1: Lily (MVP)

- Single niche: Instagram content for individual creators.
- Six curated **Scenes** (browse-first card grid).
- One person per generation.
- **The Brief**: paragraph preview, inline-editable, One Turn.
- **The Edit**: 8 variations, background batch processing.
- Auth: upload first, magic link deferred to first Drop.
- Pricing: Single Drop ($10) + Monthly Access ($29/mo, 4 Drops).
- Paid only. No free tier. No watermarks.
- Web only.

## Phase 2: Framework

- Extract niche config system: presets, copy, and pricing as JSON.
- Second niche. Maybe LinkedIn headshots, maybe dating profiles.
- Custom preset builder. Product owner only, not community.
- Remix history. Learn from user corrections.

## Phase 3: Scale

- Community presets.
- Multi-person generation.
- Batch generation. Schedule weekly packs.
- API for third-party integrations.
