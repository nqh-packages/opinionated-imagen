# Opinionated Imagen — Canonical Domain Language

Shared internal language across all niche products. Every code path, API contract, and internal doc uses these terms. They never change between niches.

## Language

### Creator
A person who uses the system to generate content for their personal brand or social presence.
_Avoid_: User, customer, client, influencer.

### Selfie Set
The collection of photos a Creator uploads during onboarding to establish their identity. Used by the system to understand face, body, and appearance.
_Avoid_: Training data, dataset, upload batch.

### Identity Profile
The persistent, extracted representation of what a Creator looks like — stored as image references plus descriptive anchoring text.
_Avoid_: Model, face model, embedding, avatar.

### Style References
Photos a Creator uploads to teach the system their aesthetic preferences — color grading, contrast, mood, composition.
_Avoid_: Mood board, reference images, inspiration.

### Style Profile
The persistent, extracted aesthetic fingerprint derived from Style References — hue preferences, contrast level, film grain, lighting tendencies.
_Avoid_: Filter, preset style, look, grade.

### Preset
A JSON-defined template that bundles a scene description, default composition, and a variation plan. Curated by the product owner and shipped with the niche.
_Avoid_: Template, theme, pack template.

### Prompt
Freeform natural language input from the Creator describing what they want. Used independently or to override a Preset.
_Avoid_: Prompt engineering, query, command.

### Product Image
An optional uploaded reference image (e.g., sneakers, a physical product) the Creator wants included in the generation.
_Avoid_: Prop, item, object, reference.

### Intention
The structured generation plan produced by the system — what subject, what setting, what style, how many variations, and what composition mix.
_Avoid_: Prompt, request, generation spec.

### Intention Confirmation
The natural-language display of the Intention shown to the Creator before generation. Inline-editable; any field can be tweaked in a single turn.
_Avoid_: Preview, summary, confirmation dialog.

### One Turn
The single adjustment cycle allowed after Intention Confirmation. The Creator may edit any field once; the system re-renders the confirmation text instantly.
_Avoid_: Iteration, round, refinement pass.

### Variation
A single image within a Contact Sheet — same scene, same subject, different composition, expression, or angle.
_Avoid_: Shot, frame, alternative.

### Contact Sheet
The complete output of one generation: a set of Variations (typically 8) of a single scene, returned as a gallery.
_Avoid_: Gallery, album, batch, pack output.

### Pack
A purchasable or subscription-granted unit of generation that produces one Contact Sheet.
_Avoid_: Credit, session, job, generation.

### Gateway
A Cloudflare AI Gateway instance scoped to one niche. Named `opinionated-imagen-{niche}`.

## Relationships

- A **Creator** has exactly one **Identity Profile** and one **Style Profile**
- A **Selfie Set** feeds into an **Identity Profile**
- **Style References** feed into a **Style Profile**
- An **Intention** combines a Creator's **Identity Profile**, **Style Profile**, an optional **Product Image**, and either a **Preset** or **Prompt**
- An **Intention Confirmation** is the rendered display of an **Intention**
- A **Pack**, when executed, produces one **Contact Sheet**
- A **Contact Sheet** contains 4–12 **Variations** of the same scene
- A **Niche** contains a curated set of **Presets**, pricing rules, and user-facing term aliases

## Resolved Ambiguities

- "prompt" was used to mean both freeform Creator input and the internal structured generation parameters — resolved: freeform input is **Prompt**, internal parameters are part of the **Intention**
- "style" was used to mean both the extracted aesthetic fingerprint and a visual preset filter — resolved: extracted fingerprint is **Style Profile**, shipped template is **Preset**
- "reference" was used for identity photos, aesthetic photos, and product photos — resolved: identity photos form the **Selfie Set**, aesthetic inputs are **Style References**, commercial objects are **Product Images**
