/**
 * Profile routes — status polling and build trigger for async profile construction.
 */

import { Hono } from 'hono';
import { notFound, conflict, preconditionFailed, serviceUnavailable } from '../lib/diagnostics';

type Bindings = {
  DB: D1Database;
};

const profileApp = new Hono<{ Bindings: Bindings }>();

const MIN_SELFIES = 10;
const MIN_MOODBOARD = 5;

interface Session {
  token: string;
  status: string;
  selfie_count: number;
  moodboard_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/profile/status?sessionToken={token}
 *
 * Returns current session status and upload counts.
 * The frontend polls this while showing "Building your Profile..."
 */
profileApp.get('/status', async (c) => {
  const sessionToken = c.req.query('sessionToken');
  if (!sessionToken) {
    return c.json({ error: 'Missing sessionToken query parameter' }, 422);
  }

  try {
    const session = await c.env.DB.prepare(
      'SELECT token, status, selfie_count, moodboard_count, created_at, updated_at FROM sessions WHERE token = ?1',
    ).bind(sessionToken).first<Session>();

    if (!session) {
      return c.json(notFound('SESSION_NOT_FOUND', 'Session not found', { sessionToken }), 404);
    }

    return c.json({
      status: session.status,
      selfieCount: session.selfie_count,
      moodboardCount: session.moodboard_count,
      thresholds: {
        selfies: MIN_SELFIES,
        moodboard: MIN_MOODBOARD,
      },
    }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(serviceUnavailable('STATUS_LOOKUP_FAILED', 'Failed to retrieve session status', { error: message }), 503);
  }
});

/**
 * POST /api/profile/build
 *
 * Triggers async profile building. Validates minimum thresholds first.
 * The actual vision model extraction is out of scope for this issue —
 * this endpoint transitions the state and returns.
 */
profileApp.post('/build', async (c) => {
  let body: { sessionToken?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Request body must be valid JSON' }, 400);
  }

  const sessionToken = body.sessionToken;
  if (!sessionToken) {
    return c.json({ error: 'Missing sessionToken in request body' }, 422);
  }

  try {
    const session = await c.env.DB.prepare(
      'SELECT token, status, selfie_count, moodboard_count FROM sessions WHERE token = ?1',
    ).bind(sessionToken).first<Session>();

    if (!session) {
      return c.json(notFound('SESSION_NOT_FOUND', 'Session not found', { sessionToken }), 404);
    }

    if (session.status !== 'collecting') {
      return c.json(conflict('SESSION_NOT_COLLECTING', 'Profile build can only be triggered from collecting state', { currentStatus: session.status }), 409);
    }

    // Enforce minimum thresholds with gentle nudge
    if (session.selfie_count < MIN_SELFIES) {
      return c.json(preconditionFailed(
        'NOT_ENOUGH_SELFIES',
        `Need at least ${MIN_SELFIES} selfies to build profile`,
        { current: session.selfie_count, needed: MIN_SELFIES },
      ), 422);
    }
    if (session.moodboard_count < MIN_MOODBOARD) {
      return c.json(preconditionFailed(
        'NOT_ENOUGH_MOODBOARD',
        `Need at least ${MIN_MOODBOARD} moodboard photos to build profile`,
        { current: session.moodboard_count, needed: MIN_MOODBOARD },
      ), 422);
    }

    // Transition state
    await c.env.DB.prepare(
      "UPDATE sessions SET status = 'building_profile', updated_at = datetime('now') WHERE token = ?1",
    ).bind(sessionToken).run();

    return c.json({ status: 'building_profile' }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(serviceUnavailable('BUILD_TRIGGER_FAILED', 'Failed to trigger profile build', { error: message }), 503);
  }
});

export default profileApp;
