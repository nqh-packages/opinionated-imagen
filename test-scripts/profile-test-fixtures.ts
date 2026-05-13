/**
 * Shared test fixtures for profile identity extraction tests.
 * Reusable across build, status, extraction, and prompt anatomy tests.
 */

import type { Ai } from "@cloudflare/workers-types";

// ─── Mock Factories ────────────────────────────────────────────────

export function mockD1(rows: Record<string, any>[] = []): D1Database {
  let currentRows = [...rows];

  return {
    prepare: (sql: string) => ({
      bind: (..._args: any[]) => ({
        first: async <T = any>(): Promise<T | null> => {
          if (sql.includes("FROM sessions_auth")) {
            const row = currentRows.find((r) => r.id === _args[0]);
            return (row as T) ?? null;
          }
          // Simulate SELECT ... WHERE token = ?
          if (sql.includes("SELECT") && _args[0]) {
            const row = currentRows.find((r) => r.token === _args[0]);
            return (row as T) ?? null;
          }
          return null;
        },
        run: async () => {
          // Simulate INSERT/UPDATE
          if (sql.includes("UPDATE sessions SET status")) {
            const token = _args[0];
            const row = currentRows.find((r) => r.token === token);
            if (row) {
              row.status =
                _args[0] === token
                  ? _args[0] === "error"
                    ? "error"
                    : "ready"
                  : row.status;
              row.updated_at = new Date().toISOString();
            }
            return { success: true };
          }
          if (sql.includes("INSERT INTO identity_profiles")) {
            currentRows.push({
              session_token: _args[0],
              description: _args[1],
              model_used: _args[2],
              extraction_ms: _args[3],
              created_at: new Date().toISOString(),
            });
            return { success: true };
          }
          if (sql.includes("UPDATE identity_profiles")) {
            const r2Key = _args[0];
            const sessionToken = _args[1];
            const row = currentRows.find(
              (r) => r.session_token === sessionToken,
            );
            if (row) row.reference_r2_key = r2Key;
            return { success: true };
          }
          return { success: true };
        },
      }),
    }),
  } as unknown as D1Database;
}

export function mockR2(
  objects: { key: string; size: number; body?: ArrayBuffer }[] = [],
): R2Bucket {
  return {
    list: async (opts?: { prefix?: string; limit?: number }) => {
      const filtered = objects
        .filter((o) => !opts?.prefix || o.key.startsWith(opts.prefix))
        .slice(0, opts?.limit ?? 10);
      return {
        objects: filtered.map((o) => ({
          key: o.key,
          size: o.size,
          uploaded: new Date(),
          httpMetadata: { contentType: "image/jpeg" },
        })),
        truncated: false,
      };
    },
    get: async (key: string) => {
      const obj = objects.find((o) => o.key === key);
      if (!obj) return null;
      return {
        key: obj.key,
        size: obj.size,
        body: obj.body ?? new ArrayBuffer(0),
        arrayBuffer: async () => obj.body ?? new ArrayBuffer(0),
        httpMetadata: { contentType: "image/jpeg" },
        uploaded: new Date(),
      };
    },
    put: async (key: string, _data: any) => {
      return { key, size: 0, etag: "mock" };
    },
  } as unknown as R2Bucket;
}

export function mockAi(
  responses: Record<string, any>,
  errors?: Record<string, string>,
): Ai {
  return {
    run: async (model: string, _options?: any, _gateway?: any) => {
      if (errors?.[model]) throw new Error(errors[model]);
      return responses[model] ?? { response: "Mock AI response" };
    },
  } as unknown as Ai;
}

// ─── Test Data Builders ────────────────────────────────────────────

export function createSession(
  overrides: Partial<{
    token: string;
    user_id: string;
    status: string;
    selfie_count: number;
    moodboard_count: number;
  }> = {},
) {
  return {
    token: "test-session-uuid",
    user_id: "test-user-id",
    status: "collecting",
    selfie_count: 10,
    moodboard_count: 5,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function createAuthSession() {
  return {
    id: "test-auth-session",
    user_id: "test-user-id",
    expires_at: "2099-01-01T00:00:00.000Z",
  };
}

export const AUTH_COOKIE = "session=test-auth-session";

export function createSelfieObjects(count: number, prefix = "test-session") {
  return Array.from({ length: count }, (_, i) => ({
    key: `uploads/${prefix}/selfie/${i}.jpg`,
    size: 50000 + i * 1000,
    body: new ArrayBuffer(50000),
    uploaded: new Date(Date.now() + i * 1000),
  }));
}

export function createStyleReferenceObjects(
  count: number,
  prefix = "test-session",
) {
  return Array.from({ length: count }, (_, i) => ({
    key: `uploads/${prefix}/style-reference/${i}.jpg`,
    size: 50000 + i * 1000,
    body: new ArrayBuffer(50000),
    uploaded: new Date(Date.now() + i * 1000),
  }));
}

export function createGemmaResponse(description?: string) {
  return {
    response:
      description ??
      "Mock gemma-4 description: male in early 20s, oval face, dark brown almond eyes, low nose bridge, defined jawline, medium skin tone, short silver-grey hair.",
  };
}

export function createGptImageResponse() {
  // Returns a 1x1 pixel PNG as base64
  return {
    data: [
      {
        base64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      },
    ],
  };
}

// ─── App Builder for Integration Tests ─────────────────────────────

import { Hono } from "hono";

export function createTestApp(db: D1Database, storage: R2Bucket, ai: Ai) {
  const app = new Hono<{
    Bindings: { DB: D1Database; STORAGE: R2Bucket; AI: Ai };
  }>();

  // Register route handlers directly with mock env
  app.use("*", async (c, next) => {
    c.env.DB = db;
    c.env.STORAGE = storage;
    c.env.AI = ai;
    await next();
  });

  // Mount profile routes
  const profileRoutes = async () => {
    const mod = await import("../core/functions/routes/profile");
    return mod.default;
  };

  return app;
}

// ─── Prompt Anatomy Fixtures ──────────────────────────────────────

export const PROMPT_FEATURES = [
  "AGE",
  "GENDER",
  "ETHNICITY",
  "SKIN TONE",
  "FACE SHAPE",
  "EYE COLOR",
  "EYE SHAPE",
  "NOSE BRIDGE",
  "NOSE TIP",
  "LIPS",
  "HAIR COLOR",
  "HAIR TEXTURE",
  "JAWLINE",
  "FACIAL HAIR",
  "DISTINCTIVE FEATURES",
  "BODY TYPE",
  "CONSISTENCY NOTES",
];

export function validDescription(): string {
  return "Male subject, aged early 20s, of Southeast Asian (Vietnamese) ethnicity with medium skin tone and warm olive undertones. Oval face shape with a defined angular jawline. Dark brown almond-shaped eyes with a subtle eyelid crease. Low nose bridge with a rounded tip. Lips are medium-full with a defined cupid's bow. Hair is thick with a natural dark base and prominent silver-grey salt-and-pepper highlights, styled in a textured upward-swept manner. Light stubble on chin and upper lip. Distinctive features include a small star-shaped tattoo on the left side of the neck and a thin silver chain necklace. Lean athletic build. Hair color is a notable inconsistency — one photo shows mostly dark hair while others show significant silver-grey tones.";
}

export function invalidDescription(): string {
  return "A person";
}
