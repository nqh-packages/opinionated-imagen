---
title: Auth — Magic Link Deferred to First Drop
type: feat
status: completed
date: 2026-05-09
---

# Auth — Magic Link Deferred to First Drop

## Overview

Magic link authentication deferred to first Drop creation. The Creator browses Scenes and sees The Brief without logging in. When they hit "Process Drop" for the first time, the auth wall appears. Email magic link via Cloudflare `send_email` binding, verification endpoint, session cookie.

---

## Problem Frame

The product's activation funnel is onboard → browse → brief → drop. Auth is not an entry gate — it only appears at the commitment point (first Drop creation). This means:

1. The Creator can explore freely before any friction
2. Auth surfaces exactly when we need to identify them (to link future Drops, manage subscription, and store their gallery)
3. The auth flow must be minimal: enter email, click link in email, done — no passwords, no signup form, no verification codes

The existing anonymous session system (UUID in localStorage) continues to work alongside auth. Once a Creator authenticates, their anonymous session data is linked to their account.

---

## Requirements Trace

- R1. D1 `users` table with id, email, created_at, last_seen
- R2. `POST /api/auth/magic-link` generates token, stores it in D1 with expiry, sends email via `EMAIL.send()` binding
- R3. `GET /api/auth/verify?token=x` validates token, issues `Secure; HttpOnly; SameSite=Strict` session cookie, deletes used token
- R4. `GET /api/auth/me` returns current user (from cookie) or 401
- R5. `POST /api/auth/logout` clears session cookie
- R6. Magic link verify page: minimal branded page, auto-redirects to Create
- R7. Rate limit: max 3 magic link sends per email per hour
- R8. Auth is required only at "Process Drop" — previous steps (browse, brief preview) are open

---

## Scope Boundaries

- **No password auth.** Magic links only. Passwordless is the product choice.
- **No OAuth/Social login.** Future iteration.
- **No signup/signin distinction.** Same flow for new and returning Creators — email gets a magic link regardless. The backend creates the user on first verification.
- **No subscription/payment integration.** Auth enables payments but this plan does not wire Stripe or tier checks.
- **No anonymous session linking.** Future iteration — for now, authenticated users start fresh. The existing anonymous session (onboard → profile build) is a separate flow from auth. A future issue bridges: "Your anonymous gallery will be linked to your account."
- **Verify endpoint returns JSON; Astro page handles UX client-side.** The verify API returns JSON (`{ ok: true, redirectTo: '/create' }` / `{ ok: false, error: '...' }`). The Astro page reads the token, calls the endpoint client-side, and handles redirect vs error display.
- **Auth middleware lives in `functions/middleware/auth.ts`.** Centralized, not duplicated across route files. Both `/api/auth/me` and future protected routes import from one source.

---

## Context & Research

### Relevant Code and Patterns

- **Existing Hono Worker** (`functions/index.ts`): Hono v4.12.18 with CORS, health check, and three route mounts (`/api/scenes`, `/api/upload`, `/api/profile`). `Bindings` type includes `DB`, `STORAGE`, `AI`, `EMAIL`. Cookie helpers available from `hono/helper/cookie` (getCookie, setCookie, deleteCookie, setSignedCookie).
- **D1 schema conventions** (`functions/migrations/0001_*.sql`): `TEXT NOT NULL DEFAULT (datetime('now'))` for timestamps, CHECK constraints for enums, indexed FK columns.
- **Route handler pattern** (`functions/routes/upload.ts`, `functions/routes/profile.ts`): Hono sub-app with `{ Bindings: T }` generic, try/catch with structured diagnostics from `functions/lib/diagnostics.ts`. No console.log.
- **UUID generation** (`functions/lib/id.ts`): `crypto.randomUUID()` for token IDs.
- **Frontend API client** (`src/lib/api.ts`): Simple fetch wrapper with JSON headers. No auth headers or credential forwarding currently — will need `credentials: 'include'` for cookie-based auth.
- **Email binding** (`EMAIL`): Already configured in `wrangler.toml`. Type is `SendEmail` from `@cloudflare/workers-types` (`EMAIL.send({ from, to, subject, html?, text?, headers? })`).
- **Existing pages** (`src/pages/`): Static Astro pages (`index.astro`, `onboard.astro`, `create.astro`, `gallery.astro`, `dashboard.astro`) with `Base.astro` layout.

### Institutional Learnings

- **Cookie auth pattern:** Hono's `setCookie(c, 'session', token, { httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 2592000 })` for 30-day sessions. `deleteCookie(c, 'session')` for logout.
- **CORS restriction for cookie auth:** Current CORS is `origin: '*'`, acceptable for anonymous session tokens. Cookie-based auth requires locked origins — any origin can make credentialed requests to a `*` CORS endpoint. Must restrict to the production origin(s) when cookies are in use.
- **Token expiry:** Magic link tokens expire after 15 minutes (not configurable by user, one-time use).
- **Timing-safe comparison:** Use `crypto.subtle.timingSafeEqual` for comparing raw token bytes when validating magic link tokens. Available via `nodejs_compat` in Workers.

### External References

- **Cloudflare SendEmail API:** `EMAIL.send({ from: 'auth@opinionated-imagen.com', to: creator@email.com, subject: 'Sign in to Opinionated Imagen', html: '<a href="...">Sign in</a>' })`. Requires the domain sending email to be verified in Cloudflare Email Routing.
- **Hono cookie helpers:** `setCookie`, `deleteCookie`, `getCookie`, `setSignedCookie` from `hono/helper/cookie`. For signed cookies, `setSignedCookie` uses HMAC-SHA256 with a secret. For this plan, use an unsigned cookie with a random session token stored in D1 (simpler, no secret management, and token can be revoked server-side).

---

## Key Technical Decisions

- **Unsigned session cookie with server-side session check instead of signed cookie:** The session cookie value is a random UUID stored in a `sessions_auth` table (separate from `sessions` for onboarding). To validate, the server looks up the cookie value in the `sessions_auth` table. This is simpler than managing a cookie signing secret, and it allows instant revocation (delete the session row). The cookie is still `Secure; HttpOnly; SameSite=Strict` for transport security.
- **Magic link tokens stored in a `magic_links` table with expiry:** Each token is a random UUID, stored alongside the email, expiration, and `used` flag. Verify endpoint marks as used (one-time use), creates user if new, creates auth session, sets cookie, deletes the magic link row.
- **D1 counter for rate limiting:** A `magic_link_attempts` counter table with email and window_start columns. Before sending a link, check how many attempts in the current hour window. Simpler than adding an external rate limiter service for this volume.
- **Verify page is server-rendered Astro, not React island:** The verify page receives a token query parameter. On load, the Astro page renders a script that calls `GET /api/auth/verify?token=...` and redirects based on the response. This keeps it lightweight — no React hydration needed for a redirect page.

---

## Open Questions

### Resolved During Planning

- Sender email address for magic links: `auth@opinionated-imagen.com` (subdomain of the main domain, must be verified in Cloudflare Email Routing). This gives a clean auth-specific identity separate from content emails.
- Session duration: 30 days (`maxAge: 2592000`). A Creator who returns monthly will generally have a valid session. Re-authentication is a smooth magic link flow, not a password.
- Token expiry: 15 minutes for magic link tokens. Short enough for security, long enough for email delivery delays.

### Deferred to Implementation

- Exact Cloudflare Email Routing setup: Need to verify the sender domain (`auth@opinionated-imagen.com`) in the Cloudflare dashboard and configure Email Routing DNS records.
- Whether `crypto.subtle.timingSafeEqual` works with the current `compatibility_date = "2025-04-01"` and `nodejs_compat` flag — verify during implementation. Fallback: simple `===` comparison (acceptable for UUID v4 tokens since collision is negligible, but timing-safe is preferred).
- Email template HTML styling — keep minimal and branded, exact styling deferred to implementation.

---

## Implementation Units

- U1. **D1 Schema — `users`, `magic_links`, `sessions_auth`, and `magic_link_attempts` tables**

**Goal:** Create the database tables needed for auth.

**Requirements:** R1, R2, R3, R7

**Dependencies:** None

**Files:**
- Create: `functions/migrations/0003_create_auth_tables.sql`

**Approach:**
- `users` table: `id` TEXT PK, `email` TEXT UNIQUE NOT NULL, `created_at` TEXT NOT NULL DEFAULT (datetime('now')), `last_seen` TEXT NOT NULL DEFAULT (datetime('now'))
- `magic_links` table: `token` TEXT PK, `email` TEXT NOT NULL, `used` INTEGER NOT NULL DEFAULT 0, `created_at` TEXT NOT NULL DEFAULT (datetime('now')), `expires_at` TEXT NOT NULL. Index on `email`.
- `sessions_auth` table: `id` TEXT PK (the session UUID cookie value), `user_id` TEXT NOT NULL REFERENCES users(id), `expires_at` TEXT NOT NULL, `created_at` TEXT NOT NULL DEFAULT (datetime('now')). Index on `user_id`.
- `magic_link_attempts` table: `id` INTEGER PK AUTOINCREMENT, `email` TEXT NOT NULL, `attempted_at` TEXT NOT NULL DEFAULT (datetime('now')). Index on `email, attempted_at`. Used for rate limiting queries (COUNT WHERE email = ? AND attempted_at > datetime('now', '-1 hour')).

**Test scenarios:**
- **Happy path:** All four tables created with correct schema, indexes, and constraints.
- **Edge case:** Re-running migration is idempotent (wrangler tracks applied migrations).
- **Integration:** Insert user → insert session_auth referencing user → select works. Insert magic_link → read by token works.

**Verification:**
- `wrangler d1 migrations apply opinionated-imagen-db` succeeds.
- Schema queries show all four tables with correct columns.

---

- U2. **Auth Route Handler — magic link, verify, me, logout**

**Goal:** Implement all four auth API endpoints.

**Requirements:** R2, R3, R4, R5, R7

**Dependencies:** U1 (schema must exist)

**Files:**
- Create: `functions/routes/auth.ts`
- Create: `functions/middleware/auth.ts` — reusable `requireAuth` middleware
- Create: `functions/lib/email.ts` — email template helpers
- Modify: `functions/index.ts` — mount auth routes, mount Drop placeholder route with auth middleware

**Approach:**

**POST /api/auth/magic-link (in routes/auth.ts):**
- Accept `{ email: string }` in body.
- Validate email format (simple regex, 422 if invalid).
- Rate limit check: query `magic_link_attempts` for attempts by this email in the last hour. If >= 3, return 429 `RATE_LIMIT_EXCEEDED`.
- Insert attempt row into `magic_link_attempts`.
- Generate token: `crypto.randomUUID()`.
- Insert into `magic_links` with `token`, `email`, `expires_at = datetime('now', '+15 minutes')`.
- Send email via `c.env.EMAIL.send({ from: 'auth@opinionated-imagen.com', to: email, subject: 'Sign in to Opinionated Imagen', html: '<html><body><p>Click to sign in:</p><a href="' + verifyUrl + '">Sign in</a><p>This link expires in 15 minutes.</p></body></html>' })`.
- Always return 200 `{ ok: true }` — even if email send fails (to not leak whether the email exists). If send fails, log diagnostic and return ok (the user just doesn't get the email).
- **Always return success** — do not reveal whether the email is registered or not.

**GET /api/auth/verify (in routes/auth.ts):**
- Accept `token` query parameter.
- Look up magic_link by token where `used = 0` and `expires_at > datetime('now')`.
- If not found → return JSON `{ ok: false, error: 'This link has expired or is invalid.' }`.
- Mark token as used: `UPDATE magic_links SET used = 1 WHERE token = ?`.
- Find or create user: `INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)` → `SELECT id FROM users WHERE email = ?`.
- Update `last_seen` on user.
- Generate session token: `crypto.randomUUID()`.
- Insert into `sessions_auth`: `INSERT INTO sessions_auth (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))`.
- Set cookie: `setCookie(c, 'session', sessionToken, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: 2592000 })`.
- Return JSON `{ ok: true, redirectTo: '/create' }`.
- The Astro verify page handles the JSON response client-side (redirect on ok, display error on not ok).

**Middleware — `requireAuth` (in functions/middleware/auth.ts):**
- Create `functions/middleware/auth.ts` exporting a `requireAuth` middleware function.
- The middleware reads `session` cookie via `getCookie(c, 'session')`, looks up `sessions_auth` by id where `expires_at > datetime('now')`, and returns 401 `AUTH_REQUIRED` with structured diagnostic if invalid.
- If valid, stores `userId` in `c.set('userId', userId)` and calls `c.next()`.
- Supports two usage patterns: `app.use('/api/drops/*', requireAuth)` for route-group protection, and per-route `dropApp.post('/', requireAuth, handler)`.
- Creates a placeholder Drop route `POST /api/drops` returning 501 Not Implemented (establishes the auth-on-Drop pattern without building the full Drop API).
- This middleware is NOT applied globally — only on routes that call for it.

**GET /api/auth/me:**
- Use `requireAuth` middleware.
- Return `{ authenticated: true, email, userId }` from the user lookup.

**POST /api/auth/logout:**
- Read session cookie, delete from `sessions_auth`, clear cookie via `deleteCookie(c, 'session', { path: '/' })`.
- Return 200 `{ ok: true }`.

**Mounting in index.ts:**
- Add `session: string | undefined` to Bindings type (for the set/get pattern).
- `app.route('/api/auth', authRoutes)`.
- Mount Drop placeholder under auth: `app.use('/api/drops/*', requireAuth)` + `app.post('/api/drops', requireAuth, (c) => c.json({ error: 'Not implemented' }, 501))`.
- **Update CORS config**: Change `cors({ origin: '*' })` to `cors({ origin: ['https://opinionated-imagen.nqh.workers.dev', 'http://localhost:4321'], credentials: true })`. Production origin and dev origin only. The `credentials: true` flag enables cookie transmission.

**Email template (functions/lib/email.ts):**
- Export a function `buildMagicLinkEmail(verifyUrl: string): { subject: string, html: string }`.
- Minimal branded HTML: product name, sign in link, expiry note, small brandr footer "designed by brandr".
- No AI language per brand rules.

**Test scenarios:**
- **Happy path (magic link):** POST with valid email → 200 `{ ok: true }`. Row in `magic_links` table.
- **Happy path (verify):** GET with valid token → redirects to /create. Session cookie set. User created or found.
- **Happy path (me):** GET with valid cookie → `{ authenticated: true, email }`.
- **Happy path (logout):** POST /auth/logout → cookie cleared, session row deleted. GET /me → 401.
- **Edge case (rate limit):** 4th magic link request within 1 hour → 429 `RATE_LIMIT_EXCEEDED`.
- **Edge case (expired token):** GET verify with expired link → error page or redirect to error.
- **Edge case (used token):** GET verify with already-used link → same as expired.
- **Edge case (invalid token):** GET verify with garbage → error page.
- **Edge case (no cookie):** GET /me without any cookie → 401 `AUTH_REQUIRED`.
- **Edge case (expired session):** GET /me with a session whose `expires_at` is in the past → 401.
- **Edge case (invalid email):** POST magic-link with `not-an-email` → 422.
- **Error path:** D1 query fails → 503 structured diagnostic.

**Verification:**
- curl magic link → check D1 for token row.
- Check logs/EMAIL.send was called (local: check Worker output in wrangler dev).
- curl verify with token → check cookie header in response, check session row in D1.
- curl /me with cookie → returns user data.
- curl /me after logout → 401.

---

- U3. **Magic Link Verify Page + Auth Wall on "Process Drop"**

**Goal:** Astro verify page and frontend auth integration at the Process Drop gate.

**Requirements:** R6, R8

**Dependencies:** U2 (API endpoints exist)

**Files:**
- Create: `src/pages/auth/verify.astro` — verify landing page
- Modify: `src/islands/CreateApp.tsx` — add auth wall + Process Drop button

**Approach:**

**Verify Page (src/pages/auth/verify.astro):**
- Astro page using Base layout, minimal branded content.
- On page load (inline script, no React): read `token` from URL query string.
- Calls `GET /api/auth/verify?token=TOKEN` via fetch.
- On `{ ok: true, redirectTo: '/create' }` → `window.location.href = response.redirectTo`.
- On `{ ok: false, error: '...' }` → display the error message inline with a "Request a new link" CTA.
- Display: Opinionated Imagen logo/name, "Signing you in..." spinner during the API call, auto-redirect on success, or error message on failure ("This link has expired. Request a new one.").

**Auth Wall on Process Drop (src/islands/CreateApp.tsx):**
- The existing CreateApp shows Scenes and The Brief. No "Process Drop" button yet.
- Below The Brief panel, add a "Process Drop" button.
- On click:
  1. Call `GET /api/auth/me` with `credentials: 'include'`.
  2. If 200 (authenticated), proceed to the Drop creation flow (future — for now, show "Coming soon" or transition state).
  3. If 401 (not authenticated), show an auth overlay/modal with an email input field and a "Send magic link" button.
  4. On "Send magic link", call `POST /api/auth/magic-link` with the email. Show "Check your email" confirmation.
  5. The Creator checks their email, clicks the link, verify page processes it, sets cookie, redirects to /create. The React island re-mounts, calls /me again, finds them authenticated, and proceeds.
- State management: A simple `useAuth()` hook or state variable: `null` (unknown/loading), `{ authenticated: true, email }`, or `{ authenticated: false }`.
- The auth modal should be simple: title ("Sign in to continue"), email input, submit button, confirmation state ("Check your email for the sign-in link"), error state.
- No "AI" language. Use "Process your first Drop" or similar product language.
- Handle the localStorage session token pattern — this auth flow creates a separate cookie-based session. They coexist.

**Auth-aware API client (src/lib/api.ts):**
- Add `credentials: 'include'` to the default fetch init so cookies are sent with API calls when the user is authenticated.
- No breaking changes — the existing `api()` function gets `credentials: 'include'` as a default.

**Test scenarios:**
- **Happy path (verify page):** Load `/auth/verify?token=VALID` → shows "Signing you in..." → auto-redirects to /create.
- **Happy path (expired link):** Load `/auth/verify?token=EXPIRED` → shows error message with "Request a new one" CTA.
- **Happy path (auth wall):** In CreateApp, click "Process Drop" without auth → auth modal appears.
- **Happy path (magic link flow):** Enter email → "Check your email" → open magic link → redirect to /create → auth check passes.
- **Edge case:** Click "Process Drop" while already authenticated (cookie valid) → no auth wall, proceeds.
- **Error path:** API call failures show appropriate error states (retry button, not a blank screen).

**Verification:**
- Navigate to `/create` without being authenticated → browse scenes freely, see The Brief.
- Click "Process Drop" → auth wall appears.
- Complete magic link flow → redirected to /create → click "Process Drop" → no wall.


---

## System-Wide Impact

- **Interaction graph:** The `getCookie` / `setCookie` / `deleteCookie` helpers from `hono/helper/cookie` are used in middleware and route handlers. The auth middleware is opt-in per route — no routes change behavior until they explicitly use it.
- **Error propagation:** Auth failures are 401 with structured diagnostics. Frontend `ErrorBoundary` wraps all async islands — auth failures should trigger the auth wall, not crash the UI.
- **State lifecycle risks:** Magic link tokens are one-time use. If the Creator requests a link but doesn't click it, the old one expires after 15 minutes. If they click after getting a new one, the old link was already used (one-time). Session cookies last 30 days — refresh logic is not needed for v1 (if expired, the Creator gets the magic link flow again, which is frictionless).
- **Unchanged invariants:** All existing API surfaces return the same responses. The anonymous session system (`sessions` and `uploads` tables) is untouched. Scenes, presets, health check — all unchanged.
- **Cookie-based auth coexists with anonymous session tokens:** The existing `sessionToken` in localStorage is unrelated to the new `session` cookie. They can both be present. Future work will link them.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Email delivery fails (SendEmail binding rate limits, DNS issues) | Always return 200 from magic-link endpoint. Log diagnostic. User can try again. Rate limiting prevents abuse. |
| Cloudflare Email Routing not configured for sender domain | Requirement for this feature. Must add `auth@opinionated-imagen.com` as verified sender. Document setup steps. |
| `crypto.randomUUID()` seed or entropy in workerd | Already used in `functions/lib/id.ts` for session tokens. Proven pattern. |
| Cookie not set in production due to mixed content / missing HTTPS | `secure: true` requires HTTPS. Production Workers always serve HTTPS. Local dev uses HTTP — set `secure: false` in dev or access Worker via `--remote`. |
| D1 query latency on cookie check every request (M-N latency issue) | D1 queries are fast for PK lookups. Session cache is deferred to future optimization (KV or in-memory cache). |
| `origin: '*'` CORS with cookie auth enables credentialed cross-origin requests | Restrict CORS origins to the production URL(s) in the Worker config. Current `cors({ origin: '*' })` must be narrowed when cookies are used. In dev, allow the Astro dev server origin (`http://localhost:4321`). |

---

## Documentation / Operational Notes

- **Email Routing setup:** Verify `auth@opinionated-imagen.com` in Cloudflare Dashboard → Email → Email Routing → Custom addresses. DNS records (MX, TXT) are auto-managed by Cloudflare.
- **D1 migration:** `npx wrangler d1 migrations create opinionated-imagen-db create_auth_tables` → write SQL → `npx wrangler d1 migrations apply opinionated-imagen-db --remote`.
- **Secrets:** No new secrets needed for this feature. Cookie signing is not used (session tokens are server-stored in D1).
- **Deferred to follow-up:** Anonymous session linking, OAuth/social login, payment integration, refresh token rotation, session caching in KV.

---

## Sources & References

- **Origin document:** GitHub Issue #5 — Auth: magic link deferred to first Drop
- **Related code:** `functions/routes/upload.ts`, `functions/routes/profile.ts` (route pattern), `functions/lib/diagnostics.ts` (error pattern), `functions/lib/id.ts` (UUID generation)
- **Hono cookie helpers:** `hono/helper/cookie` — `getCookie`, `setCookie`, `deleteCookie`, `setSignedCookie`
- **Existing plan:** `docs/plans/2026-05-09-001-feat-upload-pipeline-plan.md` (schema, route, error conventions)
- **Workers Email binding:** `SendEmail` type — `c.env.EMAIL.send({ from, to, subject, html })`
