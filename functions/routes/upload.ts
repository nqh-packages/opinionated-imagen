/**
 * Upload routes — presigned URL generation for direct-to-R2 uploads.
 */

import { Hono } from 'hono';
import { generateId } from '../lib/id';
import { generatePresignedUrls } from '../lib/storage';
import { badRequest, conflict, notFound, serviceUnavailable } from '../lib/diagnostics';
import type { StorageEnv } from '../lib/storage';

type Bindings = StorageEnv & {
  DB: D1Database;
};

const uploadApp = new Hono<{ Bindings: Bindings }>();

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
];

function isValidContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.includes(contentType.toLowerCase());
}

/**
 * POST /api/upload/presigned
 *
 * Generates presigned PUT URLs for direct browser-to-R2 uploads.
 * Creates a new session if no sessionToken is provided (lazy creation).
 * Increments counts optimistically — the frontend must regenerate URLs
 * for any files that don't actually upload.
 */
uploadApp.post('/presigned', async (c) => {
  const db = c.env.DB;

  let body: { sessionToken?: string; files?: { uploadType: string; filename: string; contentType: string }[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json(badRequest('INVALID_JSON', 'Request body must be valid JSON'), 400);
  }

  const files = body.files;
  if (!Array.isArray(files)) {
    return c.json(badRequest('MISSING_FILES', 'Request must include a "files" array'), 422);
  }

  if (files.length === 0) {
    return c.json({ sessionToken: body.sessionToken ?? null, uploads: [] }, 200);
  }

  // Validate every file entry before mutating state
  for (const file of files) {
    if (!file.uploadType || !['selfie', 'moodboard'].includes(file.uploadType)) {
      return c.json(badRequest('INVALID_UPLOAD_TYPE', 'Each file must have uploadType: "selfie" or "moodboard"', { uploadType: file.uploadType }), 422);
    }
    if (!file.filename || typeof file.filename !== 'string') {
      return c.json(badRequest('MISSING_FILENAME', 'Each file must have a filename'), 422);
    }
    if (!file.contentType || !isValidContentType(file.contentType)) {
      return c.json(badRequest('UNSUPPORTED_CONTENT_TYPE', `Unsupported content type. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`, { contentType: file.contentType }), 422);
    }
  }

  let sessionToken = body.sessionToken;

  try {
    if (!sessionToken) {
      // Lazy session creation
      sessionToken = generateId();
      await db.prepare(
        'INSERT INTO sessions (token, status) VALUES (?1, ?2)',
      ).bind(sessionToken, 'collecting').run();
    } else {
      // Validate existing session
      const session = await db.prepare(
        'SELECT status FROM sessions WHERE token = ?1',
      ).bind(sessionToken).first<{ status: string }>();

      if (!session) {
        return c.json(notFound('SESSION_NOT_FOUND', 'Session not found', { sessionToken }), 404);
      }
      if (session.status !== 'collecting') {
        return c.json(conflict('SESSION_NOT_COLLECTING', 'Session is not in collecting state', { status: session.status }), 409);
      }
    }

    // Generate presigned URLs
    const typedFiles = files as { uploadType: 'selfie' | 'moodboard'; filename: string; contentType: string }[];
    const uploads = await generatePresignedUrls(
      {
        R2_ACCESS_KEY_ID: c.env.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: c.env.R2_SECRET_ACCESS_KEY,
        ACCOUNT_ID: c.env.ACCOUNT_ID,
      },
      sessionToken,
      typedFiles,
    );

    // Optimistic count increment
    const selfieCount = files.filter(f => f.uploadType === 'selfie').length;
    const moodboardCount = files.filter(f => f.uploadType === 'moodboard').length;

    if (selfieCount > 0) {
      await db.prepare(
        'UPDATE sessions SET selfie_count = selfie_count + ?1, updated_at = datetime(\'now\') WHERE token = ?2',
      ).bind(selfieCount, sessionToken).run();
    }
    if (moodboardCount > 0) {
      await db.prepare(
        'UPDATE sessions SET moodboard_count = moodboard_count + ?1, updated_at = datetime(\'now\') WHERE token = ?2',
      ).bind(moodboardCount, sessionToken).run();
    }

    return c.json({
      sessionToken,
      uploads: uploads.map(u => ({
        id: u.id,
        presignedUrl: u.presignedUrl,
        r2Key: u.r2Key,
        expiresAt: u.expiresAt,
      })),
    }, 200);

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(serviceUnavailable('PRESIGNED_GENERATION_FAILED', 'Failed to generate upload URLs', { error: message }), 503);
  }
});

export default uploadApp;
