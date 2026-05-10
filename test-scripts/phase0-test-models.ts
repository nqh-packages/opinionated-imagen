/**
 * Phase 0: Model Proof
 * 
 * Tests gemma-4 vision with Huy's photos to prove the model
 * can produce a recognizable facial description before building infrastructure.
 * 
 * Usage: CLOUDFLARE_API_KEY=xxx node --experimental-strip-types codex-scripts/phase0-test-models.ts
 */

// We use the Cloudflare API directly via fetch
const CF_API_KEY = process.env.CF_API_KEY || process.env.CLOUDFLARE_API_KEY || '';
const CF_EMAIL = process.env.CF_EMAIL || process.env.CLOUDFLARE_EMAIL || '';
const ACCOUNT_ID = '9a46bf386fe59a2ee57558506623aaac';

if (!CF_API_KEY) {
  console.error('Error: Set CF_API_KEY or CLOUDFLARE_API_KEY env var');
  process.exit(1);
}

async function main() {
  console.log('=== Phase 0: Model Proof ===\n');

  // 1. Test gemma-4 with Huy's photos
  console.log('Testing gemma-4 vision with Huy\'s selfies...\n');

  const photoDir = process.env.HOME + '/.agents/skills/huy-face/photos';
  
  // Use diverse photos for multiple angles
  // Some models limit to 1 image per request (gemma-3), others accept more (llama-3.2-vision)
  const photos = [
    'front-squint-textured-hair.jpg',
    'three-quarter-left-silver-hair.jpg',
    'right-profile-wet-pool.jpg',
  ];

  // If model is gemma-3, only send 1 image
  const isGemma3 = MODEL.includes('gemma-3');
  const photosToSend = isGemma3 ? [photos[0]] : photos;

  // Read and base64 encode each photo
  const fs = await import('fs/promises');
  const sharp = (await import('sharp')).default;
  const contentParts: any[] = [];

  for (const photo of photos) {
    const data = await fs.readFile(`${photoDir}/${photo}`);
    // Resize to max 512px on longest edge to save context tokens
    const resized = await sharp(data)
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    const base64 = resized.toString('base64');
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${base64}`,
      },
    });
    console.log(`  Loaded: ${photo} (${(data.length / 1024).toFixed(0)}KB → ${(resized.length / 1024).toFixed(0)}KB)`);
  }

  contentParts.push({
    type: 'text',
    text: `You are a professional photographer's assistant. Examine these selfie photos of the same person carefully.

Describe the person's appearance precisely. Include:
- Apparent age range and gender presentation
- Ethnicity (be specific: East Asian, Southeast Asian, South Asian, European, Middle Eastern, African, Latino, mixed)
- Skin tone (use specific terms: fair, light, warm olive, medium, tan, deep, dark)
- Face shape (oval, round, heart, square, diamond, oblong, rectangular)
- Eye color and shape (almond, round, hooded, monolid, deep-set)
- Nose bridge height (low, medium, high) and tip shape
- Lip shape, fullness, and natural color
- Hair: color, length, texture, style
- Jawline: defined or soft, angular or rounded
- Distinctive features (tattoos, piercings, scars, beauty marks, stubble/beard, chains)

Format your response as a single natural-language paragraph. Be specific.`,
  });

  console.log('\nCalling gemma-4...\n');

  const gemmaStart = Date.now();
  const MODEL = process.argv[2] || '@cf/google/gemma-4-26b-a4b-it';

  console.log(`Model: ${MODEL}\n`);

  // Only encode @ sign, preserve slashes in the model path
  const encodedPath = MODEL.replace(/@/g, '%40');

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${encodedPath}`,
    {
      method: 'POST',
      headers: {
        'X-Auth-Email': CF_EMAIL,
        'X-Auth-Key': CF_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: contentParts }],
      }),
    },
  );

  const gemmaElapsed = Date.now() - gemmaStart;
  const result = await response.json();

  if (!result.success) {
    console.error('gemma-4 API error:', JSON.stringify(result.errors || result, null, 2));
    console.log('\nPhase 0 FAILED — gemma-4 model unavailable or error');
    process.exit(1);
  }

  const description = result.result?.response || result.result?.choices?.[0]?.message?.content || 'No description returned';
  console.log(`gemma-4 responded in ${gemmaElapsed}ms\n`);
  console.log('=== gemma-4 Description ===');
  console.log(description);
  console.log('===========================\n');

  // 2. Test gpt-image-2 with the gemma-4 description (prove reference sheet generation works)
  console.log('Testing gpt-image-2 with the description...\n');

  const refPrompt = `Generate a professional multi-angle portrait reference sheet of the exact same person described below. The image must show THREE views of the SAME person: front-facing portrait (center), 3/4 angle (left), side profile (right) — all on a clean white or light gray background.

Person description: ${description}

Style requirements:
- Photorealistic photography, not illustration
- Clean studio lighting, soft and even
- Neutral expression, direct gaze (front view)
- Same clothing, same lighting across all three angles
- Sharp focus, visible skin texture, pores, flyaways
- No text overlays, no watermarks, no logo
- Each angle should clearly show the same person — bone structure, hair, skin must be identical
- Frame width: all three views fit side by side in a landscape composition`;

  const gptStart = Date.now();
  const gptResponse = await fetch(
    `https://gateway.ai.cloudflare.com/v1/${ACCOUNT_ID}/opinionated-imagen-ig/openai/gpt-image-2`,
    {
      method: 'POST',
      headers: {
        'X-Auth-Email': CF_EMAIL,
        'X-Auth-Key': CF_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: refPrompt,
        quality: 'medium',
        size: '1536x1024',
        output_format: 'png',
      }),
    },
  );

  const gptElapsed = Date.now() - gptStart;
  const gptResult = await gptResponse.json();
  const gptDesc = JSON.stringify(gptResult).substring(0, 500);

  console.log(`gpt-image-2 responded in ${gptElapsed}ms`);
  console.log(`Response preview: ${gptDesc}...\n`);

  // Save the reference image if available
  const imageData = gptResult?.result?.image?.base64 || gptResult?.result?.data?.[0]?.base64;
  if (imageData) {
    const imagePath = '/tmp/huy-reference-sheet.png';
    const buffer = Buffer.from(imageData, 'base64');
    await fs.writeFile(imagePath, buffer);
    console.log(`Reference sheet saved to: ${imagePath}`);
    console.log(`Size: ${(buffer.length / 1024).toFixed(0)}KB`);
  } else {
    console.log('No image data in response. Reference sheet generation may not be supported via gateway.');
    console.log('Full response keys:', Object.keys(gptResult.result || gptResult));
  }

  console.log('\n=== Results ===');
  console.log(`gemma-4: ${gemmaElapsed}ms — ${description.length} chars`);
  console.log(`gpt-image-2: ${gptElapsed}ms — ${imageData ? 'Image returned' : 'No image'}`);
  
  if (description.length > 50) {
    console.log('\nPhase 0 PASSED (gemma-4) — description looks valid');
  } else {
    console.log('\nPhase 0 FAILED — description too short');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
