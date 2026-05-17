# Nail Content Ekip Context

## Product Role

Nail Content Ekip is the first Opinionated Imagen product workspace. It turns real nail work photos into polished, post-ready Drops for nail salons and independent nail techs.

## Source Of Truth

- Product manifest: `products/nail-content/product.json`
- Market vision: `products/nail-content/PRODUCT.md`
- User-facing term mapping and agent context: `products/nail-content/CONTEXT.md`
- Brand source: `products/nail-content/brand/`
- Scene catalog: `products/nail-content/scenes/`
- First customer fixtures: `products/nail-content/test-cases/`

## Product Vocabulary

| User-facing term | Canonical term |
| --- | --- |
| Scene | Preset |
| The Brief | Intention Confirmation |
| The Edit | Contact Sheet |
| Drop | Pack |
| Archive | Gallery |
| Moodboard | Style References |
| Work Set | Product Image and source salon work material |
| Vibe | Style Preset |
| Process | Generate |
| Monthly Access | Subscription |

## Current Test Customer

The first concrete salon fixture is The Claw, a Budapest custom nail studio from BookNow. Treat The Claw as a customer/test case for Nail Content Ekip, not as a separate Opinionated Imagen product.

The Claw test case should prove that the product can take a real salon's reference-led brand, work-photo inputs, and booking-oriented visual language, then produce a clear Brief and a post-ready Edit without depending on live BookNow runtime data.

## Agent Rules

- Keep product-wide behavior in `products/nail-content/`.
- Keep customer-specific proof under `products/nail-content/test-cases/{test-case}/`.
- Do not write The Claw-specific terms into root `CONTEXT.md`.
- Do not pull live BookNow or Convex data into this product workspace unless Huy explicitly approves that integration scope.
- Run `pnpm product:validate nail-content` after product workspace edits.
- Run `pnpm product:compile nail-content` before Worker runtime verification.
