import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import packsRoutes from "../packs";
import {
  AUTH_COOKIE,
  createAuthSession,
} from "test-scripts/profile-test-fixtures";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const app = new Hono<{
  Bindings: { DB: D1Database; STORAGE: R2Bucket; AI: Ai; PRODUCT_ID: string };
}>();
app.route("/api/packs", packsRoutes);

describe("POST /api/packs", () => {
  it("creates a Creator-owned Contact Sheet Pack and stores the generated artifact", async () => {
    const db = createPackDb();
    const storageWrites: string[] = [];
    const env = {
      DB: db as unknown as D1Database,
      STORAGE: {
        put: async (key: string) => {
          storageWrites.push(key);
          return { key, size: 1, etag: "mock" };
        },
      } as unknown as R2Bucket,
      AI: {
        run: async () => ({ data: [{ b64_json: PNG_BASE64 }] }),
      } as unknown as Ai,
      PRODUCT_ID: "ig-content",
    };

    const res = await app.request(
      "/api/packs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: AUTH_COOKIE },
        body: JSON.stringify({
          sessionToken: "test-session-uuid",
          presetId: "cafe-aesthetic",
          prompt: "make it feel like Bangkok at night",
          variantMode: "style-forward-editorial",
        }),
      },
      env,
    );

    if (res.status !== 202) {
      throw new Error(await res.text());
    }
    const body = (await res.json()) as { packId: string };
    expect(body.packId).toBeTruthy();
    expect(storageWrites[0]).toContain(`/contact-sheet.png`);

    const statusRes = await app.request(
      `/api/packs/${body.packId}`,
      { headers: { Cookie: AUTH_COOKIE } },
      env,
    );

    expect(statusRes.status).toBe(200);
    const statusBody = (await statusRes.json()) as {
      pack: { status: string };
      contactSheet: { status: string; imageUrl: string | null };
    };
    expect(statusBody.pack.status).toBe("ready");
    expect(statusBody.contactSheet.status).toBe("ready");
    expect(statusBody.contactSheet.imageUrl).toContain(
      "/api/gallery/artifact?key=",
    );
  });

  it("rejects generation before the profile is ready", async () => {
    const env = createPackEnv({ sessionStatus: "building_profile" });

    const res = await app.request(
      "/api/packs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: AUTH_COOKIE },
        body: JSON.stringify({
          sessionToken: "test-session-uuid",
          presetId: "cafe-aesthetic",
        }),
      },
      env,
    );

    expect(res.status).toBe(409);
  });
});

function createPackEnv(options: { sessionStatus?: string } = {}) {
  return {
    DB: createPackDb(options) as unknown as D1Database,
    STORAGE: {
      put: async (key: string) => ({ key, size: 1, etag: "mock" }),
    } as unknown as R2Bucket,
    AI: {
      run: async () => ({ data: [{ b64_json: PNG_BASE64 }] }),
    } as unknown as Ai,
    PRODUCT_ID: "ig-content",
  };
}

function createPackDb(options: { sessionStatus?: string } = {}) {
  const authSession = createAuthSession();
  const session = {
    token: "test-session-uuid",
    user_id: "test-user-id",
    status: options.sessionStatus ?? "ready",
  };
  const packs: Record<string, string | null>[] = [];
  const contactSheets: Record<string, string | null>[] = [];

  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes("FROM sessions_auth")) return authSession;
          if (sql.includes("FROM sessions WHERE token")) return session;
          if (sql.includes("FROM identity_profiles")) {
            return {
              description:
                "Vietnamese man with silver hair, oval face, medium skin tone.",
            };
          }
          if (sql.includes("FROM style_profiles")) {
            return {
              description:
                "Candid editorial flash, muted colors, layered nighttime story.",
            };
          }
          if (sql.includes("FROM packs WHERE id")) {
            return packs.find((pack) => pack.id === args[0]) ?? null;
          }
          if (sql.includes("FROM contact_sheets WHERE pack_id")) {
            return (
              contactSheets.find((sheet) => sheet.pack_id === args[0]) ?? null
            );
          }
          return null;
        },
        run: async () => {
          if (sql.includes("INSERT INTO packs")) {
            packs.push({
              id: String(args[0]),
              user_id: String(args[1]),
              session_token: String(args[2]),
              preset_id: String(args[3]),
              intention_json: String(args[4]),
              status: "processing",
              provider_route: "cloudflare-ai-gateway:gpt-image-2",
              error_message: null,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            });
          }
          if (sql.includes("INSERT INTO contact_sheets")) {
            contactSheets.push({
              id: String(args[0]),
              pack_id: String(args[1]),
              user_id: String(args[2]),
              status: "processing",
              artifact_r2_key: null,
              metadata_json: "{}",
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            });
          }
          if (sql.includes("UPDATE contact_sheets SET status = 'ready'")) {
            const sheet = contactSheets.find((row) => row.pack_id === args[2]);
            if (sheet) {
              sheet.status = "ready";
              sheet.artifact_r2_key = String(args[0]);
              sheet.metadata_json = String(args[1]);
            }
          }
          if (sql.includes("UPDATE packs SET status = 'ready'")) {
            const pack = packs.find((row) => row.id === args[0]);
            if (pack) pack.status = "ready";
          }
          return { success: true };
        },
      }),
    }),
  };
}
