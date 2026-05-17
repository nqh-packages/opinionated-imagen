/**
 * Prompt templates for Workers AI model calls.
 * These are starting points — tune empirically against the canonical test subject (AGENTS.md).
 */

export const IDENTITY_EXTRACTION_PROMPT = `You are a professional photographer's assistant creating a casting dossier. You are given a set of photos of one person — the same individual across all images. The photos may vary in quality, angle, lighting, clothing, and setting. Some may be selfies, others group shots, full-body, or candid. Some features may be obscured by accessories, angles, or shadows.

Your task: extract the person's consistent physical appearance across ALL photos. If a feature is visible in at least one photo, use that as evidence. If a feature is never clearly visible, omit it rather than guessing.

Describe what is consistently true about this person across the set.

1. AGE (plausible range — look for visual maturity in the clearest front-facing photos)
2. GENDER (as visibly presented)
3. ETHNICITY (specific if distinguishable: Vietnamese, Thai, Chinese, Korean, Japanese, Filipino, Indian, Middle Eastern, European, African, Latino, mixed, etc. — "unsure" is acceptable if not clear)
4. SKIN TONE (warm olive, fair, light, medium, tan, deep, dark — with undertone: warm, cool, neutral — "uncertain" if inconsistent across photos)
5. FACE SHAPE (oval, round, heart, square, diamond, oblong, rectangular, or combination — or "unclear" if obscured)
6. EYE COLOR (exact shade — or "hidden" if always covered)
7. EYE SHAPE (almond, round, hooded, monolid, deep-set — or "unclear" if obstructed)
8. NOSE BRIDGE HEIGHT (low, medium, high — if side or 3/4 profile is visible, use that. If the bridge appears flat or has minimal projection from the side, it is LOW. Do not default to "medium".)
9. NOSE TIP (rounded, pointed, bulbous, flat — or "unclear")
10. LIPS (fullness: thin, medium, full; cupid's bow: defined or subtle — or "unclear")
11. HAIR COLOR (natural base color AND any highlights, grey, silver, dyed sections, roots — note if hair color changes between photos)
12. HAIR TEXTURE AND STYLE (straight, wavy, curly, coarse, fine; approximate length; typical styling — note if style changes across photos)
13. JAWLINE (defined or soft, angular or rounded — or "unclear" if obscured)
14. FACIAL HAIR (none, stubble, beard, mustache, goatee — describe coverage and density, or note if inconsistent across photos)
15. DISTINCTIVE FEATURES (tattoos, scars, piercings, beauty marks, glasses, chains, noticeable jewelry — include which photos they appear in if not consistent)
16. BODY TYPE (slim, athletic, stocky, curvy, lean, muscular — or "unclear" if only face visible)
17. CONSISTENCY NOTES: list any features that appear to CHANGE between photos (e.g., hair color varies, glasses sometimes, facial hair inconsistent)

CRITICAL RULES:
- If you cannot determine a feature because it is never visible, say "unclear" — do not guess.
- If a feature varies across photos (e.g., different hair colors, with/without glasses), note the most common state and flag the variation.
- If there are multiple people in a photo, focus on the person who appears most frequently across the full set.
- These are utility photos, not curated portraits. Imperfect lighting, blur, and unusual angles are expected. Work with what you have.

Format as a single paragraph. Use precise photographer terminology.`;

export const STYLE_EXTRACTION_PROMPT = `You are a senior photo editor extracting the reusable visual taste from a set of style reference photos.

These images are NOT identity truth. Do not describe the people as subjects to preserve. Extract the aesthetic, story structure, composition behavior, light, color, camera feeling, and editorial choices that should transfer to future photos.

Describe:
1. LIGHTING: source direction, softness, contrast, practical lights, shadows
2. COLOR: palette, white balance, saturation, color separation, skin rendering
3. CAMERA: lens feeling, distance, focal length impression, depth of field, motion blur
4. COMPOSITION: crop behavior, subject placement, negative space, perspective, layering
5. STORY: what kind of moment the image feels like, candid vs posed, commercial vs personal
6. TEXTURE: grain, sharpness, noise, imperfections, phone vs mirrorless feeling
7. TRANSFER RULES: what must carry into new images and what should not be copied literally

CRITICAL RULES:
- Extract vibe, composition, story, color, lens, and mood.
- Do not preserve the pose or framing of the user's own utility photos unless asked.
- Do not copy a reference person's identity, brand, logo, or exact scene.
- Prefer flexible direction that can adapt to weak or non-ready uploaded photos.

Format as one compact paragraph plus a short "transfer rules" sentence.`;

/**
 * Build the reference sheet prompt from a gemma-4 identity description.
 * The identity description is embedded directly as the "Person" specification.
 */
export function buildReferenceSheetPrompt(identityDescription: string): string {
  return `Generate a professional multi-angle portrait reference sheet of the exact same person described below.

Person: ${identityDescription}

Layout: THREE views of the SAME person on a clean white or light gray background — front-facing portrait (center), 3/4 angle (left), side profile (right).

Style requirements:
- Photorealistic photography, not illustration
- Clean studio lighting, soft and even
- Neutral expression, direct gaze (front view)
- Same clothing, same lighting across all three angles
- Sharp focus, visible skin texture, pores, flyaways, natural skin imperfections
- Shot on 85mm portrait lens, f/2.8, shallow depth of field
- No text overlays, no watermarks, no logo
- Each angle must show the exact same person — bone structure, hair, and skin must be identical
- Landscape composition, all three views fit side by side

Identity lock: Do NOT change this person's face, facial features, skin tone, bone structure, eye shape, nose, lips, or hair between angles. Preserve exact likeness across all three views.`;
}

export interface ContactSheetPromptInput {
  identityDescription: string;
  styleDescription: string;
  presetName: string;
  presetDescription: string;
  baseScene: string;
  creatorPrompt?: string;
  variationCount: number;
  variantMode:
    | "balanced-editorial"
    | "identity-safe-editorial"
    | "style-forward-editorial";
}

export function buildContactSheetPrompt(
  input: ContactSheetPromptInput,
): string {
  const variantDirection = {
    "balanced-editorial":
      "Balance identity preservation and style transfer. Keep the person recognisable while redesigning pose, composition, light, and story from the style profile.",
    "identity-safe-editorial":
      "Prioritize face and body likeness. Make composition and style editorial, but never trade away identity accuracy.",
    "style-forward-editorial":
      "Push the reference style harder through color, composition, mood, and storytelling. Keep identity recognizable but do not preserve the uploaded photo posing.",
  }[input.variantMode];

  return `Create one photorealistic contact sheet containing ${input.variationCount} distinct editorial variations of the same Creator.

Identity Profile:
${input.identityDescription}

Style Profile:
${input.styleDescription}

Preset:
${input.presetName} — ${input.presetDescription}

Scene:
${input.baseScene}

Creator Prompt:
${input.creatorPrompt?.trim() || "No extra prompt."}

Creative Control:
${variantDirection}

Contact sheet requirements:
- Output as a single composed image grid, not separate files.
- Every variation must show the same Creator, with consistent face, skin tone, body type, and hair.
- Do not preserve the pose, framing, or bad lighting from utility upload photos.
- Transfer vibe, color, composition, lens feeling, mood, and story from the Style Profile.
- Photorealistic by default. Like an iPhone or mirrorless camera photo, not AI art.
- Natural imperfections are required: pores, flyaways, uneven light, real skin texture.
- No text overlays, logos, watermarks, fake UI, captions, or borders.
- Avoid stock posing. Make each variation feel like a real moment someone could have taken.`;
}
