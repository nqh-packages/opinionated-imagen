# Opinionated Imagen

## What

As we talked about, we can build a more niched to compete with PhotoAI. So I came up with something opinionated. One niche at a time. First niche: Instagram content for people like Lily.

She uploads her photos. The system learns her face and her taste. She tells it what she wants, or picks a preset. The system says back: "This is what I understood from what you said." She checks it, tweaks it once if it's wrong, and hits go. A contact sheet of variations comes back. No prompt engineering. No surprises. One turn, one confirmation, one pack.

## Why

PhotoAI ships 30+ features. Video, 3D, mocap, face combining. Most people use maybe three of those.

I think the opportunity is in the opposite direction. Make it small. Make it about one thing done well. Build it so the framework can stretch to other niches later, but ship one vertical first and make it actually work.

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

Second, her **Style References**. Eight to fifteen photos she actually likes. Her own past posts. Photos from other accounts she wishes were hers. Stuff that shows the system what kind of aesthetic she wants.

The **Curation Engine** runs in the background. A vision model looks at her selfies and extracts what she looks like. Another vision model looks at her style references and extracts her taste: color palette, contrast level, film grain preference, how she likes things composed. It saves both as a permanent **Identity Profile** and **Style Profile**.

Onboarding is not instant. She uploads, she waits, she gets a notification when it's ready.

### 2. Create

She opens the Create page.

Two ways in.

**Option A, Preset.** She picks from curated presets. "Cafe Aesthetic." "Golden Hour Portrait." "Streetwear Fit Check." Each one is a bundle: a scene type, a default composition plan, and how the contact sheet should be mixed.

**Option B, Custom.** She types freeform. "Me at a basketball court, golden hour, wearing the Nikes I uploaded." She can upload a **Product Image** if she wants.

### 3. Intention Confirmation

This is the center of the product.

The system builds an **Intention**, which is a structured plan for what it will generate. Then it shows that plan to her in plain language:

> **Subject**: You (from your selfie set)
> **Wearing**: The uploaded Nikes
> **Setting**: Outdoor basketball court at golden hour
> **Style**: Your muted-film grade, warm shadows, low contrast
> **Variations**: 8 shots — 3 full-body action, 2 seated portrait, 3 low-angle candid

Every line is editable. She clicks any line, changes it. The text updates live. That is her **One Turn**. She tweaks once, or she doesn't tweak at all. Then she hits **Generate**.

No preview image. No cheap draft. Just a confirmation of what the system understood, in words, before it burns GPU.

### 4. Generate

The **Generation Engine** sends her confirmed Intention to Cloudflare Workers AI.

- Text-to-image and image-to-image pipelines.
- Identity Profile used for face and body consistency.
- Style Profile used for grading.
- Each variation type gets its own generation call, run in parallel.
- Results assembled into a **Contact Sheet** of 8 variations.

Time: 20 to 60 seconds.

### 5. Curate

She sees the contact sheet as a gallery. She can save individual shots to her library. She can discard the whole set. If she flags it within 5 minutes, no charge.

She can also remix a saved shot. That starts a new Intention flow with the saved shot as a starting point.

Free tier puts a watermark on saved outputs. Paid tier is clean.

## Pack Model

A **Pack** is one execution. One confirmed Intention becomes one Contact Sheet.

**Pricing:**

- **One-off Pack**: $X per 8-variation contact sheet.
- **Weekly Subscription**: Y packs per week, billed monthly.
- **Monthly Subscription**: Y packs per week, billed monthly.
- **Quarterly Subscription**: Z packs per week, billed quarterly. Best value.

Packs do not roll over. Unused packs expire at the end of the billing period.

## Preset System

A **Preset** is a JSON file bundled with the niche.

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

The framework renders presets as cards. New niches ship their own catalog by dropping JSON files into `/niches/{niche}/presets/`.

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
- Renders as natural language for the Intention Confirmation step.

## Generation Engine

- Runs on Cloudflare Workers AI.
- Vision / curation: `@cf/google/gemma-4-26b-a4b-it` or `@cf/moonshot-ai/kimi-k2.6` if stronger reasoning needed.
- Uses Identity Profile (image refs + text descriptions) as conditioning.
- Uses Style Profile as style conditioning.
- One confirmed Intention triggers N parallel generation calls, one per variation type. Results assembled into Contact Sheet.

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

React is limited to the absolute minimum. The interactive app surfaces, intention confirmation, gallery, and creator dashboard are built with Arrow JS. A ~5KB reactive runtime. Tagged templates and `reactive()` state. No JSX, no compiler.

The Intention Confirmation is exactly what Arrow is built for. Live text editing where every field is a reactive expression. It fits the product better than React's re-render cycle.

Astro stays for static pages. Marketing, landing, docs. Arrow JS components mount as islands where interactivity is needed. No React islands. No JSX overhead.

I accept the trade-off. No shadcn. No Radix. No pre-built component library. Upload components, galleries, inline editors — all built from DOM primitives. But the product scope is narrow enough that this is manageable. Onboard, create, confirm, generate, curate. Five surfaces.

## Success Metrics

| Metric | What it measures |
|--------|-----------------|
| Activation | % of signups who complete onboarding (upload selfie set + style refs) |
| Creation | % of activated users who generate a contact sheet within 7 days |
| Retention | % of weekly subscribers who generate in 3 of 4 weeks |
| Quality | % of contact sheets where user saves >= 1 variation |
| Remix rate | % of saved variations that get remixed |

## Phase 1: Lily (MVP)

- Single niche: Instagram content for individual creators.
- Five curated presets.
- One person per generation.
- One-turn confirmation.
- Contact sheet: 8 variations.
- One-off and monthly subscription pricing.
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
