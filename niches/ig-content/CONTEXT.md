# IG Content Niche — User-Facing Language

This niche uses different words for what the canonical CONTEXT.md calls the same things. The user should never see our internal terms.

| User sees | Maps to canonical term |
|-----------|----------------------|
| Scene | Preset (generation template) |
| Vibe | Style Preset (curated aesthetic, picked during onboarding Step 2) |
| Upload my style | Custom Style extraction from uploaded Style References |
| The Brief | Intention Confirmation |
| The Edit | Contact Sheet |
| Drop | Pack |
| Archive | Gallery |
| Moodboard | Style References |
| Process | Generate |
| Monthly Access | Subscription (4 Drops/month) |
| Single Drop | One-off pack ($10) |
| Identity Profile | (never shown to user — internal only) |
| Style Profile | (never shown to user — internal only) |
| Hidden reference portrait | (never shown to user — internal only) |
| Building your Profile... | (shown during onboarding, maps to identity extraction running in background) |

Example dialogue:
- User-facing: "Processing your Drop..."
- Internal: "Generating Pack for Creator..."
- API response: `{ pack_id, status: "generating" }`
- Frontend: "Your Drop is being processed..."
