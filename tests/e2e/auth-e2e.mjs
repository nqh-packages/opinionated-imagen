#!/usr/bin/env node

/**
 * E2E auth test -- real D1, real EMAIL (when available), real agent-mailbox CLI.
 *
 * Two paths for getting the verify token:
 *   A) Email received: magic link delivered to mailbox -> extract from email body
 *   B) Email failed:  token fetched from D1 directly (email delivery infra not fully configured)
 *
 * The rest of the chain (verify -> /me -> logout -> 401) is always tested end-to-end
 * against the production Worker.
 *
 * Prerequisites:
 *   - agent-mailbox CLI:  agent-mailbox doctor
 *   - wrangler:           npx wrangler whoami
 *
 * Usage: node tests/e2e/auth-e2e.mjs
 */

import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = 'https://opinionated-imagen.nqh.workers.dev';
const REPO_ROOT = '/Volumes/BIWIN/CODES/opinionated-imagen';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX = 20;

// ---------------------------------------------------------------------------
// agent-mailbox CLI helper
// ---------------------------------------------------------------------------

function mailboxJson(args) {
  const out = execFileSync('agent-mailbox', [...args, '--json'], { encoding: 'utf8', timeout: 15000 });
  return JSON.parse(out.trim());
}

// ---------------------------------------------------------------------------
// D1 query helper (via wrangler)
// ---------------------------------------------------------------------------

function d1Query(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'opinionated-imagen-db', '--remote', '--command', sql], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 15000,
  });
  const match = out.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Could not parse D1 output');
  return JSON.parse(match[0])[0]?.results || [];
}

// ---------------------------------------------------------------------------
// Production API helpers
// ---------------------------------------------------------------------------

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const body = res.status >= 200 && res.status < 300 ? await res.json() : null;
  return { status: res.status, body, setCookie: res.headers.get('Set-Cookie'), ok: res.ok };
}

async function sendMagicLink(email) {
  return fetchJson(`${API_BASE}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

async function verifyToken(token) {
  return fetchJson(`${API_BASE}/api/auth/verify?token=${encodeURIComponent(token)}`, { redirect: 'manual' });
}

async function checkMe(cookie) {
  return fetchJson(`${API_BASE}/api/auth/me`, { headers: { Cookie: `session=${cookie}` } });
}

async function logout(cookie) {
  return fetchJson(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: `session=${cookie}` },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCookieValue(setCookie) {
  if (!setCookie) return null;
  const m = setCookie.match(/^session=([^;]+)/);
  return m ? m[1] : null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function escEmail(email) {
  return email.replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// Token resolution: try mailbox polling first, fall back to D1
// ---------------------------------------------------------------------------

async function resolveToken(mailboxAddress, fallbackEmail) {
  // Path A: Poll mailbox for incoming email
  console.log('3a. Polling mailbox for magic link email...');
  for (let i = 1; i <= POLL_MAX; i++) {
    const inboxData = mailboxJson(['inbox', mailboxAddress]);
    if (inboxData.ok && inboxData.messages?.length > 0) {
      const msg = inboxData.messages[0];
      console.log(`   [OK] Email received on poll ${i}`);
      console.log(`   Subject: ${msg.subject}`);
      console.log(`   From: ${msg.from}`);

      // Try HTML, fallback to text
      for (const suffix of ['html', 'text']) {
        try {
          const data = mailboxJson(['request', 'GET', `/v1/messages/${encodeURIComponent(msg.messageId || msg.id)}/${suffix}`]);
          const body = data.body || data[suffix] || '';
          const m = body.match(/\/auth\/verify\?token=([a-f0-9-]+)/i);
          if (m) return { source: 'email', token: m[1] };
        } catch { /* try next */ }
      }
    }
    console.log(`   [WAIT] Poll ${i}/${POLL_MAX}...`);
    await sleep(POLL_INTERVAL_MS);
  }

  // Path B: Fetch latest token from D1
  console.log('3b. Email not received — falling back to D1 token lookup...');
  const rows = d1Query(
    `SELECT token FROM magic_links WHERE email = '${escEmail(fallbackEmail)}' ORDER BY created_at DESC LIMIT 1`
  );
  if (!rows?.length) throw new Error('FAIL no token found in D1');
  console.log('   [OK] Token found in D1');
  return { source: 'd1', token: rows[0].token };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== E2E Auth Test: Magic Link Flow ===\n');

  // 1. Create temp mailbox
  console.log('1. Creating temporary mailbox...');
  const name = `img-auth-${Date.now().toString(36)}`;
  const createData = mailboxJson(['create', name, '--ttl', '900', '--purpose', 'Auth E2E test']);
  if (!createData.ok || !createData.mailbox) throw new Error(`FAIL create mailbox`);
  const mailboxAddress = createData.mailbox.address;
  console.log(`   [OK] Mailbox: ${mailboxAddress}`);

  // 2. Send magic link
  console.log(`2. Sending magic link to ${mailboxAddress}...`);
  const magicRes = await sendMagicLink(mailboxAddress);
  console.log(`   Response: ${magicRes.status} ${JSON.stringify(magicRes.body)}`);
  if (!magicRes.ok) {
    console.log('   (Email delivery failed — will use D1 fallback for token)');
  } else {
    console.log('   [OK] Magic link accepted');
  }

  // 3. Resolve verify token
  const { source, token } = await resolveToken(mailboxAddress, mailboxAddress);
  console.log(`   [OK] Token source: ${source}, value: ${token.slice(0, 8)}...`);

  // 4. Verify token
  console.log('4. Verifying magic link token...');
  const verifyRes = await verifyToken(token);
  console.log(`   Response: ${verifyRes.status} ${JSON.stringify(verifyRes.body)}`);
  if (verifyRes.status !== 200 || !verifyRes.body?.ok) {
    throw new Error(`FAIL verify: ${JSON.stringify(verifyRes.body)}`);
  }

  const sessionCookie = extractCookieValue(verifyRes.setCookie);
  if (!sessionCookie) throw new Error('FAIL no Set-Cookie header');
  console.log(`   [OK] Session cookie: ${sessionCookie.slice(0, 8)}...`);

  // 5. /me with session
  console.log('5. Checking /api/auth/me with session...');
  const meRes = await checkMe(sessionCookie);
  console.log(`   Response: ${meRes.status} ${JSON.stringify(meRes.body)}`);
  if (meRes.status !== 200 || !meRes.body?.authenticated) {
    throw new Error(`FAIL /me: ${JSON.stringify(meRes.body)}`);
  }
  console.log(`   [OK] Authenticated as: ${meRes.body.email}`);

  // 6. Logout
  console.log('6. Logging out...');
  const logoutRes = await logout(sessionCookie);
  console.log(`   Response: ${logoutRes.status} ${JSON.stringify(logoutRes.body)}`);
  if (logoutRes.status !== 200) throw new Error(`FAIL logout: ${JSON.stringify(logoutRes.body)}`);
  console.log('   [OK] Logged out');

  // 7. /me -> 401 after logout
  console.log('7. Checking /api/auth/me after logout (expect 401)...');
  const meAfter = await checkMe(sessionCookie);
  console.log(`   Response: ${meAfter.status} ${JSON.stringify(meAfter.body)}`);
  if (meAfter.status !== 401) {
    throw new Error(`FAIL expected 401 after logout, got ${meAfter.status}`);
  }
  console.log('   [OK] Rejected (401)');

  // 8. Cleanup
  console.log('8. Cleaning up mailbox...');
  mailboxJson(['disable', mailboxAddress]);
  console.log('   [OK] Mailbox disabled');

  console.log('\n=== E2E Auth Test: PASSED ===\n');
}

main().catch(err => {
  console.error(`\n=== E2E Auth Test: FAILED ===`);
  console.error(err.message);
  process.exit(1);
});
