import { Hono } from "hono";
import { notFound, serviceUnavailable } from "../lib/diagnostics";
import { requireAuth } from "../middleware/auth";

type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
};

type Variables = {
  userId: string;
};

interface GalleryRow {
  contact_sheet_id: string;
  pack_id: string;
  preset_id: string;
  status: string;
  artifact_r2_key: string | null;
  metadata_json: string;
  created_at: string;
}

const galleryApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

galleryApp.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  try {
    const result = await c.env.DB.prepare(
      "SELECT contact_sheets.id AS contact_sheet_id, contact_sheets.pack_id AS pack_id, packs.preset_id AS preset_id, contact_sheets.status AS status, contact_sheets.artifact_r2_key AS artifact_r2_key, contact_sheets.metadata_json AS metadata_json, contact_sheets.created_at AS created_at FROM contact_sheets INNER JOIN packs ON packs.id = contact_sheets.pack_id WHERE contact_sheets.user_id = ?1 ORDER BY contact_sheets.created_at DESC LIMIT 40",
    )
      .bind(userId)
      .all<GalleryRow>();

    return c.json(
      {
        contactSheets: (result.results ?? []).map((row) => ({
          id: row.contact_sheet_id,
          packId: row.pack_id,
          presetId: row.preset_id,
          status: row.status,
          artifactR2Key: row.artifact_r2_key,
          imageUrl: row.artifact_r2_key
            ? `/api/gallery/artifact?key=${encodeURIComponent(row.artifact_r2_key)}`
            : null,
          metadata: JSON.parse(row.metadata_json || "{}") as Record<
            string,
            unknown
          >,
          createdAt: row.created_at,
        })),
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json(
      serviceUnavailable(
        "GALLERY_LOOKUP_FAILED",
        "Could not load Contact Sheets",
        { error: message },
      ),
      503,
    );
  }
});

galleryApp.get("/artifact", requireAuth, async (c) => {
  const userId = c.get("userId");
  const r2Key = c.req.query("key");
  if (!r2Key) {
    return c.json(notFound("ARTIFACT_NOT_FOUND", "Artifact not found"), 404);
  }

  const row = await c.env.DB.prepare(
    "SELECT user_id FROM contact_sheets WHERE artifact_r2_key = ?1",
  )
    .bind(r2Key)
    .first<{ user_id: string }>();

  if (!row || row.user_id !== userId) {
    return c.json(notFound("ARTIFACT_NOT_FOUND", "Artifact not found"), 404);
  }

  const object = await c.env.STORAGE.get(r2Key);
  if (!object) {
    return c.json(notFound("ARTIFACT_NOT_FOUND", "Artifact not found"), 404);
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/png",
      "Cache-Control": "private, max-age=300",
    },
  });
});

export default galleryApp;
