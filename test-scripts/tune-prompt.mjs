// Test the generalized (production) gemma-4 prompt against Huy's photos
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

const headers = {
  'X-Auth-Email': CF_EMAIL,
  'X-Auth-Key': CF_API_KEY,
  'Content-Type': 'application/json',
};

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

// PRODUCTION PROMPT (generalized - no specific filenames, no ethnicity-specific hints)
const PROMPT_PRODUCTION = `You are a professional photographer's assistant creating a casting dossier. Examine ALL photos carefully — the person is shown from different angles (front, 3/4, profile), multiple lighting conditions, and various expressions.

Write a complete description covering every item below. Be specific.

1. AGE (exact range)
2. GENDER
3. ETHNICITY (specific: Vietnamese, Thai, Chinese, Korean, Japanese, Filipino, Indian, Middle Eastern, European, African, Latino, mixed, etc. — do not just say "Asian" or "White")
4. SKIN TONE (warm olive, fair, light, medium, tan, deep, dark — with undertone: warm, cool, neutral)
5. FACE SHAPE (oval, round, heart, square, diamond, oblong, rectangular, or combination)
6. EYE COLOR (exact shade)
7. EYE SHAPE (almond, round, hooded, monolid, deep-set — examine the eyelid crease carefully)
8. NOSE BRIDGE HEIGHT (low, medium, high — examine the side and 3/4 profile photos. Many faces have low bridges — do not default to "medium". If the bridge appears flat or has minimal projection from the side, it is LOW.)
9. NOSE TIP (rounded, pointed, bulbous, flat)
10. LIPS (fullness: thin, medium, full; cupid's bow: defined or subtle)
11. HAIR COLOR (natural base color AND any highlights, grey, silver, dyed sections, roots)
12. HAIR TEXTURE AND STYLE (straight, wavy, curly, coarse, fine; approximate length; styling)
13. JAWLINE (defined or soft, angular or rounded)
14. FACIAL HAIR (none, stubble, beard, mustache — describe coverage and density)
15. DISTINCTIVE FEATURES (tattoos, scars, piercings, beauty marks, glasses, chains, noticeable jewelry)
16. BODY BUILD (slim, athletic, stocky, curvy, lean, muscular)

Format as one single paragraph. Use precise photographer terminology. Be honest about what you see in the photos.`;

content.push({ type: 'text', text: PROMPT_PRODUCTION });

console.log(`Sending ${allPhotos.length} photos to gemma-4...`);
const start = Date.now();
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/%40cf/google/gemma-4-26b-a4b-it`,
  {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages: [{ role: 'user', content }] }),
  }
);
const elapsed = Date.now() - start;
const data = await res.json();

if (!data.success) {
  console.error('Error:', JSON.stringify(data.errors).substring(0, 500));
  process.exit(1);
}

const description = data.result?.response || data.result?.choices?.[0]?.message?.content || '';
console.log(`\nResponse: ${elapsed}ms | ${description.length} chars\n`);

console.log('=== FULL DESCRIPTION ===');
console.log(description);
console.log('\n========================');

// Manual comparison against ground truth
console.log('\n=== Manual Review Guide ===');
console.log('1. Age        | expected: early-mid 20s');
console.log('2. Gender     | expected: male');
console.log('3. Ethnicity  | expected: Vietnamese / Southeast Asian');
console.log('4. Skin tone  | expected: warm/medium');
console.log('5. Face shape | expected: oval-rectangular');
console.log('6. Eye color  | expected: dark brown');
console.log('7. Eye shape  | expected: almond, slightly hooded');
console.log('8. Nose bridge| expected: LOW (not medium)');
console.log('9. Nose tip   | expected: rounded');
console.log('10. Lips      | expected: medium-full, cupid bow');
console.log('11. Hair color| expected: silver/pepper/grey highlights');
console.log('12. Hair tex  | expected: thick, textured');
console.log('13. Jawline   | expected: defined, angular');
console.log('14. Facial hair | expected: light stubble');
console.log('15. Distinctive| expected: neck tattoo, silver chain');
console.log('16. Body      | expected: lean/slim');
