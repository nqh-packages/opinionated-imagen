# Models

Reference for all AI models used in Opinionated Imagen.

## Architecture

**Image generation models** run through **Cloudflare AI Gateway** (proxied to external providers). **Text/vision models** run on **native Workers AI** (Cloudflare's own GPU infrastructure).

```
Your Worker
    │
    ├──→ Image Generation ──→ AI Gateway ──→ OpenAI / Google / ByteDance
    │                           (proxied)
    │
    └──→ Curation/Vision ──→ Workers AI (native)
                               gemma, kimi, etc.
```

### Proxied vs Hosted

| Model | Provider | Type | Infrastructure |
|-------|----------|------|---------------|
| `openai/gpt-image-2` | OpenAI | Proxied | AI Gateway → OpenAI |
| `google/imagen-4` | Google | Proxied | AI Gateway → Google |
| `bytedance/seedream-5-lite` | ByteDance | Proxied | AI Gateway → ByteDance |
| `google/nano-banana-2` | Google | Proxied | AI Gateway → Google |
| `gemma-4-26b-a4b-it` | Google | **Hosted** | Native Cloudflare GPUs |
| `kimi-k2.6` | Moonshot AI | **Hosted** | Native Cloudflare GPUs |

### Setup

**No BYOK required.** Cloudflare has partnership/reseller agreements with providers. You do not need your own OpenAI API key or Google credentials.

Steps:
1. Enable Workers AI on your Cloudflare account
2. Create an AI Gateway in the dashboard: `AI → AI Gateway → Create Gateway`
3. Name it `opinionated-imagen-{niche}` (e.g., `opinionated-imagen-ig` for the Instagram niche, `opinionated-imagen-headshots` for LinkedIn headshots)
4. Pass `{ gateway: { id: 'opinionated-imagen-ig' } }` in `env.AI.run()` calls for proxied models

The gateway name enables: request logging, analytics, caching, rate limiting, and fallback routing.

---

## Image Generation

### Primary: `openai/gpt-image-2` (Proxied)

The only Workers AI image model that supports true multi-image editing. Pass up to 16 base64-encoded images and the model blends subjects, styles, and references into one output.

**Use for:** Anchor image generation — combining Identity Profile (selfie set) + Style Profile (style refs) + Product Image + scene description into a single photorealistic image.

| Parameter | Values | Notes |
|-----------|--------|-------|
| `prompt` | string (required) | Text description of the scene |
| `images` | string[] (base64) | Up to 16 reference images. Raw base64 or `data:image/{png\|jpeg\|webp};base64,...` URI |
| `quality` | `"low"` / `"medium"` / `"high"` / `"auto"` | Start with `"medium"`. Use `"high"` for portraits, close-ups, identity-sensitive edits |
| `size` | `"1024x1024"` / `"1024x1536"` / `"1536x1024"` / `"auto"` | Portrait: `1024x1536`, Landscape: `1536x1024`, Square: `1024x1024` |
| `output_format` | `"png"` / `"webp"` / `"jpeg"` | WebP for smaller size, PNG for quality |
| `background` | `"transparent"` / `"opaque"` / `"auto"` | Note: transparent not supported on this model |

**Pricing:** Token-based (billed through Cloudflare unified billing)
- Input tokens: $5.00 / 1M
- Input image tokens: $8.00 / 1M
- Output image tokens: $30.00 / 1M
- Output tokens: $10.00 / 1M

**Call pattern:**
```typescript
const response = await env.AI.run(
  'openai/gpt-image-2',
  {
    prompt: 'A photorealistic candid photo...',
    images: [
      selfieRef1,      // Identity: face
      selfieRef2,
      styleRef1,       // Style: aesthetic
      styleRef2,
      productImage,    // Optional: product
    ],
    quality: 'medium',
    size: '1024x1536',
  },
  { gateway: { id: 'opinionated-imagen-ig' } }  // AI Gateway required for proxied models
);
```

**Prompting for photorealism (from OpenAI cookbook):**
- Include the word "photorealistic" directly
- Add "shot on iPhone" or "mirrorless camera" for the right lens feel
- Specify real texture: "visible pores, natural skin texture, flyaway hairs"
- Specify natural light: "soft diffuse daylight", "golden hour", "overcast"
- Request imperfection: "no heavy retouching", "honest and unposed", "slight film grain"

---

### Secondary (test): `bytedance/seedream-5-lite` (Proxied)

Faster and cheaper per image. Has `image_input[]` for variation from a reference. Docs show single-image variation only; the parameter is an array so multi-reference may work but is unverified.

**Use for:** Contact sheet variations — pass the gpt-image-2 anchor image and generate 7 variations fast. Only if multi-reference is confirmed to work.

| Parameter | Values | Notes |
|-----------|--------|-------|
| `prompt` | string (required) | Text prompt |
| `image_input` | string[] | Reference image URLs. May support multiple |
| `size` | `"2K"` / `"3K"` | Output resolution |
| `aspect_ratio` | `"match_input_image"` / ratios | Match input or pick ratio |
| `output_format` | `"png"` / `"jpeg"` | |
| `max_images` | integer | Batch generation limit |

**Pricing:** $0.035 / image (billed through Cloudflare)

**Status:** Pending verification. Do not build production flows on this until multi-reference is confirmed.

---

### Ruled Out (Proxied)

| Model | Why not |
|-------|---------|
| `google/imagen-4` | Text-to-image only. No reference image input. Cannot do identity consistency without prompt engineering |
| `google/nano-banana-2` | Text-to-image only. Same problem as imagen-4 |

---

## Vision / Curation (Hosted)

### `google/gemma-4-26b-a4b-it` (Hosted)

Vision-capable model running on Cloudflare's native GPU infrastructure.

**Use for:**
- Inspecting uploaded selfies → extracting face/body descriptors
- Inspecting style references → extracting color palette, contrast, composition
- Assembling structured Intention from Identity + Style + Prompt/Preset

**Call pattern:**
```typescript
const response = await env.AI.run(
  'google/gemma-4-26b-a4b-it',
  {
    messages: [
      { role: 'user', content: 'Describe the visual style of these images...' },
    ],
  }
  // No gateway needed — native Workers AI
);
```

---

### `moonshot-ai/kimi-k2.6` (Hosted)

Stronger reasoning. Fallback when gemma-4 doesn't produce detailed enough extraction.

**Use for:** Same as gemma-4, when output quality is insufficient.

---

## Model Selection Flow

```
Onboard (Profile Builder)
  → gemma-4-26b-a4b-it (hosted, vision)
  → kimi-k2.6 (hosted, fallback)

Create (Intention Assembler)
  → gemma-4-26b-a4b-it (hosted, text + structured output)

Generate (Anchor Image)
  → gpt-image-2 (proxied via AI Gateway)
  → quality: "medium" default, "high" for portraits

Generate (Variations)
  → gpt-image-2 (proxied, parallel calls)
  → seedream-5-lite (proxied, test — if multi-ref verified)
```

## Cost Estimates (per Contact Sheet)

Assumptions: 8 variations, 1024x1536, medium quality

| Step | Model | Type | Calls | Est. Cost |
|------|-------|------|-------|-----------|
| Profile Builder | gemma-4 | Hosted | 1 | negligible |
| Intention Assembler | gemma-4 | Hosted | 1 | negligible |
| Anchor Image | gpt-image-2 | Proxied | 1 | ~$0.03–0.06 |
| Variations | gpt-image-2 | Proxied | 7 | ~$0.21–0.42 |
| **Total** | | | **9** | **~$0.24–0.48** |

If seedream-5-lite works for variations: anchor ~$0.04, variations 7 × $0.035 = $0.245. Total ~$0.28.

Pack pricing should cover this with margin. Target: $0.50–1.00 per pack retail.
