/**
 * Tests for OAuth callback mobile branch.
 *
 * The callback handlers (handleGoogleCallback / handleDiscordCallback) need to
 * branch on the verified `state` query param: if state.platform === "mobile",
 * issue tokens and redirect to MOBILE_DEEP_LINK_REDIRECT with access+refresh in
 * the URL. Web behavior (redirect to FRONTEND_URL/?login=success) must be
 * preserved exactly.
 *
 * We can't use createTestApp here because it installs its own mocked
 * requireAuth/passport. Following the buildBearerApp pattern in auth.test.js,
 * we build an inline express() app and inject req.user with a stub middleware
 * that simulates a successful passport.authenticate() callback.
 */
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { mockPrisma } from "../helpers/mockPrisma.js";
import { signOAuthState, verifyAccessToken, signAccessToken } from "../../src/services/authTokenService.js";
import { handleGoogleCallback, handleRefresh } from "../../src/controllers/authController.js";

function buildCallbackApp(overrideUser) {
  const app = express();
  // Simulate passport: populate req.user as if the verify callback just upserted them.
  app.use((req, res, next) => {
    req.user = overrideUser ?? { id: "user-callback-test", role: "USER" };
    next();
  });
  app.get("/auth/google/callback", async (req, res, next) => {
    try {
      await handleGoogleCallback(req, res);
    } catch (err) {
      next(err);
    }
  });
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return app;
}

beforeEach(() => {
  mockPrisma.session.create.mockClear();
  mockPrisma.session.create.mockResolvedValue({ id: "s-mock" });
  mockPrisma.activityLog.create.mockResolvedValue({ id: "a-mock" });
  mockPrisma.user.update.mockResolvedValue({ id: "user-callback-test" });
  process.env.JWT_SECRET = "test-secret";
  process.env.ACCESS_TOKEN_TTL_DAYS = "7";
  process.env.REFRESH_TOKEN_TTL_DAYS = "30";
  process.env.MOBILE_DEEP_LINK_REDIRECT = "rbxroyale://auth";
  process.env.FRONTEND_URL = "https://rbxroyale.dev";
});

describe("OAuth callback — mobile branch", () => {
  it("with mobile state redirects to deep link with access and refresh tokens", async () => {
    const state = signOAuthState({ platform: "mobile" });
    const res = await request(buildCallbackApp())
      .get(`/auth/google/callback?code=fake&state=${encodeURIComponent(state)}`);
    expect(res.status).toBe(302);
    const location = res.headers.location;
    expect(location).toMatch(/^rbxroyale:\/\/auth\?/);
    const url = new URL(location);
    const access = url.searchParams.get("access");
    const refresh = url.searchParams.get("refresh");
    expect(access).toBeTruthy();
    expect(refresh).toBeTruthy();
    const payload = verifyAccessToken(access);
    expect(payload.sub).toBe("user-callback-test");
    expect(payload.role).toBe("USER");
    expect(mockPrisma.session.create).toHaveBeenCalledOnce();
  });

  it("with web state redirects to FRONTEND_URL (existing behavior preserved)", async () => {
    const state = signOAuthState({ platform: "web" });
    const res = await request(buildCallbackApp())
      .get(`/auth/google/callback?code=fake&state=${encodeURIComponent(state)}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://rbxroyale.dev/?login=success");
    expect(mockPrisma.session.create).not.toHaveBeenCalled();
  });

  it("with no state (legacy / passport without state) defaults to web behavior", async () => {
    const res = await request(buildCallbackApp())
      .get("/auth/google/callback?code=fake");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://rbxroyale.dev/?login=success");
    expect(mockPrisma.session.create).not.toHaveBeenCalled();
  });

  it("with forged state redirects to FRONTEND_URL/?login=failed and issues no tokens", async () => {
    const res = await request(buildCallbackApp())
      .get("/auth/google/callback?code=fake&state=tampered.state.value.sig");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://rbxroyale.dev/?login=failed");
    expect(mockPrisma.session.create).not.toHaveBeenCalled();
  });
});

function buildRefreshApp() {
  const app = express();
  app.use(express.json());
  app.post("/auth/refresh", async (req, res, next) => {
    try { await handleRefresh(req, res); } catch (err) { next(err); }
  });
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return app;
}

describe("POST /auth/refresh", () => {
  beforeEach(() => {
    mockPrisma.session.findUnique.mockReset();
    mockPrisma.session.delete.mockReset();
    mockPrisma.session.create.mockReset();
    mockPrisma.session.deleteMany.mockReset();
    mockPrisma.user.findUnique.mockReset();
    mockPrisma.$transaction.mockReset();
    // Restore the default $transaction behavior so callbacks work, but still
    // allow tests to override with mockResolvedValueOnce for array forms.
    mockPrisma.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === "function") return await arg(mockPrisma);
      return arg;
    });
  });

  it("returns new access and refresh tokens for a valid refresh", async () => {
    const refreshRaw = "fake-refresh-input";
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      id: "s-rotate", userId: "u-rotate", sessionToken: "any-hash",
      expiresAt: new Date(Date.now() + 1_000_000),
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u-rotate", role: "USER" });
    mockPrisma.$transaction.mockResolvedValueOnce([{}, { id: "s-new" }]);

    const res = await request(buildRefreshApp())
      .post("/auth/refresh")
      .send({ refresh: refreshRaw });
    expect(res.status).toBe(200);
    expect(res.body.access).toBeTruthy();
    expect(res.body.refresh).toBeTruthy();
    expect(res.body.refresh).not.toBe(refreshRaw);
    const ttlSeconds = 7 * 24 * 60 * 60;
    expect(res.body.expiresIn).toBe(ttlSeconds);
  });

  it("returns 400 when refresh body field is missing", async () => {
    const res = await request(buildRefreshApp())
      .post("/auth/refresh")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/refresh/);
  });

  it("returns 401 refresh_invalid for an unknown token", async () => {
    mockPrisma.session.findUnique.mockResolvedValueOnce(null);
    const res = await request(buildRefreshApp())
      .post("/auth/refresh")
      .send({ refresh: "definitely-not-a-real-token" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("refresh_invalid");
  });

  it("returns 401 refresh_invalid for an expired session row", async () => {
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      id: "s1", userId: "u1", sessionToken: "x",
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await request(buildRefreshApp())
      .post("/auth/refresh")
      .send({ refresh: "expired-token" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("refresh_invalid");
  });

  it("triggers reuse detection: unknown refresh + Bearer access identifies user and revokes their sessions", async () => {
    mockPrisma.session.findUnique.mockResolvedValueOnce(null);
    mockPrisma.session.deleteMany.mockResolvedValueOnce({ count: 2 });

    const access = signAccessToken("u-reuse", "USER");

    const res = await request(buildRefreshApp())
      .post("/auth/refresh")
      .set("Authorization", `Bearer ${access}`)
      .send({ refresh: "rotated-or-stolen-token" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("refresh_invalid");
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-reuse" } });
  });
});
