#!/usr/bin/env node

/**
 * E2E auth test -- real D1, real email via agent-mailbox send.
 *
 * Flow:
 *   1. Create temp mailbox via agent-mailbox CLI
 *   2. POST /api/auth/magic-link -> token created in D1 (email send is best-effort)
 *   3. Fetch token from D1 via wrangler
 *   4. Build verify URL and send email via agent-mailbox send
 *   5. Poll mailbox for the email, extract verify token
 *   6. GET /api/auth/verify?token=... -> session cookie
 *   7. GET /api/auth/me with cookie -> authenticated user
 *   8. POST /api/auth/logout
 *   9. GET /api/auth/me -> 401
 *   10. Disable mailbox
 *
 * Prerequisites:
 *   agent-mailbox doctor   (CLI installed + healthy)
 *   npx wrangler whoami    (authenticated for D1)
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
// agent-mailbox CLI
// ---------------------------------------------------------------------------

function mailboxJson(args) {
  const out = execFileSync('agent-mailbox', [...args, '--json'], { encoding: 'utf8', timeout: 15000 });
  return JSON.parse(out.trim());
}

// ---------------------------------------------------------------------------
// D1 query via wrangler
// ---------------------------------------------------------------------------

function d1Query(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'opinionated-imagen-db', '--remote', '--command', sql], {
    cwd: REPO_ROOT, encoding: 'utf8', timeout: 15000,
  });
  const match = out.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Could not parse D1 output');
  return JSON.parse(match[0])[0]?.results || [];
}

// ---------------------------------------------------------------------------
// Production API helpers
// ---------------------------------------------------------------------------

async function api(method, path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...opts.headers }, ...opts.fetch });
  const body = res.ok ? await res.json() : null;
  return { status: res.status, ok: res.ok, body, setCookie: res.headers.get('Set-Cookie') };
}

async function sendMagicLink(email) {
  return api('POST', '/api/auth/magic-link', { fetch: { body: JSON.stringify({ email }) } });
}

async function verifyToken(token) {
  return api('GET', `/api/auth/verify?token=${encodeURIComponent(token)}`, { fetch: { redirect: 'manual' } });
}

async function checkMe(cookie) {
  return api('GET', '/api/auth/me', { headers: { Cookie: `session=${cookie}` } });
}

async function logout(cookie) {
  return api('POST', '/api/auth/logout', { headers: { Cookie: `session=${cookie}` } });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCookie(setCookie) {
  const m = setCookie?.match(/^session=([^;]+)/);
  return m ? m[1] : null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function esc(email) {
  return email.replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== E2E Auth Test: Magic Link Flow ===\n');

  // 1. Create temp mailbox
  console.log('1. Creating temporary mailbox...');
  const name = `img-auth-${Date.now().toString(36)}`;
  const { mailbox: { address: mailboxAddress } } = mailboxJson(['create', name, '--ttl', '900', '--purpose', 'Auth E2E test']);
  console.log(`   [OK] Mailbox: ${mailboxAddress}`);

  // 2. Send magic link (Worker creates token; email send is best-effort)
  console.log(`2. Sending magic link to ${mailboxAddress}...`);
  const magicRes = await sendMagicLink(mailboxAddress);
  console.log(`   Response: ${magicRes.status} ${JSON.stringify(magicRes.body)}`);
  if (!magicRes.ok) throw new Error(`FAIL magic link: ${JSON.stringify(magicRes.body)}`);
  console.log('   [OK] Token created');

  // 3. Fetch token from D1
  console.log('3. Fetching token from D1...');
  const rows = d1Query(`SELECT token FROM magic_links WHERE email = '${esc(mailboxAddress)}' ORDER BY created_at DESC LIMIT 1`);
  if (!rows?.length) throw new Error('FAIL no token in D1');
  const rawToken = rows[0].token;
  console.log(`   [OK] Token: ${rawToken.slice(0, 12)}...`);

  // 4. Send the actual email via agent-mailbox send
  console.log('4. Sending verification email via agent-mailbox...');
  const verifyUrl = `https://opinionated-imagen.nqh.workers.dev/auth/verify?token=${encodeURIComponent(rawToken)}`;
  const htmlBody = `<html><body><a href="${verifyUrl}">Sign in to Opinionated Imagen</a></body></html>`;
  mailboxJson(['send', mailboxAddress, mailboxAddress, 'Sign in to Opinionated Imagen', htmlBody, '--html']);
  console.log('   [OK] Email sent');

  // 5. Poll for the email, extract token
  console.log('5. Polling mailbox for email...');
  let extractedToken = null;
  for (let i = 1; i <= POLL_MAX; i++) {
    const inboxData = mailboxJson(['inbox', mailboxAddress]);
    if (inboxData.ok && inboxData.messages?.length > 0) {
      const msg = inboxData.messages[0];
      console.log(`   [OK] Email received (poll ${i})`);

      for (const suffix of ['html', 'text']) {
        try {
          const data = mailboxJson(['request', 'GET', `/v1/messages/${encodeURIComponent(msg.messageId || msg.id)}/${suffix}`]);
          // Body may be in data.message (PARSE_ERROR response) or data.body/data[suffix]
          const text = data.body || data[suffix] || data.message || '';
          const m = text.match(/\/auth\/verify\?token=([a-f0-9-]+)/i);
          if (m) { extractedToken = m[1]; break; }
        } catch { /* try next */ }
      }
      if (extractedToken) break;
    }
    console.log(`   [WAIT] Poll ${i}/${POLL_MAX}...`);
    await sleep(POLL_INTERVAL_MS);
  }

  if (!extractedToken) throw new Error('FAIL token not found in email body');
  console.log(`   [OK] Token extracted: ${extractedToken.slice(0, 12)}...`);

  // 6. Verify token
  console.log('6. Verifying magic link token...');
  const verifyRes = await verifyToken(extractedToken);
  console.log(`   Response: ${verifyRes.status} ${JSON.stringify(verifyRes.body)}`);
  if (verifyRes.status !== 200 || !verifyRes.body?.ok) throw new Error(`FAIL verify: ${JSON.stringify(verifyRes.body)}`);

  const sessionCookie = extractCookie(verifyRes.setCookie);
  if (!sessionCookie) throw new Error('FAIL no Set-Cookie');
  console.log(`   [OK] Session cookie: ${sessionCookie.slice(0, 12)}...`);

  // 7. /me authenticated
  console.log('7. Checking /api/auth/me...');
  const meRes = await checkMe(sessionCookie);
  console.log(`   Response: ${meRes.status} ${JSON.stringify(meRes.body)}`);
  if (meRes.status !== 200 || !meRes.body?.authenticated) throw new Error(`FAIL /me: ${JSON.stringify(meRes.body)}`);
  console.log(`   [OK] Authenticated as: ${meRes.body.email}`);

  // 8. Logout
  console.log('8. Logging out...');
  const logoutRes = await logout(sessionCookie);
  if (logoutRes.status !== 200) throw new Error(`FAIL logout: ${JSON.stringify(logoutRes.body)}`);
  console.log('   [OK] Logged out');

  // 9. /me -> 401 after logout
  console.log('9. Checking /api/auth/me (expect 401)...');
  const meAfter = await checkMe(sessionCookie);
  if (meAfter.status !== 401) throw new Error(`FAIL expected 401, got ${meAfter.status}`);
  console.log('   [OK] Rejected (401)');

  // 10. Cleanup
  console.log('10. Cleaning up...');
  mailboxJson(['disable', mailboxAddress]);
  console.log('   [OK] Mailbox disabled');

  console.log('\n=== E2E Auth Test: PASSED ===\n');
}

main().catch(err => {
  console.error(`\n=== E2E Auth Test: FAILED ===`);
  console.error(err.message);
  process.exit(1);
});
