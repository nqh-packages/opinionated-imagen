/**
 * Integration tests for auth routes.
 *
 * Uses Hono's app.request() with mock D1 and EMAIL bindings.
 * Tests the route handler logic, error codes, and state transitions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import authApp from '../functions/routes/auth';
import { MockD1 } from './mock-d1';

interface SendEmailCall {
  from: string;
  to: string;
  subject: string;
  html: string;
}

function createEnv() {
  const db = new MockD1();
  const emailCalls: SendEmailCall[] = [];
  const email: SendEmail = {
    send: async (msg: any) => {
      emailCalls.push({ from: msg.from, to: msg.to, subject: msg.subject, html: msg.html });
      return {} as any;
    },
  };

  return { db, emailCalls, email };
}

type Env = ReturnType<typeof createEnv>;

function makeApp(env: Env) {
  return authApp;
}

function request(method: string, path: string, env: Env, options?: { body?: unknown; cookie?: string }) {
  const init: RequestInit & { headers: Record<string, string> } = {
    method,
    headers: {} as Record<string, string>,
  };

  if (options?.body) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  if (options?.cookie) {
    init.headers['Cookie'] = `session=${options.cookie}`;
  }

  const url = new URL(`https://test.example.com${path}`);

  return makeApp(env).request(url.toString(), init, {
    DB: env.db as any,
    EMAIL: env.email as any,
  });
}

// ──────────────────────────────────────────
// POST /api/auth/magic-link
// ──────────────────────────────────────────

describe('POST /api/auth/magic-link', () => {
  let env: Env;

  beforeEach(() => {
    env = createEnv();
  });

  it('accepts valid email and stores token + sends email', async () => {
    // Rate limit: first attempt (count = 0)
    env.db.setResult('COUNT(*) as count', { count: 0 });

    const res = await request('POST', '/magic-link', env, {
      body: { email: 'test@example.com' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // Token row created
    const magicLinkQueries = env.db.queries.filter(q => q.sql.includes('INSERT INTO magic_links'));
    expect(magicLinkQueries).toHaveLength(1);

    // Attempt row created
    const attemptQueries = env.db.queries.filter(q => q.sql.includes('INSERT INTO magic_link_attempts'));
    expect(attemptQueries).toHaveLength(1);

    // Email sent
    expect(env.emailCalls).toHaveLength(1);
    expect(env.emailCalls[0].to).toBe('test@example.com');
    expect(env.emailCalls[0].subject).toBe('Sign in to Opinionated Imagen');
    expect(env.emailCalls[0].html).toContain('auth/verify?token=');
    expect(env.emailCalls[0].from).toBe('auth@opinionated-imagen.com');
  });

  it('returns 429 when rate limit exceeded (4th attempt)', async () => {
    env.db.setResult('COUNT(*) as count', { count: 3 });

    const res = await request('POST', '/magic-link', env, {
      body: { email: 'test@example.com' },
    });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error_code).toBe('RATE_LIMIT_EXCEEDED');

    // No token created
    const magicLinkQueries = env.db.queries.filter(q => q.sql.includes('INSERT INTO magic_links'));
    expect(magicLinkQueries).toHaveLength(0);

    // No email sent
    expect(env.emailCalls).toHaveLength(0);
  });

  it('returns 422 for invalid email', async () => {
    const res = await request('POST', '/magic-link', env, {
      body: { email: 'not-an-email' },
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error_code).toBe('INVALID_EMAIL');
  });

  it('returns 422 for missing email field', async () => {
    const res = await request('POST', '/magic-link', env, {
      body: {},
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error_code).toBe('INVALID_EMAIL');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await makeApp(env).request(
      'https://test.example.com/magic-link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      },
      { DB: env.db as any, EMAIL: env.email as any },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('INVALID_JSON');
  });
});

// ──────────────────────────────────────────
// GET /api/auth/verify
// ──────────────────────────────────────────

describe('GET /api/auth/verify', () => {
  let env: Env;

  beforeEach(() => {
    env = createEnv();
  });

  it('creates user, sets session cookie, deletes magic link for valid token', async () => {
    env.db.setResult('SELECT email FROM magic_links', { email: 'new@example.com' });
    env.db.setResult('SELECT id FROM users WHERE email', { id: 'new-user-id' });

    const res = await request('GET', '/verify?token=valid-token', env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.redirectTo).toBe('/create');

    // User created (INSERT OR IGNORE)
    const userInsert = env.db.queries.filter(q => q.sql.includes('INSERT OR IGNORE INTO users'));
    expect(userInsert).toHaveLength(1);

    // Session created
    const sessionInsert = env.db.queries.filter(q => q.sql.includes('INSERT INTO sessions_auth'));
    expect(sessionInsert).toHaveLength(1);

    // Magic link marked used then deleted
    const updateQueries = env.db.queries.filter(q => q.sql.includes('UPDATE magic_links'));
    expect(updateQueries).toHaveLength(1);
    const deleteQueries = env.db.queries.filter(q => q.sql.includes('DELETE FROM magic_links'));
    expect(deleteQueries).toHaveLength(1);

    // Cookie set
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Max-Age=2592000');
  });

  it('returns existing user (no duplicate) on returning email', async () => {
    // First verify: create user
    env.db.setResult('SELECT email FROM magic_links', { email: 'returning@example.com' });
    // Simulate existing user: SELECT after INSERT OR IGNORE returns user
    env.db.setResult('SELECT id FROM users WHERE email', { id: 'existing-user-id' });

    const res1 = await request('GET', '/verify?token=token-1', env);
    expect(res1.status).toBe(200);

    // Reset query log for second call
    env.db.queries = [];
    env.emailCalls = [];

    // Second verify: different token, same email
    env.db.setResult('SELECT email FROM magic_links', { email: 'returning@example.com' });
    env.db.setResult('SELECT id FROM users WHERE email', { id: 'existing-user-id' });

    const res2 = await request('GET', '/verify?token=token-2', env);
    expect(res2.status).toBe(200);

    // No duplicate user INSERT (INSERT OR IGNORE doesn't error, SELECT returns existing)
    const userInserts = env.db.queries.filter(q => q.sql.includes('INSERT OR IGNORE INTO users'));
    expect(userInserts).toHaveLength(1);
  });

  it('returns 400 for expired token', async () => {
    // Mock no row returned (token expired or invalid)
    env.db.setResult('SELECT email FROM magic_links', undefined);

    const res = await request('GET', '/verify?token=expired-token', env);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('expired or is invalid');
  });

  it('returns 400 for already-used token', async () => {
    // Token exists but used=1, so SQL WHERE used=0 won't match
    env.db.setResult('SELECT email FROM magic_links', undefined);

    const res = await request('GET', '/verify?token=used-token', env);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('returns 400 when token query param is missing', async () => {
    const res = await request('GET', '/verify', env);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Missing');
  });

  it('no session created on failed verification', async () => {
    env.db.setResult('SELECT email FROM magic_links', undefined);

    const res = await request('GET', '/verify?token=bad-token', env);
    expect(res.status).toBe(400);

    // No session created
    const sessionQueries = env.db.queries.filter(q => q.sql.includes('INSERT INTO sessions_auth'));
    expect(sessionQueries).toHaveLength(0);

    // No Set-Cookie header
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });
});

// ──────────────────────────────────────────
// GET /api/auth/me
// ──────────────────────────────────────────

describe('GET /api/auth/me', () => {
  let env: Env;

  beforeEach(() => {
    env = createEnv();
  });

  it('returns authenticated user with valid session cookie', async () => {
    // requireAuth looks up session_auth by id
    env.db.setResult('SELECT user_id, expires_at FROM sessions_auth', {
      user_id: 'user-123',
      expires_at: '2099-01-01',
    });
    // /me handler looks up user
    env.db.setResult('SELECT id, email, created_at, last_seen FROM users WHERE id', {
      id: 'user-123',
      email: 'test@example.com',
      created_at: '2025-01-01',
      last_seen: '2025-01-01',
    });

    const res = await request('GET', '/me', env, { cookie: 'valid-session-uuid' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.email).toBe('test@example.com');
    expect(body.userId).toBe('user-123');
  });

  it('returns 401 without session cookie', async () => {
    const res = await request('GET', '/me', env);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error_code).toBe('AUTH_REQUIRED');
  });

  it('returns 401 for expired session', async () => {
    // Session exists but expires_at is in the past
    env.db.setResult('SELECT user_id, expires_at FROM sessions_auth', {
      user_id: 'user-123',
      expires_at: '2020-01-01',
    });

    // requireAuth checks expires_at > datetime('now') — in a mock, the SQL pattern
    // won't match if expires_at is past. The mock returns based on configured result.
    // For expired sessions, we set no match — simulate "not found" by the middleware
    env.db.setResult('SELECT user_id, expires_at FROM sessions_auth', undefined);

    const res = await request('GET', '/me', env, { cookie: 'expired-session-uuid' });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error_code).toBe('AUTH_REQUIRED');
  });

  it('returns 401 when session references non-existent user', async () => {
    // requireAuth succeeds (finds session)
    env.db.setResult('SELECT user_id, expires_at FROM sessions_auth', {
      user_id: 'orphan-user',
      expires_at: '2099-01-01',
    });
    // /me handler finds no user row
    env.db.setResult('SELECT id, email, created_at, last_seen FROM users WHERE id', undefined);

    const res = await request('GET', '/me', env, { cookie: 'orphan-session-uuid' });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error_code).toBe('AUTH_REQUIRED');
  });

  it('returns 401 with malformed cookie value', async () => {
    // requireAuth reads cookie, tries to find session — no match
    env.db.setResult('SELECT user_id, expires_at FROM sessions_auth', undefined);

    const res = await request('GET', '/me', env, { cookie: 'not-a-real-session' });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error_code).toBe('AUTH_REQUIRED');
  });
});

// ──────────────────────────────────────────
// POST /api/auth/logout
// ──────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  let env: Env;

  beforeEach(() => {
    env = createEnv();
  });

  it('deletes session and clears cookie', async () => {
    const res = await request('POST', '/logout', env, { cookie: 'session-to-delete' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // Session deleted
    const deleteQueries = env.db.queries.filter(q => q.sql.includes('DELETE FROM sessions_auth'));
    expect(deleteQueries).toHaveLength(1);
    expect(deleteQueries[0].params).toContain('session-to-delete');

    // Cookie cleared
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain('Max-Age=0');
  });

  it('returns 200 without cookie (no-op)', async () => {
    const res = await request('POST', '/logout', env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // No DELETE query
    const deleteQueries = env.db.queries.filter(q => q.sql.includes('DELETE FROM sessions_auth'));
    expect(deleteQueries).toHaveLength(0);
  });
});
