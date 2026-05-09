/**
 * R2 S3-compatible client and presigned URL generation.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface StorageEnv {
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  ACCOUNT_ID: string;
}

interface UploadUrl {
  id: string;
  presignedUrl: string;
  r2Key: string;
  expiresAt: string;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const PRESIGNED_URL_EXPIRY_SECONDS = 600; // 10 minutes

let s3Client: S3Client | null = null;

function getS3Client(env: StorageEnv): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

export function buildR2Key(
  sessionToken: string,
  uploadType: 'selfie' | 'moodboard',
  filename: string,
): string {
  const ext = filename.split('.').pop() ?? 'jpg';
  const timestamp = Date.now();
  const random = crypto.randomUUID().slice(0, 6);
  return `uploads/${sessionToken}/${uploadType}/${timestamp}-${random}.${ext}`;
}

export async function generatePresignedUrls(
  env: StorageEnv,
  sessionToken: string,
  files: { uploadType: 'selfie' | 'moodboard'; filename: string; contentType: string }[],
): Promise<UploadUrl[]> {
  const client = getS3Client(env);
  // Use a per-call timestamp so all keys share the same ordering
  const timestamp = Date.now();

  const urls: UploadUrl[] = [];
  for (const file of files) {
    const r2Key = buildR2Key(sessionToken, file.uploadType, file.filename);
    const command = new PutObjectCommand({
      Bucket: 'opinionated-imagen-storage',
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
      expiresAt: new Date(Date.now() + PRESIGNED_URL_EXPIRY_SECONDS * 1000).toISOString(),
    });
  }

  return urls;
}

export function validateFileSize(sizeBytes: number): boolean {
  return sizeBytes <= MAX_FILE_SIZE_BYTES;
}

export const MAX_SIZE_BYTES = MAX_FILE_SIZE_BYTES;
export type { StorageEnv };
