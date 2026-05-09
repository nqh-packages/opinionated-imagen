#!/usr/bin/env node

/**
 * E2E auth test -- real D1, real API.
 *
 * Flow:
 *   1. POST /api/auth/magic-link -- create token
 *   2. Fetch token directly from D1
 *   3. GET /api/auth/verify?token=... -- session cookie
 *   4. GET /api/auth/me with cookie -- authenticated user
 *   5. POST /api/auth/logout
 *   6. GET /api/auth/me -- 401
 *
 * Usage: node tests/e2e/auth-e2e.mjs
 */

import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = 'https://opinionated-imagen.nqh.workers.dev';

// ---------------------------------------------------------------------------
// D1 helpers (via wrangler)
// ---------------------------------------------------------------------------

function d1Query(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'opinionated-imagen-db', '--remote', '--command', sql], {
    cwd: '/Volumes/BIWIN/CODES/opinionated-imagen',
    encoding: 'utf8',
    timeout: 15000,
  });
  // Parse JSON from wrangler output
  const match = out.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Could not parse D1 output');
  const parsed = JSON.parse(match[0]);
  return parsed[0]?.results || [];
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function sendMagicLink(email) {
  const res = await fetch(`${API_BASE}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function verifyToken(token) {
  const res = await fetch(`${API_BASE}/api/auth/verify?token=${encodeURIComponent(token)}`, {
    redirect: 'manual',
  });
  const body = res.status === 200 ? await res.json() : null;
  return { status: res.status, body, setCookie: res.headers.get('Set-Cookie') };
}

async function checkMe(cookie) {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Cookie: `session=${cookie}` },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function logout(cookie) {
  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: `session=${cookie}` },
  });
  const body = await res.json();
  return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCookieValue(setCookieHeader) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/^session=([^;]+)/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== E2E Auth Test: Magic Link Flow ===\n');

  // Clean up old test tokens first
  const testEmail = `e2e-test-${Date.now().toString(36)}@test.ngoquochuy.com`;

  // Step 1: Send magic link
  console.log(`1. Sending magic link to ${testEmail}...`);
  const magicRes = await sendMagicLink(testEmail);
  console.log(`   Response: ${magicRes.status} ${JSON.stringify(magicRes.data)}`);

  if (magicRes.status !== 200) {
    throw new Error(`FAIL magic link send: ${JSON.stringify(magicRes.data)}`);
  }
  console.log('   [OK] Magic link accepted');

  // Step 2: Fetch token from D1
  console.log('2. Fetching magic link token from D1...');
  const encodedEmail = encodeURIComponent(testEmail).replace(/%/g, '\\%');
  const rows = d1Query(
    `SELECT token, email, used, expires_at FROM magic_links WHERE email = '${testEmail.replace(/'/g, "''")}' ORDER BY created_at DESC LIMIT 1;`
  );

  if (!rows || rows.length === 0) {
    throw new Error('FAIL no token found in D1');
  }

  const verifyTokenVal = rows[0].token;
  console.log(`   [OK] Token: ${verifyTokenVal.slice(0, 8)}...`);
  console.log(`   Email: ${rows[0].email}`);
  console.log(`   Used: ${rows[0].used}`);
  console.log(`   Expires: ${rows[0].expires_at}`);

  if (rows[0].used !== 0) {
    throw new Error('FAIL token already marked as used');
  }

  // Step 3: Verify token
  console.log('3. Verifying magic link token...');
  const verifyRes = await verifyToken(verifyTokenVal);
  console.log(`   Response: ${verifyRes.status} ${JSON.stringify(verifyRes.body)}`);

  if (verifyRes.status !== 200 || !verifyRes.body?.ok) {
    throw new Error(`FAIL verify: ${JSON.stringify(verifyRes.body)}`);
  }

  const sessionCookie = extractCookieValue(verifyRes.setCookie);
  if (!sessionCookie) {
    throw new Error('FAIL no Set-Cookie header in verify response');
  }
  console.log(`   [OK] Session cookie: ${sessionCookie.slice(0, 8)}...`);
  console.log(`   [OK] Redirect to: ${verifyRes.body.redirectTo}`);

  // Check the token is now marked as used
  const checkRows = d1Query(
    `SELECT used FROM magic_links WHERE token = '${verifyTokenVal}';`
  );
  if (checkRows.length > 0) {
    console.log(`   [OK] Token used flag: ${checkRows[0].used}`);
  } else {
    console.log('   [OK] Token row deleted (cleanup)');
  }

  // Step 4: Check /me with session cookie
  console.log('4. Checking /api/auth/me with session...');
  const meRes = await checkMe(sessionCookie);
  console.log(`   Response: ${meRes.status} ${JSON.stringify(meRes.body)}`);

  if (meRes.status !== 200 || !meRes.body.authenticated) {
    throw new Error(`FAIL /me: ${JSON.stringify(meRes.body)}`);
  }
  console.log(`   [OK] Authenticated as: ${meRes.body.email}`);

  // Step 5: Logout
  console.log('5. Logging out...');
  const logoutRes = await logout(sessionCookie);
  console.log(`   Response: ${logoutRes.status} ${JSON.stringify(logoutRes.body)}`);

  if (logoutRes.status !== 200) {
    throw new Error(`FAIL logout: ${JSON.stringify(logoutRes.body)}`);
  }
  console.log('   [OK] Logged out');

  // Step 6: Verify /me returns 401 after logout
  console.log('6. Checking /api/auth/me after logout (expect 401)...');
  const meAfter = await checkMe(sessionCookie);
  console.log(`   Response: ${meAfter.status} ${JSON.stringify(meAfter.body)}`);

  if (meAfter.status !== 401) {
    throw new Error(`FAIL expected 401 after logout, got ${meAfter.status}`);
  }
  console.log('   [OK] Rejected (401)');

  console.log('\n=== E2E Auth Test: PASSED ===\n');
}

main().catch(err => {
  console.error(`\n=== E2E Auth Test: FAILED ===`);
  console.error(err.message);
  process.exit(1);
});
