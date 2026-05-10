// @rust-exception rationale: dev-sidecar script that calls the deployed Worker API. Needs sharp for image resizing and direct HTTP calls against the Workers AI REST API. Rust would add a cross-compilation dependency and extra build step for zero benefit — this script only runs on the product creator's local machine.

/**
 * Identity Profile Verification Script
 *
 * Automated verification for identity extraction quality.
 * Uploads Huy's 9 test photos to R2, triggers profile build,
 * compares gemma-4 output against ground truth JSON, saves
 * reference sheet for visual inspection.
 *
 * Usage:
 *   npx tsx test-scripts/verify-identity-profile.ts
 *
 * Prerequisites:
 *   - wrangler dev --remote running (or deployed Worker)
 *   - CF_API_KEY, CF_EMAIL env vars or in .dev.vars
 *   - Huy's photos at ~/.agents/skills/huy-face/photos/
 *   - Ground truth at ~/.agents/skills/huy-face/huy-facial-profile.json
 *
 * This file is gitignored — contains local paths.
 */

import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';

// ─── Config ────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE || 'http://localhost:8787';
const PHOTO_DIR = `${homedir()}/.agents/skills/huy-face/photos`;
const GROUND_TRUTH_PATH = `${homedir()}/.agents/skills/huy-face/huy-facial-profile.json`;

// Ground truth features to check
const FEATURES: { key: string; label: string; keywords: string[] }[] = [
  { key: 'age', label: 'Age', keywords: ['20s', 'twenty', 'young adult', 'early'] },
  { key: 'ethnicity', label: 'Ethnicity', keywords: ['vietnamese', 'southeast asian', 'east asian'] },
  { key: 'skinTone', label: 'Skin tone', keywords: ['warm', 'olive', 'medium'] },
  { key: 'faceShape', label: 'Face shape', keywords: ['oval', 'rectangular', 'oblong'] },
  { key: 'eyeColor', label: 'Eye color', keywords: ['dark brown', 'brown'] },
  { key: 'eyeShape', label: 'Eye shape', keywords: ['almond', 'hooded'] },
  { key: 'noseBridge', label: 'Nose bridge', keywords: ['low', 'flat'] },
  { key: 'noseTip', label: 'Nose tip', keywords: ['rounded', 'bulbous'] },
  { key: 'lips', label: 'Lips', keywords: ['medium', 'full', 'cupid'] },
  { key: 'hairColor', label: 'Hair color', keywords: ['silver', 'grey', 'salt', 'pepper', 'highlights'] },
  { key: 'hairTexture', label: 'Hair texture', keywords: ['thick', 'textured', 'coarse', 'straight'] },
  { key: 'jawline', label: 'Jawline', keywords: ['defined', 'angular'] },
  { key: 'distinctive', label: 'Tattoo/jewelry', keywords: ['tattoo', 'star', 'neck', 'chain', 'silver'] },
  { key: 'bodyBuild', label: 'Body build', keywords: ['lean', 'slim', 'athletic'] },
];

// ─── Helpers ───────────────────────────────────────────────────────

async function createSession(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/upload/presigned`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: [] }),
  });
  const data = await res.json() as any;
  return data.sessionToken;
}

async function uploadPhoto(sessionToken: string, filePath: string): Promise<void> {
  const filename = filePath.split('/').pop()!;
  const res = await fetch(`${API_BASE}/api/upload/presigned`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionToken,
      files: [{ uploadType: 'selfie', filename, contentType: 'image/jpeg' }],
    }),
  });
  const data = await res.json() as any;
  const url = data.uploads?.[0]?.presignedUrl;
  if (!url) throw new Error(`No presigned URL for ${filename}`);

  const photoData = readFileSync(filePath);
  const uploadRes = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: photoData,
  });
  if (!uploadRes.ok) throw new Error(`Upload failed for ${filename}: ${uploadRes.status}`);
}

async function triggerBuild(sessionToken: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/profile/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken }),
  });
  if (!res.ok) {
    const data = await res.json() as any;
    throw new Error(`Build trigger failed: ${JSON.stringify(data)}`);
  }
}

async function pollStatus(sessionToken: string, maxWaitMs = 60000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${API_BASE}/api/profile/status?sessionToken=${sessionToken}`);
    const data = await res.json() as any;
    if (data.status === 'ready') return 'ready';
    if (data.status === 'error' || data.status === 'profile_failed') return 'error';
    await new Promise(r => setTimeout(r, 2000));
  }
  return 'timeout';
}

async function getProfile(sessionToken: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/profile/status?sessionToken=${sessionToken}`);
  return res.json();
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('=== Identity Profile Verification ===\n');

  // 1. Load photos
  const { readdirSync } = await import('fs');
  const photos = readdirSync(PHOTO_DIR).filter(f => f.endsWith('.jpg'));
  console.log(`Photos found: ${photos.length}`);
  if (photos.length < 3) {
    console.error('ERROR: Need at least 3 photos. Is ~/.agents/skills/huy-face/photos/ set up?');
    process.exit(1);
  }

  // 2. Create session and upload photos
  console.log('\nCreating session...');
  const sessionToken = await createSession();
  console.log(`Session: ${sessionToken}`);

  console.log('Uploading photos...');
  for (const photo of photos) {
    await uploadPhoto(sessionToken, `${PHOTO_DIR}/${photo}`);
    console.log(`  Uploaded: ${photo}`);
  }

  // 3. Trigger build
  console.log('\nTriggering profile build...');
  await triggerBuild(sessionToken);
  console.log('  Building... (polling for up to 60s)');

  // 4. Poll for completion
  const status = await pollStatus(sessionToken);
  console.log(`  Status: ${status}`);

  if (status !== 'ready') {
    console.error('\nFAILED: Profile build did not complete successfully');
    process.exit(1);
  }

  // 5. Get the gemma-4 description (via status response or D1 query)
  // For now, we rely on the Worker writing to D1 — we read the description
  // from the profile status response if available, or need a direct D1 query.
  // The plan's U5 will make this available via the status endpoint.
  console.log('\nProfile built successfully!');
  
  // 6. Feature comparison (placeholder — real comparison needs the description)
  console.log('\nFeature comparison requires reading identity_profiles from D1.');
  console.log('Available via: wrangler d1 execute opinionated-imagen-db --command');
  console.log(`  "SELECT description FROM identity_profiles WHERE session_token='${sessionToken}'"`);
  console.log('\nThen compare against the ground truth JSON at:');
  console.log(`  ${GROUND_TRUTH_PATH}`);
  console.log('\nReference sheet (if generated) available at R2 key:');
  console.log(`  profiles/${sessionToken}/identity-reference.png`);

  // 7. Summary
  console.log('\n=== Summary ===');
  console.log(`Session: ${sessionToken}`);
  console.log(`Photos: ${photos.length}`);
  console.log(`Build status: ${status}`);
  console.log('Verification: Manual feature comparison needed (see Above)');
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
