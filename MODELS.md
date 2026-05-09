# Models

Reference for all AI models used in Opinionated Imagen. All run through Cloudflare Workers AI unless noted.

## Image Generation

### Primary: `openai/gpt-image-2`

The only model on Workers AI that supports true multi-image editing. Pass up to 16 base64-encoded images and the model blends subjects, styles, and references into one output.

**Use for:** Anchor image generation — combining Identity Profile (selfie set) + Style Profile (style refs) + Product Image + scene description into a single photorealistic image.

| Parameter | Values | Notes |
|-----------|--------|-------|
| `prompt` | string (required) | Text description of the scene |
| `images` | string[] (base64) | Up to 16 reference images. Raw base64 string or `data:image/{png\|jpeg\|webp};base64,...` URI |
| `quality` | `"low"` / `"medium"` / `"high"` / `"auto"` | Start with `"medium"`. Use `"high"` for portraits, close-ups, identity-sensitive edits |
| `size` | `"1024x1024"` / `"1024x1536"` / `"1536x1024"` / `"auto"` | Portrait: `1024x1536`, Landscape: `1536x1024`, Square: `1024x1024` |
| `output_format` | `"png"` / `"webp"` / `"jpeg"` | WebP for smaller size, PNG for quality |
| `background` | `"transparent"` / `"opaque"` / `"auto"` | Note: transparent not supported on this model |

**Pricing:** Token-based
- Input tokens: $5.00 / 1M
- Input image tokens: $8.00 / 1M
- Output image tokens: $30.00 / 1M
- Output tokens: $10.00 / 1M

**Multi-image edit pattern:**
```typescript
const response = await env.AI.run(
  'openai/gpt-image-2',
  {
    prompt: 'A photorealistic candid photo...',
    images: [
      selfieRef1,      // Identity: Lily's face
      selfieRef2,
      styleRef1,       // Style: her film grade
      styleRef2,
      productImage,    // Optional: product
    ],
    quality: 'medium',
    size: '1024x1536',
  },
  { gateway: { id: 'default' } }
);
```

**Prompting for photorealism (from OpenAI cookbook):**
- Include the word "photorealistic" directly
- Add "shot on iPhone" or "mirrorless camera" for the right lens feel
- Specify real texture: "visible pores, natural skin texture, flyaway hairs"
- Specify natural light: "soft diffuse daylight", "golden hour", "overcast"
- Request imperfection: "no heavy retouching", "honest and unposed", "slight film grain"

---

### Secondary (test): `bytedance/seedream-5-lite`

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

**Pricing:** $0.035 / image

**Status:** Pending verification. Do not build production flows on this until multi-reference is confirmed.

---

### Ruled Out

| Model | Why not |
|-------|---------|
| `google/imagen-4` | Text-to-image only. No reference image input. Cannot do identity consistency without prompt engineering |
| `google/nano-banana-2` | Text-to-image only. Same problem as imagen-4 |

---

## Vision / Curation

### `google/gemma-4-26b-a4b-it`

Vision-capable model. Used for profile building and intention assembly.

**Use for:**
- Inspecting uploaded selfies → extracting face/body descriptors
- Inspecting style references → extracting color palette, contrast, composition
- Assembling structured Intention from Identity + Style + Prompt/Preset

**Pattern:**
```typescript
const response = await env.AI.run(
  'google/gemma-4-26b-a4b-it',
  {
    messages: [
      { role: 'user', content: 'Describe the visual style of these images...' },
    ],
  },
  { gateway: { id: 'default' } }
);
```

---

### `moonshot-ai/kimi-k2.6`

Stronger reasoning. Fallback when gemma-4 doesn't produce detailed enough extraction.

**Use for:** Same as gemma-4, when output quality is insufficient.

---

## Model Selection Flow

```
Onboard (Profile Builder)
  → gemma-4-26b-a4b-it (vision)
  → kimi-k2.6 (fallback)

Create (Intention Assembler)
  → gemma-4-26b-a4b-it (text + structured output)

Generate (Anchor Image)
  → gpt-image-2 (multi-image edit)
  → quality: "medium" default, "high" for portraits

Generate (Variations)
  → gpt-image-2 (parallel calls)
  → seedream-5-lite (test — if multi-ref verified)
```

## Cost Estimates (per Contact Sheet)

Assumptions: 8 variations, 1024x1536, medium quality

| Step | Model | Calls | Est. Cost |
|------|-------|-------|-----------|
| Profile Builder | gemma-4 (vision) | 1 | negligible |
| Intention Assembler | gemma-4 (text) | 1 | negligible |
| Anchor Image | gpt-image-2 | 1 | ~$0.03–0.06 |
| Variations | gpt-image-2 | 7 | ~$0.21–0.42 |
| **Total** | | **9** | **~$0.24–0.48** |

If seedream-5-lite works for variations: anchor ~$0.04, variations 7 × $0.035 = $0.245. Total ~$0.28.

Pack pricing should cover this with margin. Target: $0.50–1.00 per pack retail.
