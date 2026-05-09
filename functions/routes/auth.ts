/**
 * Auth routes — magic link, verify, me, logout.
 */

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { generateId } from '../lib/id';
import { buildMagicLinkEmail } from '../lib/email';
import { requireAuth } from '../middleware/auth';
import { badRequest, serviceUnavailable } from '../lib/diagnostics';

type Bindings = {
  DB: D1Database;
  EMAIL: SendEmail;
  MAIL_FROM?: string;
};

type Variables = {
  userId: string;
};

const authApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_MAX = 3;

/**
 * POST /api/auth/magic-link
 *
 * Generates a magic link token, stores it, and sends an email.
 * Always returns 200 { ok: true } — does not reveal whether the email exists.
 * Rate limited to 3 attempts per email per hour.
 */
authApp.post('/magic-link', async (c) => {
  let body: { email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json(badRequest('INVALID_JSON', 'Request body must be valid JSON'), 400);
  }

  const email = body.email?.toLowerCase().trim();
  if (!email || !EMAIL_REGEX.test(email)) {
    return c.json(badRequest('INVALID_EMAIL', 'A valid email address is required.'), 422);
  }

  try {
    // Rate limit check: count attempts in the last hour
    const row = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM magic_link_attempts WHERE email = ?1 AND attempted_at > datetime('now', '-1 hour')",
    ).bind(email).first<{ count: number }>();
    const attemptCount = row?.count ?? 0;

    if (attemptCount >= RATE_LIMIT_MAX) {
      return c.json({
        ok: false,
        error_code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many sign-in attempts. Try again in an hour.',
        operation: 'magic_link_send',
        retriable: true,
        recovery_hint: 'Wait an hour before requesting another magic link.',
      }, 429);
    }

    // Record the attempt
    await c.env.DB.prepare(
      'INSERT INTO magic_link_attempts (email) VALUES (?1)',
    ).bind(email).run();

    // Generate and store magic link token
    const token = generateId();
    await c.env.DB.prepare(
      "INSERT INTO magic_links (token, email, expires_at) VALUES (?1, ?2, datetime('now', '+15 minutes'))",
    ).bind(token, email).run();

    // Build verify URL from the request's origin
    const origin = c.req.header('Origin') || `https://${c.req.header('Host')}`;
    const verifyUrl = `${origin}/auth/verify?token=${encodeURIComponent(token)}`;

    // Send email (best-effort — token is already stored)
    const emailContent = buildMagicLinkEmail(verifyUrl);
    const mailFrom = c.env.MAIL_FROM || 'auth@bybrandr.com';
    try {
      await c.env.EMAIL.send({
        from: mailFrom,
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
      });
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : 'Unknown error';
      // Diagnostic: email send failed but token is still valid
      console.warn(`[MAGIC_LINK] email send failed for ${email}: ${msg}`);
    }

    // Always return success — do not reveal whether email send succeeded
    // or whether the email is registered
    return c.json({ ok: true }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(serviceUnavailable('MAGIC_LINK_FAILED', 'Failed to send sign-in link.', { error: message }), 503);
  }
});

interface MagicLinkRow {
  email: string;
  token: string;
}

/**
 * GET /api/auth/verify?token={token}
 *
 * Validates a magic link token, creates/finds the user, sets a session cookie.
 * Returns JSON — the Astro verify page handles client-side redirect/error display.
 */
authApp.get('/verify', async (c) => {
  const token = c.req.query('token');

  if (!token) {
    return c.json({ ok: false, error: 'Missing verification token.' }, 400);
  }

  try {
    // Look up valid magic link — not used and not expired
    const link = await c.env.DB.prepare(
      "SELECT email FROM magic_links WHERE token = ?1 AND used = 0 AND expires_at > datetime('now')",
    ).bind(token).first<MagicLinkRow>();

    if (!link) {
      return c.json({
        ok: false,
        error: 'This link has expired or is invalid. Request a new one.',
      }, 400);
    }

    // Mark token as used (one-time use)
    await c.env.DB.prepare(
      'UPDATE magic_links SET used = 1 WHERE token = ?1',
    ).bind(token).run();

    // Find or create user
    const userId = generateId();
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO users (id, email) VALUES (?1, ?2)',
    ).bind(userId, link.email).run();

    // Get the actual user id (INSERT OR IGNORE means we need to SELECT)
    const user = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?1',
    ).bind(link.email).first<{ id: string }>();

    if (!user) {
      return c.json({
        ok: false,
        error: 'Could not create or find your account. Please try again.',
      }, 500);
    }

    // Update last_seen
    await c.env.DB.prepare(
      "UPDATE users SET last_seen = datetime('now') WHERE id = ?1",
    ).bind(user.id).run();

    // Create auth session (30-day expiry)
    const sessionToken = generateId();
    await c.env.DB.prepare(
      "INSERT INTO sessions_auth (id, user_id, expires_at) VALUES (?1, ?2, datetime('now', '+30 days'))",
    ).bind(sessionToken, user.id).run();

    // Set session cookie
    setCookie(c, 'session', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: 2_592_000, // 30 days
    });

    // Clean up the used magic link row
    await c.env.DB.prepare(
      'DELETE FROM magic_links WHERE token = ?1',
    ).bind(token).run();

    return c.json({ ok: true, redirectTo: '/create' }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(serviceUnavailable('VERIFY_FAILED', 'Could not verify sign-in link.', { error: message }), 503);
  }
});

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user, or 401.
 */
authApp.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId');

  try {
    const user = await c.env.DB.prepare(
      'SELECT id, email, created_at, last_seen FROM users WHERE id = ?1',
    ).bind(userId).first<{ id: string; email: string; created_at: string; last_seen: string }>();

    if (!user) {
      return c.json({
        error_code: 'AUTH_REQUIRED',
        message: 'User not found.',
        operation: 'auth_check',
        retriable: false,
        recovery_hint: 'Sign in again.',
      }, 401);
    }

    return c.json({
      authenticated: true,
      email: user.email,
      userId: user.id,
      createdAt: user.created_at,
      lastSeen: user.last_seen,
    }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(serviceUnavailable('ME_LOOKUP_FAILED', 'Could not retrieve user info.', { error: message }), 503);
  }
});

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie and deletes the session from D1.
 */
authApp.post('/logout', async (c) => {
  const sessionToken = getCookie(c, 'session');

  if (sessionToken) {
    try {
      await c.env.DB.prepare(
        'DELETE FROM sessions_auth WHERE id = ?1',
      ).bind(sessionToken).run();
    } catch {
      // Best-effort cleanup — ignore delete errors
    }
  }

  deleteCookie(c, 'session', { path: '/' });

  return c.json({ ok: true }, 200);
});

export default authApp;
