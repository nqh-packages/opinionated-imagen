/**
 * Tests: POST /api/profile/build
 *
 * Integration tests covering state transitions, threshold enforcement,
 * duplicate prevention, and error handling.
 *
 * Layer: Integration (Hono route handlers with mocked bindings)
 * Risk: Critical (core profile building flow)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import profileRoutes from "../profile";
import {
  mockD1,
  mockR2,
  mockAi,
  createSession,
  createGemmaResponse,
  createGptImageResponse,
  createAuthSession,
  createSelfieObjects,
  createStyleReferenceObjects,
  AUTH_COOKIE,
} from "test-scripts/profile-test-fixtures";

const app = new Hono<{
  Bindings: { DB: D1Database; STORAGE: R2Bucket; AI: Ai };
}>();
app.route("/api/profile", profileRoutes);

describe("POST /api/profile/build", () => {
  let env: { DB: D1Database; STORAGE: R2Bucket; AI: Ai };

  beforeEach(() => {
    env = {
      DB: mockD1(),
      STORAGE: mockR2(),
      AI: mockAi({
        "@cf/meta/llama-3.2-11b-vision-instruct": createGemmaResponse(),
        "openai/gpt-image-2": createGptImageResponse(),
      }),
    };
  });

  // 1. Happy path (acceptance)
  it("builds profile and transitions to building_profile", async () => {
    const session = createSession();
    env.DB = mockD1([session, createAuthSession()]);
    env.STORAGE = mockR2([
      ...createSelfieObjects(5),
      ...createStyleReferenceObjects(4),
    ]);

    const res = await app.request(
      "/api/profile/build",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: AUTH_COOKIE },
        body: JSON.stringify({ sessionToken: session.token }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("building_profile");
  });

  // 2. Prevention: not enough selfies
  it("rejects build when fewer than 3 Selfie Set photos uploaded", async () => {
    const session = createSession({ selfie_count: 2 });
    env.DB = mockD1([session, createAuthSession()]);

    const res = await app.request(
      "/api/profile/build",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: AUTH_COOKIE },
        body: JSON.stringify({ sessionToken: session.token }),
      },
      env,
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error_code).toBe("NOT_ENOUGH_SELFIES");
    expect(body.context?.current).toBe(2);
    expect(body.context?.needed).toBe(3);
  });

  // 3. Prevention: not enough Style References
  it("rejects build when fewer than 3 Style References uploaded", async () => {
    const session = createSession({ moodboard_count: 2 });
    env.DB = mockD1([session, createAuthSession()]);

    const res = await app.request(
      "/api/profile/build",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: AUTH_COOKIE },
        body: JSON.stringify({ sessionToken: session.token }),
      },
      env,
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error_code).toBe("NOT_ENOUGH_STYLE_REFERENCES");
  });

  // 4. Prevention: already building
  it("rejects duplicate build trigger with 409", async () => {
    const session = createSession({ status: "building_profile" });
    env.DB = mockD1([session, createAuthSession()]);

    const res = await app.request(
      "/api/profile/build",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: AUTH_COOKIE },
        body: JSON.stringify({ sessionToken: session.token }),
      },
      env,
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error_code).toBe("SESSION_NOT_COLLECTING");
  });

  // 5. Prevention: session already ready
  it("rejects build when session is already ready", async () => {
    const session = createSession({ status: "ready" });
    env.DB = mockD1([session, createAuthSession()]);

    const res = await app.request(
      "/api/profile/build",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: AUTH_COOKIE },
        body: JSON.stringify({ sessionToken: session.token }),
      },
      env,
    );

    expect(res.status).toBe(409);
  });

  // 6. Prevention: session in error state
  it("rejects build when session is in error state", async () => {
    const session = createSession({ status: "error" });
    env.DB = mockD1([session, createAuthSession()]);

    const res = await app.request(
      "/api/profile/build",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: AUTH_COOKIE },
        body: JSON.stringify({ sessionToken: session.token }),
      },
      env,
    );

    expect(res.status).toBe(409);
  });

  // 7. Edge case: session not found
  it("returns 404 for unknown session token", async () => {
    env.DB = mockD1([createAuthSession()]);

    const res = await app.request(
      "/api/profile/build",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: AUTH_COOKIE },
        body: JSON.stringify({ sessionToken: "nonexistent-token" }),
      },
      env,
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error_code).toBe("SESSION_NOT_FOUND");
  });

  // 8. Edge case: missing sessionToken
  it("returns 422 when sessionToken is missing", async () => {
    env.DB = mockD1([createAuthSession()]);

    const res = await app.request(
      "/api/profile/build",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: AUTH_COOKIE },
        body: JSON.stringify({}),
      },
      env,
    );

    expect(res.status).toBe(422);
  });

  // 9. Edge case: invalid JSON body
  it("returns 400 for malformed JSON", async () => {
    env.DB = mockD1([createAuthSession()]);

    const res = await app.request(
      "/api/profile/build",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: AUTH_COOKIE },
        body: "not json",
      },
      env,
    );

    expect(res.status).toBe(400);
  });
});
