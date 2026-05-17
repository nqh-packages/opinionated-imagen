/**
 * Upload routes — presigned URL generation for direct-to-R2 uploads.
 */

import { Hono } from "hono";
import { generateId } from "../lib/id";
import {
  generatePresignedUrls,
  LEGACY_STYLE_REFERENCE_UPLOAD_TYPE,
  SELFIE_UPLOAD_TYPE,
  STYLE_REFERENCE_UPLOAD_TYPE,
  type StoredUploadType,
  type UploadType,
} from "../lib/storage";
import {
  badRequest,
  conflict,
  notFound,
  serviceUnavailable,
} from "../lib/diagnostics";
import type { StorageEnv } from "../lib/storage";
import { requireAuth } from "../middleware/auth";

type Bindings = StorageEnv & {
  DB: D1Database;
} & { R2_SESSION_TOKEN?: string };

type Variables = {
  userId: string;
};

const uploadApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
];

function isValidContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.includes(contentType.toLowerCase());
}

function normalizeUploadType(uploadType: string): UploadType | null {
  if (uploadType === SELFIE_UPLOAD_TYPE) return SELFIE_UPLOAD_TYPE;
  if (
    uploadType === STYLE_REFERENCE_UPLOAD_TYPE ||
    uploadType === LEGACY_STYLE_REFERENCE_UPLOAD_TYPE
  ) {
    return STYLE_REFERENCE_UPLOAD_TYPE;
  }
  return null;
}

function storedUploadType(uploadType: UploadType): StoredUploadType {
  return uploadType === STYLE_REFERENCE_UPLOAD_TYPE
    ? LEGACY_STYLE_REFERENCE_UPLOAD_TYPE
    : SELFIE_UPLOAD_TYPE;
}

/**
 * POST /api/upload/presigned
 *
 * Generates presigned PUT URLs for direct browser-to-R2 uploads.
 * Creates a new session if no sessionToken is provided (lazy creation).
 * Increments counts optimistically — the frontend must regenerate URLs
 * for any files that don't actually upload.
 */
uploadApp.post("/presigned", requireAuth, async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");

  let body: {
    sessionToken?: string;
    files?: { uploadType: string; filename: string; contentType: string }[];
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      badRequest("INVALID_JSON", "Request body must be valid JSON"),
      400,
    );
  }

  const files = body.files;
  if (!Array.isArray(files)) {
    return c.json(
      badRequest("MISSING_FILES", 'Request must include a "files" array'),
      422,
    );
  }

  if (files.length === 0) {
    return c.json(
      { sessionToken: body.sessionToken ?? null, uploads: [] },
      200,
    );
  }

  const typedFiles: {
    uploadType: UploadType;
    filename: string;
    contentType: string;
  }[] = [];

  for (const file of files) {
    const uploadType = normalizeUploadType(file.uploadType);
    if (!uploadType) {
      return c.json(
        badRequest(
          "INVALID_UPLOAD_TYPE",
          'Each file must have uploadType: "selfie" or "style-reference"',
          { uploadType: file.uploadType },
        ),
        422,
      );
    }
    if (!file.filename || typeof file.filename !== "string") {
      return c.json(
        badRequest("MISSING_FILENAME", "Each file must have a filename"),
        422,
      );
    }
    if (!file.contentType || !isValidContentType(file.contentType)) {
      return c.json(
        badRequest(
          "UNSUPPORTED_CONTENT_TYPE",
          `Unsupported content type. Allowed: ${ALLOWED_CONTENT_TYPES.join(", ")}`,
          { contentType: file.contentType },
        ),
        422,
      );
    }
    typedFiles.push({
      uploadType,
      filename: file.filename,
      contentType: file.contentType,
    });
  }

  let sessionToken = body.sessionToken;

  try {
    if (!sessionToken) {
      // Lazy session creation
      sessionToken = generateId();
      await db
        .prepare(
          "INSERT INTO sessions (token, status, user_id) VALUES (?1, ?2, ?3)",
        )
        .bind(sessionToken, "collecting", userId)
        .run();
    } else {
      // Validate existing session
      const session = await db
        .prepare("SELECT status, user_id FROM sessions WHERE token = ?1")
        .bind(sessionToken)
        .first<{ status: string; user_id: string | null }>();

      if (!session) {
        return c.json(
          notFound("SESSION_NOT_FOUND", "Session not found", { sessionToken }),
          404,
        );
      }
      if (session.user_id && session.user_id !== userId) {
        return c.json(
          notFound("SESSION_NOT_FOUND", "Session not found", { sessionToken }),
          404,
        );
      }
      if (session.status !== "collecting") {
        return c.json(
          conflict(
            "SESSION_NOT_COLLECTING",
            "Session is not in collecting state",
            { status: session.status },
          ),
          409,
        );
      }
      if (!session.user_id) {
        await db
          .prepare(
            "UPDATE sessions SET user_id = ?1, updated_at = datetime('now') WHERE token = ?2",
          )
          .bind(userId, sessionToken)
          .run();
      }
    }

    // Generate presigned URLs
    const uploads = await generatePresignedUrls(
      {
        R2_ACCESS_KEY_ID: c.env.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: c.env.R2_SECRET_ACCESS_KEY,
        R2_SESSION_TOKEN: c.env.R2_SESSION_TOKEN,
        ACCOUNT_ID: c.env.ACCOUNT_ID,
      },
      sessionToken,
      typedFiles,
    );

    return c.json(
      {
        sessionToken,
        uploads: uploads.map((u, index) => ({
          id: u.id,
          uploadType: typedFiles[index]?.uploadType,
          presignedUrl: u.presignedUrl,
          r2Key: u.r2Key,
          expiresAt: u.expiresAt,
        })),
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json(
      serviceUnavailable(
        "PRESIGNED_GENERATION_FAILED",
        "Failed to generate upload URLs",
        { error: message },
      ),
      503,
    );
  }
});

uploadApp.post("/complete", requireAuth, async (c) => {
  const userId = c.get("userId");

  let body: {
    sessionToken?: string;
    uploads?: {
      uploadType: string;
      r2Key: string;
      filename?: string;
      contentType?: string;
      sizeBytes?: number;
    }[];
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      badRequest("INVALID_JSON", "Request body must be valid JSON"),
      400,
    );
  }

  if (!body.sessionToken) {
    return c.json(
      badRequest("MISSING_SESSION_TOKEN", "Request must include sessionToken"),
      422,
    );
  }
  if (!Array.isArray(body.uploads) || body.uploads.length === 0) {
    return c.json(
      badRequest("MISSING_UPLOADS", "Request must include uploaded files"),
      422,
    );
  }

  const session = await c.env.DB.prepare(
    "SELECT token, user_id, status FROM sessions WHERE token = ?1",
  )
    .bind(body.sessionToken)
    .first<{ token: string; user_id: string | null; status: string }>();

  if (!session || session.user_id !== userId) {
    return c.json(
      notFound("SESSION_NOT_FOUND", "Session not found", {
        sessionToken: body.sessionToken,
      }),
      404,
    );
  }
  if (session.status !== "collecting") {
    return c.json(
      conflict("SESSION_NOT_COLLECTING", "Session is not in collecting state", {
        status: session.status,
      }),
      409,
    );
  }

  let selfieCount = 0;
  let styleReferenceCount = 0;

  for (const upload of body.uploads) {
    const uploadType = normalizeUploadType(upload.uploadType);
    if (!uploadType) {
      return c.json(
        badRequest(
          "INVALID_UPLOAD_TYPE",
          'Each upload must have uploadType: "selfie" or "style-reference"',
          { uploadType: upload.uploadType },
        ),
        422,
      );
    }
    if (!upload.r2Key.startsWith(`uploads/${body.sessionToken}/`)) {
      return c.json(
        badRequest(
          "INVALID_R2_KEY",
          "Upload key does not belong to this session",
        ),
        422,
      );
    }

    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO uploads (id, session_token, user_id, upload_type, r2_key, original_filename, content_type, size_bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
      .bind(
        generateId(),
        body.sessionToken,
        userId,
        storedUploadType(uploadType),
        upload.r2Key,
        upload.filename ?? null,
        upload.contentType ?? null,
        upload.sizeBytes ?? null,
      )
      .run();

    if (uploadType === SELFIE_UPLOAD_TYPE) selfieCount += 1;
    if (uploadType === STYLE_REFERENCE_UPLOAD_TYPE) styleReferenceCount += 1;
  }

  if (selfieCount > 0 || styleReferenceCount > 0) {
    await c.env.DB.prepare(
      "UPDATE sessions SET selfie_count = selfie_count + ?1, moodboard_count = moodboard_count + ?2, updated_at = datetime('now') WHERE token = ?3",
    )
      .bind(selfieCount, styleReferenceCount, body.sessionToken)
      .run();
  }

  return c.json(
    {
      sessionToken: body.sessionToken,
      selfieCount,
      styleReferenceCount,
    },
    200,
  );
});

export default uploadApp;
