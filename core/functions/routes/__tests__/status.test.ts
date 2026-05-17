/**
 * Tests: GET /api/profile/status
 *
 * Integration tests for status polling endpoint.
 * Verifies correct status for each session state, threshold display,
 * and error handling.
 *
 * Layer: Integration (Hono route handlers with mocked bindings)
 * Risk: High (frontend polls this during onboarding)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import profileRoutes from "../profile";
import {
  AUTH_COOKIE,
  createAuthSession,
  createSession,
  mockD1,
} from "test-scripts/profile-test-fixtures";

const app = new Hono<{
  Bindings: { DB: D1Database; STORAGE: R2Bucket; AI: Ai };
}>();
app.route("/api/profile", profileRoutes);

describe("GET /api/profile/status", () => {
  let env: { DB: D1Database; STORAGE: R2Bucket; AI: Ai };

  beforeEach(() => {
    env = { DB: mockD1(), STORAGE: {} as R2Bucket, AI: {} as Ai };
  });

  // 1. Collecting state
  it("returns collecting status with upload counts", async () => {
    const session = createSession({ status: "collecting" });
    env.DB = mockD1([session, createAuthSession()]);

    const res = await app.request(
      `/api/profile/status?sessionToken=${session.token}`,
      {
        headers: { Cookie: AUTH_COOKIE },
      },
      env,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.status).toBe("collecting");
    expect(body.selfieCount).toBe(10);
    expect(body.styleReferenceCount).toBe(5);
    expect(body.thresholds.selfies).toBe(3);
    expect(body.thresholds.styleReferences).toBe(3);
  });

  // 2. Building state
  it("returns building_profile status after build trigger", async () => {
    const session = createSession({ status: "building_profile" });
    env.DB = mockD1([session, createAuthSession()]);

    const res = await app.request(
      `/api/profile/status?sessionToken=${session.token}`,
      {
        headers: { Cookie: AUTH_COOKIE },
      },
      env,
    );
    const body = (await res.json()) as any;
    expect(body.status).toBe("building_profile");
  });

  // 3. Ready state
  it("returns ready when profile build completed", async () => {
    const session = createSession({ status: "ready" });
    env.DB = mockD1([session, createAuthSession()]);

    const res = await app.request(
      `/api/profile/status?sessionToken=${session.token}`,
      {
        headers: { Cookie: AUTH_COOKIE },
      },
      env,
    );
    const body = (await res.json()) as any;
    expect(body.status).toBe("ready");
  });

  // 4. Error state
  it("returns error when extraction failed", async () => {
    const session = createSession({ status: "error" });
    env.DB = mockD1([session, createAuthSession()]);

    const res = await app.request(
      `/api/profile/status?sessionToken=${session.token}`,
      {
        headers: { Cookie: AUTH_COOKIE },
      },
      env,
    );
    const body = (await res.json()) as any;
    expect(body.status).toBe("error");
  });

  // 5. Edge case: session not found
  it("returns 404 for unknown session", async () => {
    env.DB = mockD1([createAuthSession()]);

    const res = await app.request(
      "/api/profile/status?sessionToken=nonexistent",
      {
        headers: { Cookie: AUTH_COOKIE },
      },
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error_code).toBe("SESSION_NOT_FOUND");
  });

  // 6. Edge case: missing query parameter
  it("returns 422 when sessionToken query param is missing", async () => {
    env.DB = mockD1([createAuthSession()]);

    const res = await app.request(
      "/api/profile/status",
      {
        headers: { Cookie: AUTH_COOKIE },
      },
      env,
    );
    expect(res.status).toBe(422);
  });

  // 7. State after failure: no identity_profiles data leaked
  it("status endpoint does not leak identity_profiles data", async () => {
    const session = createSession({ status: "error" });
    env.DB = mockD1([session, createAuthSession()]);
    env.STORAGE = {} as R2Bucket;

    const res = await app.request(
      `/api/profile/status?sessionToken=${session.token}`,
      {
        headers: { Cookie: AUTH_COOKIE },
      },
      env,
    );
    const body = (await res.json()) as any;
    expect(body).not.toHaveProperty("description");
    expect(body).not.toHaveProperty("reference_r2_key");
  });
});
