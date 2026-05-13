/**
 * Profile routes — status polling and build trigger for async profile construction.
 */

import { Hono } from "hono";
import {
  badRequest,
  notFound,
  conflict,
  preconditionFailed,
  serviceUnavailable,
} from "../lib/diagnostics";
import { buildIdentityProfile, buildStyleProfile } from "../lib/vision";
import { requireAuth } from "../middleware/auth";

type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
};

type ProfileVariables = {
  userId: string;
};

const profileApp = new Hono<{
  Bindings: Bindings;
  Variables: ProfileVariables;
}>();

const MIN_SELFIES = 3;
const MIN_STYLE_REFERENCES = 3;

interface Session {
  token: string;
  user_id: string | null;
  status: string;
  selfie_count: number;
  moodboard_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/profile/status?sessionToken={token}
 *
 * Returns current session status and upload counts.
 * The frontend polls this while showing "Building your Profile..."
 */
profileApp.get("/status", requireAuth, async (c) => {
  const userId = c.get("userId");
  const sessionToken = c.req.query("sessionToken");
  if (!sessionToken) {
    return c.json(
      badRequest(
        "MISSING_SESSION_TOKEN",
        "Missing sessionToken query parameter",
      ),
      422,
    );
  }

  try {
    const session = await c.env.DB.prepare(
      "SELECT token, user_id, status, selfie_count, moodboard_count, created_at, updated_at FROM sessions WHERE token = ?1",
    )
      .bind(sessionToken)
      .first<Session>();

    if (!session || session.user_id !== userId) {
      return c.json(
        notFound("SESSION_NOT_FOUND", "Session not found", { sessionToken }),
        404,
      );
    }

    return c.json(
      {
        status: session.status,
        selfieCount: session.selfie_count,
        styleReferenceCount: session.moodboard_count,
        thresholds: {
          selfies: MIN_SELFIES,
          styleReferences: MIN_STYLE_REFERENCES,
        },
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json(
      serviceUnavailable(
        "STATUS_LOOKUP_FAILED",
        "Failed to retrieve session status",
        { error: message },
      ),
      503,
    );
  }
});

/**
 * POST /api/profile/build
 *
 * Triggers async profile building. Validates minimum thresholds first.
 * The actual vision model extraction is out of scope for this issue —
 * this endpoint transitions the state and returns.
 */
profileApp.post("/build", requireAuth, async (c) => {
  const userId = c.get("userId");
  let body: { sessionToken?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      badRequest("INVALID_JSON", "Request body must be valid JSON"),
      400,
    );
  }

  const sessionToken = body.sessionToken;
  if (!sessionToken) {
    return c.json(
      badRequest(
        "MISSING_SESSION_TOKEN",
        "Missing sessionToken in request body",
      ),
      422,
    );
  }

  try {
    const session = await c.env.DB.prepare(
      "SELECT token, user_id, status, selfie_count, moodboard_count FROM sessions WHERE token = ?1",
    )
      .bind(sessionToken)
      .first<Session>();

    if (!session || session.user_id !== userId) {
      return c.json(
        notFound("SESSION_NOT_FOUND", "Session not found", { sessionToken }),
        404,
      );
    }

    if (session.status !== "collecting") {
      return c.json(
        conflict(
          "SESSION_NOT_COLLECTING",
          "Profile build can only be triggered from collecting state",
          { currentStatus: session.status },
        ),
        409,
      );
    }

    // Enforce minimum thresholds with gentle nudge
    if (session.selfie_count < MIN_SELFIES) {
      return c.json(
        preconditionFailed(
          "NOT_ENOUGH_SELFIES",
          `Need at least ${MIN_SELFIES} Selfie Set photos to build profile`,
          { current: session.selfie_count, needed: MIN_SELFIES },
        ),
        422,
      );
    }
    if (session.moodboard_count < MIN_STYLE_REFERENCES) {
      return c.json(
        preconditionFailed(
          "NOT_ENOUGH_STYLE_REFERENCES",
          `Need at least ${MIN_STYLE_REFERENCES} Style References to build profile`,
          { current: session.moodboard_count, needed: MIN_STYLE_REFERENCES },
        ),
        422,
      );
    }

    // Transition state to building_profile
    await c.env.DB.prepare(
      "UPDATE sessions SET status = 'building_profile', updated_at = datetime('now') WHERE token = ?1",
    )
      .bind(sessionToken)
      .run();

    const runProfileBuild = runProfileBuildJob(c.env, sessionToken);
    try {
      if (typeof c.executionCtx?.waitUntil === "function") {
        c.executionCtx.waitUntil(runProfileBuild);
      } else {
        await runProfileBuild;
      }
    } catch {
      await runProfileBuild;
    }

    return c.json({ status: "building_profile" }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json(
      serviceUnavailable(
        "BUILD_TRIGGER_FAILED",
        "Failed to trigger profile build",
        { error: message },
      ),
      503,
    );
  }
});

async function runProfileBuildJob(env: Bindings, sessionToken: string) {
  try {
    const result = await buildIdentityProfile(
      { AI: env.AI, STORAGE: env.STORAGE, DB: env.DB },
      sessionToken,
    );
    const styleResult = await buildStyleProfile(
      { AI: env.AI, STORAGE: env.STORAGE, DB: env.DB },
      sessionToken,
    );

    if (result.success && styleResult.success) {
      await env.DB.prepare(
        "UPDATE sessions SET status = 'ready', updated_at = datetime('now') WHERE token = ?1",
      )
        .bind(sessionToken)
        .run();
    } else {
      await env.DB.prepare(
        "UPDATE sessions SET status = 'error', updated_at = datetime('now') WHERE token = ?1",
      )
        .bind(sessionToken)
        .run();
    }
  } catch {
    await env.DB.prepare(
      "UPDATE sessions SET status = 'error', updated_at = datetime('now') WHERE token = ?1",
    )
      .bind(sessionToken)
      .run();
  }
}

export default profileApp;
