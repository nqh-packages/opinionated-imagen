# AGENTS.md — src/

Frontend — Astro v6 + React 19 + Tailwind CSS v4 + shadcn/ui.

## Stack

| Layer | Tool |
|-------|------|
| Static framework | Astro v6 (Vite 7) |
| App UI | React 19 |
| Components | shadcn/ui with `@base-ui/react` primitives |
| Styling | Tailwind CSS v4 (CSS-first config via `@theme` in `global.css`) |
| Icons | `@tabler/icons-react` |
| LLM sandbox | Arrow JS (`@arrow-js/sandbox`) |
| Animation | `tw-animate-css` + `class-variance-authority` |
| Bundler | Vite 8 (from Astro) |

## Architecture Rules

- **React for all interactive app surfaces.** Arrow JS is reserved for LLM-generated sandboxed code only.
- **shadcn/ui with `@base-ui/react` primitives.** No Radix. No hand-rolled widgets.
- **Mobile first.** Every screen designed for phone viewport first, desktop second.
- **PWA** architecture from day one (manifest, service worker, offline-aware).
- **Expo-ready.** Avoid web-only APIs in app surfaces. PWA architecture must port cleanly to React Native / Expo later.

## Dev

```bash
# Start Astro dev (port 4321, auto-proxies /api/* to localhost:8787)
pnpm dev:astro

# Full stack (Astro + Worker concurrently)
pnpm dev

# Build static site
pnpm build

# Preview production build
pnpm preview

# Typecheck
pnpm typecheck          # checks both src/ and functions/
npx tsc --noEmit        # src/ only
```

## Project Structure

```
src/
  components/
    ui/                  # shadcn/ui components (button.tsx)
  islands/               # React islands — auto-loaded in Astro pages
    OnboardApp.tsx       # Onboarding: upload Selfie Set + Moodboard
    CreateApp.tsx        # Create: Scene selection + custom Brief
    GalleryApp.tsx       # Archive: saved output library
  layouts/
    Base.astro           # Base HTML wrapper (head, meta, fonts)
  lib/
    api.ts               # Typed fetch wrapper for /api/*
    utils.ts             # cn() helper (clsx + tailwind-merge)
  pages/                 # Astro pages (.astro)
    index.astro          # Landing/marketing
    onboard.astro        # Onboarding flow
    create.astro         # Create Drop (Scene + Brief)
    gallery.astro        # Saved output (Archive)
    dashboard.astro      # Creator dashboard
  styles/
    global.css            # Tailwind v4 @theme config + base styles
```

## Design Tokens

**No raw values in component files.** Use CSS variables from `src/styles/global.css` or semantic Tailwind tokens:

✅ Good:
```tsx
<div className="bg-primary text-primary-foreground" />
<div className="text-muted-foreground" />
<div className="border border-border" />
className="rounded-lg"  {/* uses --radius-lg */}
```

❌ Bad:
```tsx
<div className="bg-[#000000] text-white" />
<div className="text-[#71717a]" />
className="rounded-[8px]"
```

### Available Tokens

| Category | Tokens |
|----------|--------|
| Surfaces | `bg-background`, `bg-primary`, `bg-secondary`, `bg-card`, `bg-muted`, `bg-accent` |
| Text | `text-foreground`, `text-primary-foreground`, `text-muted-foreground`, `text-card-foreground` |
| Borders | `border-border`, `divide-border` |
| Rings/Focus | `ring-ring`, `ring-offset-ring-offset` |
| Radius | `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl` |

Dark mode is handled via the `.dark` class. All tokens auto-switch.

## Code Style

### General Rules

- **Use `cn()` from `~/lib/utils`** — never hand-roll `clsx` + `tailwind-merge`.
  ```tsx
  import { cn } from '~/lib/utils';
  <Button className={cn('px-4', isActive && 'bg-primary')} />
  ```
- **No emojis** in source code. Use `@tabler/icons-react`.
  ```tsx
  import { IconUpload } from '@tabler/icons-react';
  <IconUpload className="size-5" />
  ```
- **No `console.log`** in app source. Use structured diagnostics (or error boundaries for user-visible errors).
- **No silent `.catch(() => {})`.** Annotate with `// @silent-catch reason:` or handle visibly.
- **Every async island wrapped in `<ErrorBoundary>`.** Dev: red overlay + stack. Prod: graceful fallback + retry CTA.

### React Conventions

- Use React 19 patterns (refs as props, `use()` for promises, `useActionState` for forms).
- The app uses the React Compiler — rely on automatic memoization. Do not hand-add `useMemo`/`useCallback` unless profiling proves it matters.
- Keep hooks colocated with the component that uses them unless shared across islands.
- Prefer platform-native solutions before custom code. Use shadcn/ui components for common UI patterns.
- `client:load` for critical islands (onboarding, create), `client:idle` for deferred (gallery, dashboard).

### Astro Conventions

- Pages are thin shells. Logic lives in React islands.
- Content pages (index.astro) are static. Interactive pages (onboard, create, gallery, dashboard) mount islands.
- Use `client:load` for interactive islands that need to be ready immediately.
- Use `client:idle` for islands that can load after page becomes responsive.
- Layouts handle `<head>`, meta tags, font loading, and global structure.

### API Calls

Use the typed `api()` helper from `~/lib/api.ts`:
```tsx
import { api } from '~/lib/api';

const { uploads } = await api<UploadsResponse>('/upload/presigned', {
  method: 'POST',
  body: JSON.stringify({ sessionToken, files }),
});
```

API errors return structured diagnostics (`{ error_code, message, retriable }`). Every fetch should have error handling:
- 4xx → show inline validation / nudge
- 5xx (retriable) → show retry CTA
- Network error → show offline state

## Component Patterns

### shadcn/ui Components

Components live in `src/components/ui/`. Currently: `button.tsx`.

Adding new shadcn components:
```bash
npx shadcn add button    # or card, dialog, input, etc.
```

All shadcn components use `@base-ui/react` primitives (not Radix).

### ErrorBoundary

Every async island must be wrapped:
```tsx
<ErrorBoundary fallback={<ErrorFallback onRetry={...} />}>
  <OnboardApp />
</ErrorBoundary>
```

Dev mode: shows red overlay with stack trace. Prod: graceful fallback + retry action.

## Naming

| Pattern | Example |
|---------|---------|
| Components | `PascalCase` → `Button`, `OnboardApp` |
| Files (React) | `PascalCase.tsx` → `OnboardApp.tsx` |
| Files (Astro) | `kebab-case.astro` → `onboard.astro` |
| Files (utilities) | `kebab-case.ts` → `api.ts`, `utils.ts` |
| CSS classes | Tailwind semantic tokens → `bg-primary`, `text-muted-foreground` |
| Icons | `Icon<PascalCase>` from `@tabler/icons-react` |

## Domain Language (Frontend-Specific)

| User-Facing | Rule |
|------------|------|
| **Creator** | Never "user" or "customer" |
| **Selfie Set** | Onboarding selfies. Never "training data" |
| **Moodboard** | Style/aesthetic reference photos |
| **Scene** | Curated preset (browse as card grid) |
| **The Brief** | Inline-editable paragraph preview of what will be generated |
| **Process** | Start generation (never "generate" or "AI") |
| **The Edit** | 8-shot output contact sheet |
| **Drop** | One execution unit (one Brief → one Edit) |
| **Archive** | Saved output library |
| **One Turn** | Single adjustment cycle after Brief — no prolonged dialogue |

## Testing

No test suite installed yet. When adding frontend tests:

```bash
# Expected: vitest + @testing-library/react + @vitejs/plugin-react
pnpm vitest run
pnpm vitest            # watch mode
```

Test patterns:
- **Integration tests first** — test React islands with mocked API responses.
- Unit tests for non-obvious utility logic (`cn()`, data transforms).
- No coverage theater. Test real behavior, not line counts.
- Use `~/` path alias for imports in tests.
- Reusable fixtures for session tokens, file payloads, and mock API responses.

See `docs/brand-guidelines.md` for messaging, voice, and vocabulary rules.
