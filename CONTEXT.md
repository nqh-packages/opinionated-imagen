# Opinionated Imagen — IG Content Niche

An AI image generation framework for individual creators who need consistent, on-brand visual content. The first niche is Instagram content creation: creators upload their photos, the system learns their look and aesthetic, then generates curated contact sheets through a one-turn intention confirmation flow. No prompt engineering required.

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
Freeform natural language input from the Creator describing what they want. Used independently or to override/extend a Preset.
_Avoid_: Prompt engineering, query, command.

### Product Image
An optional uploaded reference image (e.g., sneakers, a physical product) the Creator wants included in the generation.
_Avoid_: Prop, item, object, reference.

### Curation Engine
The subsystem that inspects a Creator's uploaded photos, maintains their Identity and Style Profiles, and assembles a structured generation plan.
_Avoid_: LLM, AI backend, orchestrator.

### Intention
The structured generation plan produced by the Curation Engine — what subject, what setting, what style, how many variations, and what composition mix.
_Avoid_: Prompt, request, generation spec.

### Intention Confirmation
The natural-language display of the Intention shown to the Creator before generation. Inline-editable; any field can be tweaked in a single turn.
_Avoid_: Preview, summary, confirmation dialog.

### One Turn
The single adjustment cycle allowed after Intention Confirmation. The Creator may edit any field once; the system re-renders the confirmation text instantly.
_Avoid_: Iteration, round, refinement pass.

### Generation Engine
The subsystem that executes image generation using Cloudflare Workers AI models, fed by the confirmed Intention plus Identity and Style Profiles.
_Avoid_: Generator, renderer, inference layer.

### Variation
A single image within a contact sheet — same scene, same subject, different composition, expression, or angle.
_Avoid_: Shot, frame, alternative.

### Contact Sheet
The complete output of one generation: a set of Variations (typically 8) of a single scene, returned as a gallery.
_Avoid_: Gallery, album, batch, pack output.

### Pack
A purchasable or subscription-granted unit of generation that produces one Contact Sheet.
_Avoid_: Credit, session, job, generation.

### Niche
A vertical market configuration of the framework — a set of Presets, pricing, and product copy tailored to a specific Creator audience.
_Avoid_: Vertical, segment, category.

## Relationships

- A **Creator** has exactly one **Identity Profile** and one **Style Profile**
- A **Selfie Set** feeds into an **Identity Profile**
- **Style References** feed into a **Style Profile**
- An **Intention** combines: a **Creator**'s Identity Profile, Style Profile, an optional **Product Image**, and either a **Preset** or **Prompt**
- An **Intention Confirmation** is the rendered display of an **Intention**
- A **Pack**, when executed, produces one **Contact Sheet**
- A **Contact Sheet** contains 4–12 **Variations** of the same scene
- A **Niche** contains a curated set of **Presets** and pricing rules

## Example dialogue

> **Dev:** "When a Creator uploads new Style References, do we regenerate all their past Contact Sheets?"
> **Domain expert:** "No — the Style Profile only affects future Intention Confirmations. Past outputs are immutable."
>
> **Dev:** "What if the Creator uploads a Product Image but doesn't mention it in their Prompt?"
> **Domain expert:** "The Curation Engine always includes the Product Image in the Intention. The confirmation text explicitly says what the Product Image is being used for, so the Creator sees it and can edit or remove it in their One Turn."
>
> **Dev:** "Is a Preset just a Prompt with a name?"
> **Domain expert:** "A Preset bundles a base scene description, default composition, and a variation plan. It's stronger than a plain Prompt — it defines the entire Contact Sheet structure, not just the scene."
>
> **Dev:** "Can a Creator buy a single Pack, or only subscriptions?"
> **Domain expert:** "Both. One-off Packs for occasional use; weekly/monthly/quarterly subscriptions for recurring content needs. The framework supports both, but the Niche configures which are offered."

## Flagged ambiguities

- "prompt" was used to mean both freeform Creator input and the internal structured generation parameters — resolved: freeform input is **Prompt**, internal parameters are part of the **Intention**
- "style" was used to mean both the extracted aesthetic fingerprint and a visual preset filter — resolved: extracted fingerprint is **Style Profile**, shipped template is **Preset**
- "reference" was used for identity photos, aesthetic photos, and product photos — resolved: identity photos form the **Selfie Set**, aesthetic inputs are **Style References**, commercial objects are **Product Images**
