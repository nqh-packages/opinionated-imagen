import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import authRoutes from "../auth";

const app = new Hono<{
  Bindings: { DB: D1Database; EMAIL: SendEmail; MAIL_FROM?: string };
}>();
app.route("/api/auth", authRoutes);

describe("magic-link auth", () => {
  it("verifies a magic link and identifies the Creator through /me", async () => {
    const db = createAuthDb();
    const sentEmails: unknown[] = [];
    const env = {
      DB: db as unknown as D1Database,
      EMAIL: {
        send: async (message: unknown) => {
          sentEmails.push(message);
        },
      } as unknown as SendEmail,
      MAIL_FROM: "auth@example.com",
    };

    const magicLinkRes = await app.request(
      "/api/auth/magic-link",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://opinionated-imagen.nqh.workers.dev",
        },
        body: JSON.stringify({ email: "Creator@Example.com " }),
      },
      env,
    );

    expect(magicLinkRes.status).toBe(200);
    expect(sentEmails).toHaveLength(1);
    expect(db.magicLinks[0]?.email).toBe("creator@example.com");

    const verifyRes = await app.request(
      `/api/auth/verify?token=${db.magicLinks[0]?.token}`,
      {},
      env,
    );

    expect(verifyRes.status).toBe(200);
    expect(await verifyRes.json()).toMatchObject({
      ok: true,
      redirectTo: "/create",
    });
    const cookie = verifyRes.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");

    const sessionCookie = cookie.split(";")[0] ?? "";
    const meRes = await app.request(
      "/api/auth/me",
      { headers: { Cookie: sessionCookie } },
      env,
    );

    expect(meRes.status).toBe(200);
    expect(await meRes.json()).toMatchObject({
      authenticated: true,
      email: "creator@example.com",
      userId: db.users[0]?.id,
    });
  });
});

function createAuthDb() {
  const state = {
    attempts: [] as { email: string }[],
    magicLinks: [] as { token: string; email: string; used: number }[],
    users: [] as {
      id: string;
      email: string;
      created_at: string;
      last_seen: string;
    }[],
    sessions: [] as { id: string; user_id: string; expires_at: string }[],
  };

  return {
    ...state,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes("COUNT(*) as count FROM magic_link_attempts")) {
            return {
              count: state.attempts.filter((row) => row.email === args[0])
                .length,
            };
          }
          if (sql.includes("FROM magic_links WHERE token")) {
            return (
              state.magicLinks.find(
                (row) => row.token === args[0] && row.used === 0,
              ) ?? null
            );
          }
          if (sql.includes("SELECT id FROM users WHERE email")) {
            return state.users.find((row) => row.email === args[0]) ?? null;
          }
          if (sql.includes("FROM sessions_auth")) {
            return state.sessions.find((row) => row.id === args[0]) ?? null;
          }
          if (sql.includes("FROM users WHERE id")) {
            return state.users.find((row) => row.id === args[0]) ?? null;
          }
          return null;
        },
        run: async () => {
          if (sql.includes("INSERT INTO magic_link_attempts")) {
            state.attempts.push({ email: String(args[0]) });
          }
          if (sql.includes("INSERT INTO magic_links")) {
            state.magicLinks.push({
              token: String(args[0]),
              email: String(args[1]),
              used: 0,
            });
          }
          if (sql.includes("UPDATE magic_links SET used")) {
            const link = state.magicLinks.find((row) => row.token === args[0]);
            if (link) link.used = 1;
          }
          if (sql.includes("INSERT OR IGNORE INTO users")) {
            const email = String(args[1]);
            if (!state.users.some((row) => row.email === email)) {
              state.users.push({
                id: String(args[0]),
                email,
                created_at: "2026-05-13T00:00:00.000Z",
                last_seen: "2026-05-13T00:00:00.000Z",
              });
            }
          }
          if (sql.includes("UPDATE users SET last_seen")) {
            const user = state.users.find((row) => row.id === args[0]);
            if (user) user.last_seen = "2026-05-13T00:01:00.000Z";
          }
          if (sql.includes("INSERT INTO sessions_auth")) {
            state.sessions.push({
              id: String(args[0]),
              user_id: String(args[1]),
              expires_at: "2099-01-01T00:00:00.000Z",
            });
          }
          if (sql.includes("DELETE FROM magic_links")) {
            const index = state.magicLinks.findIndex(
              (row) => row.token === args[0],
            );
            if (index >= 0) state.magicLinks.splice(index, 1);
          }
          return { success: true };
        },
      }),
    }),
  };
}
