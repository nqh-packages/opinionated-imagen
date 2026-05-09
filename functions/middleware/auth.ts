/**
 * Auth middleware — validates session cookie, sets userId on context.
 * Opt-in per route, not applied globally.
 */

import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';

type Bindings = {
  DB: D1Database;
};

type Variables = {
  userId: string;
};

/**
 * Middleware that checks for a valid session cookie.
 * Sets `c.get('userId')` on success.
 * Returns 401 `AUTH_REQUIRED` on failure.
 */
export async function requireAuth(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) {
  const sessionToken = getCookie(c, 'session');

  if (!sessionToken) {
    return c.json({
      error_code: 'AUTH_REQUIRED',
      message: 'Sign in to continue.',
      operation: 'auth_check',
      retriable: false,
      recovery_hint: 'Sign in or create an account to continue.',
    }, 401);
  }

  try {
    const session = await c.env.DB.prepare(
      'SELECT user_id, expires_at FROM sessions_auth WHERE id = ?1 AND expires_at > datetime(\'now\')',
    ).bind(sessionToken).first<{ user_id: string; expires_at: string }>();

    if (!session) {
      return c.json({
        error_code: 'AUTH_REQUIRED',
        message: 'Session expired. Sign in again.',
        operation: 'auth_check',
        retriable: false,
        recovery_hint: 'Request a new magic link to sign in.',
      }, 401);
    }

    c.set('userId', session.user_id);
    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({
      error_code: 'AUTH_CHECK_FAILED',
      message: 'Could not verify authentication.',
      operation: 'auth_check',
      context: { error: message },
      retriable: true,
      recovery_hint: 'Try again. If the issue persists, contact support.',
    }, 503);
  }
}
