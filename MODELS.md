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

### Model Name Format

Workers AI model names use `@cf/<provider>/<model>` format in the catalog and API. The common `google/gemma-4-26b-a4b-it` shorthand is **not** the API name — use `@cf/google/gemma-4-26b-a4b-it` in `env.AI.run()` calls.

### Proxied vs Hosted

| Model | Provider | API Name | Type | Infrastructure |
|-------|----------|----------|------|---------------|
| gpt-image-2 | OpenAI | `openai/gpt-image-2` | Proxied | AI Gateway → OpenAI |
| imagen-4 | Google | `google/imagen-4` | Proxied | AI Gateway → Google |
| seedream-5-lite | ByteDance | `bytedance/seedream-5-lite` | Proxied | AI Gateway → ByteDance |
| nano-banana-2 | Google | `google/nano-banana-2` | Proxied | AI Gateway → Google |
| Gemma 4 26B | Google | `@cf/google/gemma-4-26b-a4b-it` | **Hosted** | Native Cloudflare GPUs |
| Kimi K2.6 | Moonshot AI | `@cf/moonshotai/kimi-k2.6` | **Hosted** | Native Cloudflare GPUs |

### AI Gateway Setup

Proxied models (gpt-image-2, imagen-4, etc.) require an AI Gateway. The gateway acts as a proxy between the Worker and the external provider.

1. Create the gateway in Cloudflare Dashboard: `AI → AI Gateway → Create Gateway`
2. Name it `opinionated-imagen-{niche}` (e.g., `opinionated-imagen-ig`)
3. Configure the provider API key in the gateway settings (e.g., OpenAI API key for gpt-image-2)
4. The gateway has `authentication: true` by default — requests to the gateway endpoint require a `Bearer` token (Cloudflare API token with AI Gateway Run permission). Set `authentication: false` if API-key-based auth is preferred.
5. Pass `{ gateway: { id: 'opinionated-imagen-ig' } }` in `env.AI.run()` calls for proxied models

**Note:** "No BYOK required" applies only to hosted Workers AI models. Proxied models (gpt-image-2, etc.) require the user to provide their own API key in the gateway settings.

---

## Image Generation

### Primary: `openai/gpt-image-2` (Proxied)

The only Workers AI image model that supports true multi-image editing. Pass up to 16 base64-encoded images and the model blends subjects, styles, and references into one output.

**Use for:** Reference sheet generation, anchor image generation — combining Identity Profile + Style Profile + Product Image + scene description.

| Parameter | Values | Notes |
|-----------|--------|-------|
| `prompt` | string (required) | Text description of the scene. Use photography language for photorealism. |
| `images` | string[] (base64) | Up to 16 reference images. Raw base64 or `data:image/{png\|jpeg\|webp};base64,...` URI |
| `quality` | `"low"` / `"medium"` / `"high"` / `"auto"` | Start with `"medium"`. Use `"high"` for portraits, close-ups, identity-sensitive edits. **Note:** `"standard"` is not a valid value. |
| `size` | `"1024x1024"` / `"1024x1536"` / `"1536x1024"` / `"auto"` | Portrait: `1024x1536`, Landscape: `1536x1024`, Square: `1024x1024` |
| `output_format` | `"png"` / `"webp"` / `"jpeg"` | WebP for smaller size, PNG for quality |

**Call pattern:**
```typescript
const response = await env.AI.run(
  'openai/gpt-image-2',
  {
    prompt: 'A photorealistic candid photo...',
    images: [selfieRef1, selfieRef2, styleRef1],
    quality: 'medium',
    size: '1024x1536',
  },
  { gateway: { id: 'opinionated-imagen-ig' } }  // Gateway required — needs OpenAI API key configured
);
```

**Prompting for photorealism (from OpenAI cookbook):**
- Include the word "photorealistic" directly
- Add "shot on iPhone" or "mirrorless camera" for the right lens feel
- Specify real texture: "visible pores, natural skin texture, flyaway hairs"
- Specify natural light: "soft diffuse daylight", "golden hour", "overcast"
- Request imperfection: "no heavy retouching", "honest and unposed", "slight film grain"
- For identity preservation: "Do not change face, facial features, skin tone, bone structure. Preserve exact likeness."

---

### Secondary (test): `bytedance/seedream-5-lite` (Proxied)

Faster and cheaper per image. Has `image_input[]` for variation from a reference. Docs show single-image variation only; the parameter is an array so multi-reference may work but is unverified.

**Use for:** Contact sheet variations — pass the gpt-image-2 anchor image and generate 7 variations fast. Only if multi-reference is confirmed to work.

**Status:** Pending verification. Do not build production flows on this until multi-reference is confirmed.

---

### Ruled Out (Proxied)

| Model | Why not |
|-------|---------|
| `google/imagen-4` | Text-to-image only. No reference image input. Cannot do identity consistency without prompt engineering |
| `google/nano-banana-2` | Text-to-image only. Same problem as imagen-4 |

---

## Vision / Curation (Hosted)

### `@cf/google/gemma-4-26b-a4b-it` (Hosted)

Vision-capable model running on Cloudflare's native GPU infrastructure. Despite being listed under "Text Generation" in the catalog, it supports image understanding via the OpenAI-compatible `messages` format with `image_url` type.

**Accepted image format:** OpenAI-compatible `image_url` with data URIs:
```typescript
{
  type: 'image_url',
  image_url: { url: 'data:image/jpeg;base64,...' }
}
```
The older `source` format (with `type: 'base64'` and `media_type`) is **not** supported.

**Limitations:**
- Accepts multiple images per request (tested with 9 images, ~15KB each)
- Image size affects context window — resize to max 512px longest edge, JPEG quality 70 for realistic use
- Response time: ~7-17 seconds for 3-9 photos
- Large images (many MB) may exceed the Worker's 128MB memory limit

**Use for:**
- Inspecting uploaded selfies → extracting face/body descriptors (see `core/functions/lib/prompts.ts` for the production prompt)
- Inspecting style references → extracting color palette, contrast, composition
- Assembling structured Intention from Identity + Style + Prompt/Preset

**Call pattern:**
```typescript
const response = await env.AI.run(
  '@cf/google/gemma-4-26b-a4b-it',
  {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } },
          { type: 'text', text: 'Describe this person...' },
        ],
      },
    ],
  }
  // No gateway needed — native Workers AI
);
```

---

### `@cf/moonshotai/kimi-k2.6` (Hosted)

Stronger reasoning. Fallback when gemma-4 doesn't produce detailed enough extraction. Replaces kimi-k2.5 (deprecated).

**Note:** The catalog may still list `@cf/moonshotai/kimi-k2.5` — always prefer kimi-k2.6 for new work.

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
