// Test the generalized v2 prompt (non-specific photos)
const ACCOUNT_ID = '9a46bf386fe59a2ee57558506623aaac';
import { readFileSync } from 'fs';
const devVars = readFileSync('.dev.vars', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});
const CF_API_KEY = process.env.CF_API_KEY || devVars.CF_API_KEY;
const CF_EMAIL = process.env.CF_EMAIL || devVars.CF_EMAIL || 'rmdngo@gmail.com';
if (!CF_API_KEY) { console.error('No auth'); process.exit(1); }

const PROMPT = `You are a professional photographer's assistant creating a casting dossier. You are given a set of photos of one person — the same individual across all images. The photos may vary in quality, angle, lighting, clothing, and setting. Some may be selfies, others group shots, full-body, or candid. Some features may be obscured by accessories, angles, or shadows.

Your task: extract the person's consistent physical appearance across ALL photos. If a feature is visible in at least one photo, use that as evidence. If a feature is never clearly visible, omit it rather than guessing.

Describe what is consistently true about this person across the set.

1. AGE (plausible range)
2. GENDER
3. ETHNICITY (specific if distinguishable — "unsure" if not clear)
4. SKIN TONE (with undertone — "uncertain" if inconsistent)
5. FACE SHAPE (or "unclear" if obscured)
6. EYE COLOR (or "hidden" if always covered)
7. EYE SHAPE (or "unclear" if obstructed)
8. NOSE BRIDGE HEIGHT (low, medium, high — do not default to "medium")
9. NOSE TIP (or "unclear")
10. LIPS (fullness, cupid's bow — or "unclear")
11. HAIR COLOR (base + highlights/grey/silver — note if varies across photos)
12. HAIR TEXTURE AND STYLE (note if varies)
13. JAWLINE (or "unclear" if obscured)
14. FACIAL HAIR (or note if inconsistent)
15. DISTINCTIVE FEATURES (tattoos, scars, chains, jewelry — include which photos)
16. BODY TYPE (or "unclear" if only face visible)
17. CONSISTENCY NOTES: features that change between photos

CRITICAL: Do not guess. If unclear, say "unclear". These are utility photos, not portraits. Format as one paragraph.`;

const fs = await import('fs');
const sharp = (await import('sharp')).default;
const photoDir = process.env.HOME + '/.agents/skills/huy-face/photos';
const allPhotos = fs.readdirSync(photoDir).filter(f => f.endsWith('.jpg'));
const content = [];
for (const photo of allPhotos) {
  const data = fs.readFileSync(`${photoDir}/${photo}`);
  const resized = await sharp(data).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${resized.toString('base64')}` } });
}
content.push({ type: 'text', text: PROMPT });

console.log(`Sending ${allPhotos.length} photos...`);
const start = Date.now();
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/%40cf/google/gemma-4-26b-a4b-it`,
  {
    method: 'POST',
    headers: {
      'X-Auth-Email': CF_EMAIL,
      'X-Auth-Key': CF_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages: [{ role: 'user', content }] }),
  }
);
const elapsed = Date.now() - start;
const data = await res.json();
if (!data.success) { console.error('Error:', JSON.stringify(data.errors).substring(0,500)); process.exit(1); }
const desc = data.result?.response || data.result?.choices?.[0]?.message?.content || '';
console.log(`\nResponse: ${elapsed}ms | ${desc.length} chars\n`);
console.log('=== DESCRIPTION ===');
console.log(desc);
