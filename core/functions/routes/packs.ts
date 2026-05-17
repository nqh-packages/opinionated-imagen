import { Hono } from "hono";
import { getProductWorkspace } from "../generated/products";
import { generateId } from "../lib/id";
import {
  badRequest,
  conflict,
  notFound,
  serviceUnavailable,
} from "../lib/diagnostics";
import { generateContactSheet } from "../lib/contact-sheet";
import { requireAuth } from "../middleware/auth";
import type { ContactSheetPromptInput } from "../lib/prompts";

type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  PRODUCT_ID?: string;
  NICHE?: string;
};

type Variables = {
  userId: string;
};

interface SessionRow {
  token: string;
  user_id: string;
  status: string;
}

interface ProfileRow {
  description: string;
}

interface PackRow {
  id: string;
  user_id: string;
  session_token: string;
  preset_id: string;
  intention_json: string;
  status: string;
  provider_route: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface ContactSheetRow {
  id: string;
  pack_id: string;
  status: string;
  artifact_r2_key: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

const packsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const DEFAULT_VARIANT_MODE: ContactSheetPromptInput["variantMode"] =
  "balanced-editorial";

packsApp.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  let body: {
    sessionToken?: string;
    presetId?: string;
    prompt?: string;
    variantMode?: ContactSheetPromptInput["variantMode"];
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
  if (!body.presetId) {
    return c.json(
      badRequest("MISSING_PRESET_ID", "Request must include presetId"),
      422,
    );
  }

  try {
    const session = await c.env.DB.prepare(
      "SELECT token, user_id, status FROM sessions WHERE token = ?1",
    )
      .bind(body.sessionToken)
      .first<SessionRow>();

    if (!session || session.user_id !== userId) {
      return c.json(
        notFound("SESSION_NOT_FOUND", "Session not found", {
          sessionToken: body.sessionToken,
        }),
        404,
      );
    }
    if (session.status !== "ready") {
      return c.json(
        conflict(
          "PROFILE_NOT_READY",
          "Profile must be ready before Contact Sheet generation",
          { status: session.status },
        ),
        409,
      );
    }

    const workspace = getProductWorkspace(
      c.env.PRODUCT_ID ?? c.env.NICHE ?? "nail-content",
    );
    const preset = workspace.scenes.find((scene) => scene.id === body.presetId);
    if (!preset) {
      return c.json(
        notFound("PRESET_NOT_FOUND", "Preset not found", {
          presetId: body.presetId,
        }),
        404,
      );
    }

    const identity = await c.env.DB.prepare(
      "SELECT description FROM identity_profiles WHERE session_token = ?1",
    )
      .bind(body.sessionToken)
      .first<ProfileRow>();
    const style = await c.env.DB.prepare(
      "SELECT description FROM style_profiles WHERE session_token = ?1",
    )
      .bind(body.sessionToken)
      .first<ProfileRow>();

    if (!identity || !style) {
      return c.json(
        conflict(
          "PROFILE_ARTIFACTS_MISSING",
          "Identity Profile and Style Profile are required before generation",
        ),
        409,
      );
    }

    const packId = generateId();
    const contactSheetId = generateId();
    const intention: ContactSheetPromptInput = {
      identityDescription: identity.description,
      styleDescription: style.description,
      presetName: preset.name,
      presetDescription: preset.description,
      baseScene: preset.baseScene,
      creatorPrompt: body.prompt,
      variationCount: preset.shotCount,
      variantMode: body.variantMode ?? DEFAULT_VARIANT_MODE,
    };

    await c.env.DB.prepare(
      "INSERT INTO packs (id, user_id, session_token, preset_id, intention_json, status) VALUES (?1, ?2, ?3, ?4, ?5, 'processing')",
    )
      .bind(
        packId,
        userId,
        body.sessionToken,
        preset.id,
        JSON.stringify(intention),
      )
      .run();

    await c.env.DB.prepare(
      "INSERT INTO contact_sheets (id, pack_id, user_id, status) VALUES (?1, ?2, ?3, 'processing')",
    )
      .bind(contactSheetId, packId, userId)
      .run();

    await generateContactSheet(c.env, {
      packId,
      userId,
      sessionToken: body.sessionToken,
      intention,
    });

    return c.json(
      {
        packId,
        contactSheetId,
        status: "processing",
        intention: {
          presetId: preset.id,
          presetName: preset.name,
          variationCount: preset.shotCount,
          variantMode: intention.variantMode,
        },
      },
      202,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json(
      serviceUnavailable(
        "PACK_CREATE_FAILED",
        "Failed to create Contact Sheet Pack",
        { error: message },
      ),
      503,
    );
  }
});

packsApp.get("/:packId", requireAuth, async (c) => {
  const userId = c.get("userId");
  const packId = c.req.param("packId");

  const pack = await c.env.DB.prepare(
    "SELECT id, user_id, session_token, preset_id, intention_json, status, provider_route, error_message, created_at, updated_at FROM packs WHERE id = ?1",
  )
    .bind(packId)
    .first<PackRow>();

  if (!pack || pack.user_id !== userId) {
    return c.json(
      notFound("PACK_NOT_FOUND", "Pack not found", { packId: packId ?? "" }),
      404,
    );
  }

  const contactSheet = await c.env.DB.prepare(
    "SELECT id, pack_id, status, artifact_r2_key, metadata_json, created_at, updated_at FROM contact_sheets WHERE pack_id = ?1",
  )
    .bind(packId)
    .first<ContactSheetRow>();

  return c.json(
    {
      pack: serializePack(pack),
      contactSheet: contactSheet ? serializeContactSheet(contactSheet) : null,
    },
    200,
  );
});

packsApp.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const result = await c.env.DB.prepare(
    "SELECT id, user_id, session_token, preset_id, intention_json, status, provider_route, error_message, created_at, updated_at FROM packs WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 20",
  )
    .bind(userId)
    .all<PackRow>();

  return c.json({ packs: (result.results ?? []).map(serializePack) }, 200);
});

function serializePack(pack: PackRow) {
  return {
    id: pack.id,
    sessionToken: pack.session_token,
    presetId: pack.preset_id,
    intention: JSON.parse(pack.intention_json) as ContactSheetPromptInput,
    status: pack.status,
    providerRoute: pack.provider_route,
    errorMessage: pack.error_message,
    createdAt: pack.created_at,
    updatedAt: pack.updated_at,
  };
}

function serializeContactSheet(contactSheet: ContactSheetRow) {
  return {
    id: contactSheet.id,
    packId: contactSheet.pack_id,
    status: contactSheet.status,
    artifactR2Key: contactSheet.artifact_r2_key,
    imageUrl: contactSheet.artifact_r2_key
      ? `/api/gallery/artifact?key=${encodeURIComponent(contactSheet.artifact_r2_key)}`
      : null,
    metadata: JSON.parse(contactSheet.metadata_json || "{}") as Record<
      string,
      unknown
    >,
    createdAt: contactSheet.created_at,
    updatedAt: contactSheet.updated_at,
  };
}

export default packsApp;
