/**
 * R2 S3-compatible client and presigned URL generation.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface StorageEnv {
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_SESSION_TOKEN?: string;
  ACCOUNT_ID: string;
}

interface UploadUrl {
  id: string;
  presignedUrl: string;
  r2Key: string;
  expiresAt: string;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_MODEL_INPUT_BYTES = 5 * 1024 * 1024; // 5MB
const PRESIGNED_URL_EXPIRY_SECONDS = 600; // 10 minutes
export const SELFIE_UPLOAD_TYPE = "selfie";
export const STYLE_REFERENCE_UPLOAD_TYPE = "style-reference";
export const LEGACY_STYLE_REFERENCE_UPLOAD_TYPE = "moodboard";

export type UploadType =
  | typeof SELFIE_UPLOAD_TYPE
  | typeof STYLE_REFERENCE_UPLOAD_TYPE;
export type StoredUploadType =
  | typeof SELFIE_UPLOAD_TYPE
  | typeof LEGACY_STYLE_REFERENCE_UPLOAD_TYPE;

let s3Client: S3Client | null = null;

function getS3Client(env: StorageEnv): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        sessionToken: env.R2_SESSION_TOKEN,
      },
    });
  }
  return s3Client;
}

export function buildR2Key(
  sessionToken: string,
  uploadType: UploadType,
  filename: string,
): string {
  const ext = filename.split(".").pop() ?? "jpg";
  const timestamp = Date.now();
  const random = crypto.randomUUID().slice(0, 6);
  return `uploads/${sessionToken}/${uploadType}/${timestamp}-${random}.${ext}`;
}

export async function generatePresignedUrls(
  env: StorageEnv,
  sessionToken: string,
  files: { uploadType: UploadType; filename: string; contentType: string }[],
): Promise<UploadUrl[]> {
  const client = getS3Client(env);
  // Use a per-call timestamp so all keys share the same ordering
  const timestamp = Date.now();

  const urls: UploadUrl[] = [];
  for (const file of files) {
    const r2Key = buildR2Key(sessionToken, file.uploadType, file.filename);
    const command = new PutObjectCommand({
      Bucket: "opinionated-imagen-storage",
      Key: r2Key,
      ContentType: file.contentType,
    });

    const presignedUrl = await getSignedUrl(client, command, {
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    });

    urls.push({
      id: crypto.randomUUID(),
      presignedUrl,
      r2Key,
      expiresAt: new Date(
        Date.now() + PRESIGNED_URL_EXPIRY_SECONDS * 1000,
      ).toISOString(),
    });
  }

  return urls;
}

export function validateFileSize(sizeBytes: number): boolean {
  return sizeBytes <= MAX_FILE_SIZE_BYTES;
}

export const MAX_SIZE_BYTES = MAX_FILE_SIZE_BYTES;
export type { StorageEnv };

// ─── R2 Download Helpers (for Workers AI extraction) ───────────────
// These use the Workers R2 bucket binding (env.STORAGE), not S3 SDK.

/**
 * List all selfie objects for a session, ordered by creation time.
 */
export async function listSelfieObjects(
  sessionToken: string,
  storage: R2Bucket,
  limit = 10,
): Promise<R2Object[]> {
  const objects = await storage.list({
    prefix: `uploads/${sessionToken}/selfie/`,
    limit,
  });

  // Sort by uploaded date ascending for consistent ordering
  const sorted = [...objects.objects].sort(
    (a, b) => a.uploaded.getTime() - b.uploaded.getTime(),
  );

  return sorted.slice(0, limit);
}

export async function listStyleReferenceObjects(
  sessionToken: string,
  storage: R2Bucket,
  limit = 10,
): Promise<R2Object[]> {
  const current = await storage.list({
    prefix: `uploads/${sessionToken}/${STYLE_REFERENCE_UPLOAD_TYPE}/`,
    limit,
  });

  if (current.objects.length > 0) {
    return [...current.objects]
      .sort((a, b) => a.uploaded.getTime() - b.uploaded.getTime())
      .slice(0, limit);
  }

  const legacy = await storage.list({
    prefix: `uploads/${sessionToken}/${LEGACY_STYLE_REFERENCE_UPLOAD_TYPE}/`,
    limit,
  });

  return [...legacy.objects]
    .sort((a, b) => a.uploaded.getTime() - b.uploaded.getTime())
    .slice(0, limit);
}

/**
 * Download an R2 object and convert to base64.
 * Returns null if the object is too large for model input or cannot be read.
 */
export async function downloadAsBase64(
  r2Object: R2Object,
  storage: R2Bucket,
): Promise<{ base64: string; mediaType: string } | null> {
  // Memory safeguard: skip images too large for direct model input.
  if (r2Object.size > MAX_MODEL_INPUT_BYTES) {
    return null;
  }

  const body = await storage.get(r2Object.key);
  if (!body) {
    return null;
  }

  const arrayBuffer = await body.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Convert to base64
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // Infer media type from content type or filename
  const mediaType = r2Object.httpMetadata?.contentType ?? "image/jpeg";

  return { base64, mediaType };
}
