# Opinionated Imagen

## What

Your photos, elevated. Not a tool. An invisible creative team that makes your social wall look like it came from a magazine — as if you had an editor behind every shot.

For creators like Lily, this means no more Saturday afternoon shoots, no more praying a friend takes a good photo, no more scrolling presets to find something that sort of works. She uploads her photos, teaches the system her taste, and gets back magazine-grade content on demand.

One niche at a time. First niche: Instagram content for people like Lily.

She uploads her photos. The system learns her face and her taste. She tells it what she wants, or picks a **Scene**. The system answers back: "This is what I understood." She checks it, tweaks it once if it's wrong, and hits process. **The Edit** comes back: a curated sheet of variations. No prompt engineering. No surprises. One turn, one **Brief**, one **Drop**.

## Why

PhotoAI ships 30+ features. Video, 3D, mocap, face combining. Most people use maybe three of those. And even then, the output looks like AI — smooth skin, impossible lighting, that telltale synthetic sheen.

The opportunity is in the opposite direction. Make it small. Make it about one thing done well. Make it look like a magazine editorial team produced it, not like an AI spit it out. Build the architecture so it can stretch to other niches later, but ship one vertical first and make it actually work.

The positioning: this is not an AI product. It is a premium creative service. The language everywhere should feel like fashion editorial, not software. "Processing your Drop" not "Generating." "The Brief" not "Prompt Preview." "Scene" not "Preset." "The Edit" not "AI Output."

## Who

**Lily.** Mid-20s to early-30s. Posts to Instagram weekly, maybe more. She cares about her feed looking consistent but doesn't want to spend Saturday afternoon on a photoshoot. She cares about quality enough to pay for it, but not enough to learn AI parameters.

She is not a prompt engineer. She describes what she wants in plain words and expects it to be understood.

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

Second, her **Moodboard**. Eight to fifteen photos she actually likes. Her own past posts. Photos from other accounts she wishes were hers. Stuff that shows the system what kind of aesthetic she wants.

Onboarding is not instant. She uploads, she waits, she gets a notification when it's ready.

### 2. Create

She opens the Create page. Two ways in.

**Option A, Scene.** She browses the Scene catalog. "Cafe Aesthetic." "Golden Hour Portrait." "Streetwear Fit Check." Each Scene is a curated setup. The catalog is presented as a browse-first card grid — magazine editorial energy, not a software catalog.

**Option B, Custom.** She types freeform. "Me at a basketball court, golden hour, wearing the Nikes I uploaded." She can upload a product image if she wants.

### 3. The Brief

This is the center of the product.

The system builds a structured plan for what it will generate. Then it renders that plan as The Brief — a plain-language paragraph:

> You at a warm cafe table, morning window light from the left. Muted-film grade, soft shadows. 8 shots: 3 seated portraits, 2 candid over-shoulder, 2 detail shots, 1 wide environment.

Every clause is inline-editable. She clicks any phrase, changes it. The text updates live. That is her One Turn. She tweaks once, or she doesn't tweak at all. Then she hits Process.

No preview image. No cheap draft. Just a confirmation of what the system understood, in words, before it commits.

### 4. Process

The system generates against her confirmed brief. Identity and style profiles are used for consistency. Variations are processed in the background. The Edit comes back.

Time: a few minutes. She can leave the page; she gets notified when it's ready.

### 5. Archive

She sees The Edit as a clean contact sheet. She can save individual shots to her Archive. She can discard the whole set. If she flags it within 5 minutes, no charge.

She can also remix a saved shot. That starts a new Brief with the saved shot as the starting point.

Paid only. No free tier. No watermarks. The output is clean from the first pixel.

## Drop Model

A Drop is one execution. One confirmed Brief becomes one Edit (8 variations). Like a film roll: one scene, multiple takes, fully processed.

| Offering | Price | What you get |
|----------|-------|-------------|
| Single Drop | $10 | One scene, fully produced. 8 shots. One-time purchase. |
| Monthly Access | $29/mo | 4 Drops per month. Priority processing. |

Drops do not roll over. Unused Drops expire at the end of the billing period. No weekly billing. No quarterly plans in v1.

The one-off Drop is the trial. Someone who isn't sure pays $10 once, sees the quality, and converts to Monthly Access.

## Scene Catalog

A Scene is a packaged setup bundled with the niche. Each Scene defines a setting, a composition mix, and default style cues. Scenes are presented as a browse-first card grid on the Create surface.

New niches ship their own catalog of Scenes. Nothing is shared between niches except the engine.

## Success Metrics

| Metric | What it measures |
|--------|-----------------|
| Activation | % of uploads who complete onboarding (selfie set + moodboard) |
| Creation | % of activated users who process a Drop within 7 days |
| Retention | % of Monthly Access users who process a Drop in 3 of 4 weeks |
| Quality | % of Edits where user saves at least one shot |
| Remix rate | % of saved shots that get remixed |

## Product Decisions

- **The Brief is a paragraph preview**, inline-editable by clause. Not a form. One Turn is communicated, not enforced.
- **Upload first, auth deferred.** Zero friction before photos land. Magic link required at first Drop.
- **Scenes as browse-first card grid.** Not a command palette. Editorial energy.
- **Paid only from first Drop.** No free tier. The $10 Single Drop is the trial.
- **One-off + Subscription from launch.** Single Drop and Monthly Access. Both billed through Stripe.
- **Positioning: premium creative service.** Not AI. Not software. The language is fashion editorial.

## Phase 1: Instagram

Six curated Scenes. One person per generation. The Brief as inline-editable paragraph. The Edit as 8 variations. Upload first, auth deferred. Single Drop ($10) + Monthly Access ($29/mo, 4 Drops). Web only.

## Phase 2: More Niches

The architecture supports any niche. LinkedIn headshots. Dating profile photos. Brand content for small businesses. Each niche is its own Scene catalog, its own pricing, its own user-facing language, all on the same engine.

## Phase 3: Scale

Community Scenes. Multi-person generation. Scheduled Drops. API for third-party integrations.
