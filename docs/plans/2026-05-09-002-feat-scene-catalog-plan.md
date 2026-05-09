---
title: Scene catalog — browse Scenes and view read-only Brief
type: feat
status: active
date: 2026-05-09
origin: https://github.com/nqh-packages/opinionated-imagen/issues/2
---

# Scene catalog — browse Scenes and view read-only Brief

## Overview

The Create page transitions from a "Pick a preset" utility to a browse-first editorial catalog. Creators see a card grid of curated Scenes — each card names the Scene and shows two tags. Clicking a Scene opens The Brief: a plain-language read-only paragraph describing the shot concept. No inline editing, no One Turn yet. Brand vocabulary: "Scene" not "Preset", no AI language.

---

## Problem Frame

The current Create page (`src/pages/create.astro`) shows a basic two-mode UI: Preset or Custom. The hardcoded `/api/presets` endpoint returns one dummy preset. This is a placeholder — the product needs a catalog-first experience that feels like browsing an editorial magazine, not a software settings panel. Issue #2 is the entry point to the core creative loop: pick a Scene → confirm Brief → execute Drop.

---

## Requirements Trace

- R1. D1 `scenes` table with JSON metadata
- R2. `GET /api/scenes` returns scenes with name, description, compositionPlan, tags
- R3. Scene data loaded from `niches/ig-content/scenes/*.json` at build/runtime
- R4. Create page renders responsive card grid (2–4 columns) with Scene name + 2 tags
- R5. Clicking a Scene selects it and renders The Brief below/as overlay as a centered paragraph
- R6. Brief shows: baseScene text, composition plan summary, expected shot count
- R7. One Turn not yet implemented — Brief is read-only
- R8. Brand vocabulary: "Scene" not "Preset", no AI language

---

## Scope Boundaries

- **No inline editing.** The Brief is read-only. The inline editing flow is deferred to the One Turn implementation.
- **No custom/freeform prompt mode.** The previous "Custom" toggle is removed. The catalog is the only entry point for this slice.
- **No D1 seeding at runtime.** The D1 `scenes` table schema exists for completeness. The API serves scene data from a TypeScript module (bundled with the Worker) — the JSON files in `niches/ig-content/scenes/` are the design-level canonical source, and the TypeScript module mirrors them. D1-based reads and seeding from JSON are deferred until scenes become dynamic.
- **No image/thumbnail for Scene cards.** Cards show name + tags only. Scene imagery is a future visual enhancement.
- **No test infrastructure.** The project has no test runner configured. Unit/integration tests for this slice are deferred. Manual verification with curl and browser is the validation path.

---

## Context & Research

### Relevant Code and Patterns

- **Existing create page** (`src/pages/create.astro`): Renders `<CreateApp />` island with "Pick a preset" heading.
- **Existing CreateApp** (`src/islands/CreateApp.tsx`): Has preset/custom toggle, card grid for presets, Hono `fetch` to `/api/presets` — needs full rewrite for Scene vocabulary and browse-first layout.
- **Backend pattern** (`functions/index.ts`): Hardcoded `/api/presets` returns JSON array. Must be replaced by `/api/scenes` returning data from a TypeScript module.
- **Route mounting pattern** (`functions/routes/upload.ts`, `functions/routes/profile.ts`): Each route group is a separate Hono app mounted via `app.route()`.
- **D1 migration pattern** (`functions/migrations/0001_create_sessions_and_uploads.sql`): Sequential SQL files under `functions/migrations/`. Created via `wrangler d1 migrations create`.
- **Diagnostics pattern** (`functions/lib/diagnostics.ts`): Structured error responses with error_code, operation, context, retriable, recovery_hint.
- **Domain language** (from AGENTS.md): "Creator" not "user", "Scene" not "Preset", "The Brief" not "prompt", no AI language.
- **Worker bundling constraint**: Only files imported in the Worker module graph (starting from `functions/index.ts`) are bundled. Dynamic filesystem reads (`fs.readdir`, `fs.readFile`) of files outside the import graph do not work at runtime — the files aren't deployed.

### Institutional Learnings

- **D1 migration idempotence**: `CREATE TABLE IF NOT EXISTS` prevents errors on re-apply. Wrangler tracks applied migrations.
- **Worker module bundling**: wrangler bundles everything reachable from the entry point. JSON files imported via standard ES `import` are bundled correctly. Dynamic file reads are not supported.

---

## Key Technical Decisions

- **TypeScript module as Worker data source, JSON files as canonical design source**: Scene definitions live in `functions/lib/scenes-data.ts` as a typed array. This is imported by the Worker route, ensuring wrangler bundles it. The JSON files in `niches/ig-content/scenes/` remain as the design-level canonical documents — they define the scene catalog but are not read at runtime by the Worker. This solves the Cloudflare Worker bundling constraint (dynamic `fs` reads unbundled files).
- **D1 `scenes` table exists for schema completeness**: Created via migration. Not read by the API yet. Seeding D1 from JSON/source data is deferred to when scenes become dynamic.
- **Scene data schema extends the existing preset shape**: Adds `tags` array, `shotCount` (derived from compositionPlan ratios sum), and keeps `baseScene`, `compositionPlan` from the existing schema.
- **`/api/presets` removed, `/api/scenes` replaces it**: The old hardcoded endpoint returns one dummy preset. No backward compatibility needed — no production data depends on it.

---

## Open Questions

### Resolved During Planning

- How to handle Worker filesystem access for JSON files? → Use a TypeScript data module (`functions/lib/scenes-data.ts`) that imports the data directly. The JSON files remain as design documents only.
- What happens to the custom/freeform prompt mode? → Removed for this slice. It was a placeholder.

### Deferred to Implementation

- Exact Scene card visual design — the plan outlines structure; visual polish belongs in implementation.
- Brief layout: below the grid vs overlay — the AC says "below/as overlay". Decide during implementation based on available viewport.

---

## Implementation Units

### U1. **Scene data module + D1 schema + API endpoint**

**Goal:** Create the Scene definitions (TypeScript data module + JSON design docs), the D1 `scenes` table, and the `GET /api/scenes` endpoint that replaces the hardcoded `/api/presets`.

**Requirements:** R1, R2, R3, R8

**Dependencies:** None

**Files:**
- Create: `niches/ig-content/scenes/cafe-aesthetic.json` (updated schema with tags — design document)
- Create: `niches/ig-content/scenes/coffee-shop-meeting.json` (second Scene — ensures the catalog isn't a single-item list)
- Create: `niches/ig-content/scenes/golden-hour-portrait.json` (third Scene — demonstrates diversity)
- Create: `functions/lib/scenes-data.ts` — typed Scene array imported by the Worker
- Create: `functions/migrations/0002_create_scenes.sql` — D1 scenes table
- Create: `functions/routes/scenes.ts` — GET /api/scenes handler
- Modify: `functions/index.ts` — mount scenes routes, remove old presets endpoint

**Approach:**
- Scene data shape (mirrored in both JSON design docs and TypeScript module):
  ```typescript
  interface Scene {
    id: string;
    name: string;
    description: string;    // 1-2 sentence card description
    baseScene: string;      // full brief paragraph
    tags: string[];         // exactly 2 tags per card
    compositionPlan: { type: string; ratio: number }[];
    requiresProductImage: boolean;
    shotCount: number;      // computed: sum of compositionPlan ratios
  }
  ```
- D1 migration (`0002_create_scenes.sql`):
  ```sql
  CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    base_scene TEXT NOT NULL DEFAULT '',
    composition_plan TEXT NOT NULL DEFAULT '[]',
    requires_product_image INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```
- `functions/lib/scenes-data.ts` exports a typed array with the same data as the JSON files. The route imports this module.
- `functions/routes/scenes.ts`: Hono sub-app with `GET /`. Returns the Scene array. Uses structured diagnostics on error. 200 with array on success.
- Mount in `index.ts`: remove hardcoded `/api/presets`, add `app.route('/api/scenes', scenesApp)`.

**Patterns to follow:**
- Route module pattern from `functions/routes/profile.ts` — Hono sub-app with typed Bindings
- Response shape from existing `diagnostics.ts` — structured errors
- JSON file shape from existing `cafe-aesthetic.json` — extend with `tags`

**Test scenarios:**
- **Happy path:** GET `/api/scenes` returns 200 with an array of scenes, each having: id, name, description, tags, baseScene, compositionPlan, shotCount
- **Happy path:** Three scenes defined in data module → response array length is 3
- **Brand vocabulary check:** Response uses "scenes" not "presets"; no AI language in descriptions
- **Edge case:** Empty data module → returns 200 with empty array (graceful empty state)

**Verification:**
- `curl http://localhost:8787/api/scenes` returns array of scenes with all required fields
- D1 migration applies cleanly (`wrangler d1 migrations apply opinionated-imagen-db`)
- `pnpm typecheck` passes

---

### U2. **Frontend: Scene catalog with Brief overlay**

**Goal:** Rewrite CreateApp.tsx from the preset/custom toggle into a browse-first Scene catalog with a Brief panel that appears on Scene selection.

**Requirements:** R4, R5, R6, R7, R8

**Dependencies:** U1 (needs the `/api/scenes` endpoint)

**Files:**
- Modify: `src/islands/CreateApp.tsx` — full rewrite
- Modify: `src/pages/create.astro` — update heading: "Choose a Scene" + subtext: "Browse curated Scenes and explore each Brief before confirming"

**Approach:**
1. Remove the Preset/Custom toggle. Create page is catalog-only.
2. Fetch `GET /api/scenes` on mount — show loading spinner, graceful error state.
3. Responsive card grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` — one column on mobile, 2 on tablet, 3-4 on desktop.
4. Each card shows:
   - Scene name (semibold heading)
   - Two tags rendered as small badges/chips (visual signal, not labels)
   - Subtle hover/active state
5. Clicking a card:
   - Visually selects it (highlight border/background)
   - Slides down / opens The Brief panel below the grid
   - Brief panel is a centered, max-w-prose prose block showing:
     - Scene name as heading
     - `baseScene` text as a readable paragraph
     - Composition plan summary: "4 shots: 3 seated portraits, 2 candid, ..."
     - Expected shot count: "8 shots total"
   - No "Generate" or "Confirm" button yet — read-only (One Turn deferred)
6. Brand vocabulary throughout: "Scene", "The Brief", never "Preset" or "AI".

**Component structure within CreateApp:**
```
CreateApp
├── SceneGrid (the card grid)
│   └── SceneCard × N (individual card with name + tags)
└── TheBrief (conditional panel, shown when scene selected)
    ├── Scene name heading
    ├── Brief paragraph (baseScene)
    ├── Composition plan summary
    └── Shot count ("N shots total")
```

**Patterns to follow:**
- Existing `useState` + `useEffect` patterns from current `CreateApp.tsx` for data fetching
- `cn()` utility from `src/lib/utils.ts` for class merging
- Tailwind CSS v4 tokens (`bg-card`, `text-muted-foreground`, `border-border`)

**Test scenarios:**
- **Happy path:** Scenes load → grid renders with correct card count → clicking a card shows Brief below
- **Happy path:** Brief shows baseScene text, composition summary (e.g., "3 seated portraits, 2 candid..."), and shot count
- **Edge case:** Loading state — spinner shown while /api/scenes is fetching
- **Edge case:** Empty catalog — graceful empty state message ("No Scenes available")
- **Edge case:** Error state — error message shown when fetch fails, with retry hint
- **Edge case:** Mobile viewport — single column grid, Brief panel full-width below
- **Brand vocabulary check:** No "Preset" or "AI" in any rendered text; uses "Scene" and "The Brief"

**Verification:**
- Create page loads in browser — Scene catalog renders with cards
- Clicking a Scene shows The Brief panel with correct content
- Responsive: 1 col on mobile, 2-4 on desktop
- `pnpm typecheck` passes

---

## System-Wide Impact

- **Interaction graph:** The old `/api/presets` endpoint is removed. The only consumer is `CreateApp.tsx`, which is rewritten in U2.
- **Error propagation:** Standard structured diagnostics for API errors.
- **Unchanged invariants:** All other pages (index, onboard, gallery, dashboard) and API routes (upload, profile, health) are untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Scene data stale relative to JSON design docs | The TypeScript data module and JSON files must be kept in sync. Add a comment in the data module pointing to the canonical JSON sources. A future improvement could auto-generate the TS module from JSON. |
| No ErrorBoundary component exists in the project | U2 should include a simple inline error state (try/catch in fetch, render error message with retry button) instead of depending on a shared ErrorBoundary component that doesn't exist yet |

---

## Documentation / Operational Notes

- **Adding new Scenes**: Update `functions/lib/scenes-data.ts` with the new scene definition AND create a corresponding JSON file in `niches/ig-content/scenes/` for the design record.
- **D1 scenes table**: Created for schema completeness. No active reads yet. Can be seeded in a future migration when dynamic scenes are needed.
- **`/api/scenes` replaces `/api/presets`**: The old endpoint is removed. Any code still referencing `/api/presets` will 404.

---

## Sources & References

- **Origin document:** GitHub Issue #2 — Scene catalog: browse Scenes and view read-only Brief
- **Existing patterns:** `functions/routes/profile.ts` for Hono sub-app pattern, `src/islands/CreateApp.tsx` for React island pattern
- **Domain language:** AGENTS.md (Scene not Preset, no AI language)
