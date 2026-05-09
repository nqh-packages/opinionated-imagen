/**
 * @rust-exception rationale: This script uses @aws-sdk/client-s3 for Cloudflare R2's
 * S3-compatible lifecycle API. No equivalent Rust SDK is available for Worker-runtime
 * S3 management — the aws-sdk-rust crate is not compatible with workerd, and writing
 * raw HTTP signing for S3 lifecycle commands would be strictly worse.
 *
 * R2 Lifecycle Rule Setup
 *
 * Configures a 7-day TTL on the uploads/ prefix so orphaned uploads
 * (from sessions that never completed onboarding) are automatically cleaned up.
 *
 * Usage:
 *   npx wrangler dev functions/scripts/setup-lifecycle.ts --remote
 *
 * Alternative (preferred): Configure via Cloudflare dashboard:
 *   1. Go to Dashboard → R2 → opinionated-imagen-storage
 *   2. Settings → Lifecycle Rules → Add Rule
 *   3. Prefix: uploads/
 *   4. Expiration: Delete objects after 7 days
 *   5. Save
 *
 * Prerequisites:
 *   - R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY set in environment or .dev.vars
 *   - ACCOUNT_ID set in environment or .dev.vars
 */

import { S3Client, PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';

interface Env {
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  ACCOUNT_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Send a POST request to apply lifecycle rules', { status: 405 });
    }

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    try {
      await s3.send(new PutBucketLifecycleConfigurationCommand({
        Bucket: 'opinionated-imagen-storage',
        LifecycleConfiguration: {
          Rules: [
            {
              ID: 'expire-orphan-uploads',
              Status: 'Enabled',
              Prefix: 'uploads/',
              Expiration: { Days: 7 },
            },
          ],
        },
      }));

      return new Response(JSON.stringify({
        ok: true,
        message: 'Lifecycle rule applied: uploads/ prefix expires after 7 days',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  },
};
