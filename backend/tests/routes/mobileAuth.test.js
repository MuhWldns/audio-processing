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
import jwt from "jsonwebtoken";
import { mockPrisma } from "../helpers/mockPrisma.js";
import { signOAuthState, verifyAccessToken, signAccessToken } from "../../src/services/authTokenService.js";
import { handleGoogleCallback, handleRefresh, handleMobileLogout, redirectOAuthFailure } from "../../src/controllers/authController.js";
import { requireAuth } from "../../src/middlewares/auth.js";
import { requireAdmin } from "../../src/middlewares/admin.js";

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

// Fix #6: OAuth FAILURE (user denied / token-exchange error) must land mobile
// clients back in the app via deep link, not on the web frontend — otherwise
// flutter_web_auth_2 hangs instead of resolving with an error.
function buildFailureApp() {
  const app = express();
  app.get("/auth/google/callback", (req, res) => redirectOAuthFailure(req, res));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return app;
}

describe("redirectOAuthFailure — mobile vs web", () => {
  it("redirects mobile-state failures to the deep link with error=oauth_failed", async () => {
    const state = signOAuthState({ platform: "mobile" });
    const res = await request(buildFailureApp())
      .get(`/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`);
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.protocol).toBe("rbxroyale:");
    expect(url.searchParams.get("error")).toBe("oauth_failed");
  });

  it("redirects web-state failures to FRONTEND_URL/?login=failed", async () => {
    const state = signOAuthState({ platform: "web" });
    const res = await request(buildFailureApp())
      .get(`/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://rbxroyale.dev/?login=failed");
  });

  it("redirects no-state failures to FRONTEND_URL/?login=failed (legacy/web)", async () => {
    const res = await request(buildFailureApp())
      .get("/auth/google/callback?error=access_denied");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://rbxroyale.dev/?login=failed");
  });

  it("redirects forged-state failures to the web frontend (does not trust forged state)", async () => {
    const res = await request(buildFailureApp())
      .get("/auth/google/callback?error=access_denied&state=tampered.state.value.sig");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://rbxroyale.dev/?login=failed");
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

function buildLogoutApp() {
  const app = express();
  app.use(express.json());
  app.post("/auth/logout-mobile", requireAuth, async (req, res, next) => {
    try { await handleMobileLogout(req, res); } catch (err) { next(err); }
  });
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return app;
}

describe("POST /auth/logout-mobile", () => {
  beforeEach(() => {
    mockPrisma.session.deleteMany.mockReset();
    mockPrisma.user.findUnique.mockReset();
  });

  it("revokes the refresh token row and returns 200 (with valid Bearer)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u-logout-1", role: "USER" });
    mockPrisma.session.deleteMany.mockResolvedValueOnce({ count: 1 });
    const access = signAccessToken("u-logout-1", "USER");
    const res = await request(buildLogoutApp())
      .post("/auth/logout-mobile")
      .set("Authorization", `Bearer ${access}`)
      .send({ refresh: "the-refresh-token" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockPrisma.session.deleteMany).toHaveBeenCalled();
    const where = mockPrisma.session.deleteMany.mock.calls[0][0].where;
    expect(where.sessionToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is idempotent — returns 200 even when no row matches", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u-logout-2", role: "USER" });
    mockPrisma.session.deleteMany.mockResolvedValueOnce({ count: 0 });
    const access = signAccessToken("u-logout-2", "USER");
    const res = await request(buildLogoutApp())
      .post("/auth/logout-mobile")
      .set("Authorization", `Bearer ${access}`)
      .send({ refresh: "stale-token" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 401 without a Bearer token", async () => {
    const res = await request(buildLogoutApp())
      .post("/auth/logout-mobile")
      .send({ refresh: "any" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when refresh body field is missing", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u-logout-3", role: "USER" });
    const access = signAccessToken("u-logout-3", "USER");
    const res = await request(buildLogoutApp())
      .post("/auth/logout-mobile")
      .set("Authorization", `Bearer ${access}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

function buildProtectedApp() {
  const app = express();
  app.use(express.json());
  // /auth/me-style: just returns req.user.id
  app.get("/protected/me", requireAuth, (req, res) => {
    res.json({ id: req.user.id, role: req.user.role });
  });
  // simulate /admin/* gating
  app.get("/protected/admin", requireAuth, requireAdmin, (req, res) => {
    res.json({ ok: true });
  });
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return app;
}

describe("Bearer access — existing protected endpoints (regression)", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    process.env.ACCESS_TOKEN_TTL_DAYS = "7";
    mockPrisma.user.findUnique.mockReset();
  });

  it("Bearer reaches a generic requireAuth endpoint and req.user is the DB row", async () => {
    const access = signAccessToken("u-bearer-me", "USER");
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u-bearer-me", role: "USER", email: "b@example.com",
    });
    const res = await request(buildProtectedApp())
      .get("/protected/me")
      .set("Authorization", `Bearer ${access}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("u-bearer-me");
    expect(res.body.role).toBe("USER");
  });

  it("admin endpoint rejects a Bearer USER as 403", async () => {
    const access = signAccessToken("u-bearer-user", "USER");
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u-bearer-user", role: "USER" });
    const res = await request(buildProtectedApp())
      .get("/protected/admin")
      .set("Authorization", `Bearer ${access}`);
    expect(res.status).toBe(403);
  });

  it("admin endpoint accepts a Bearer ADMIN", async () => {
    const access = signAccessToken("u-bearer-admin", "ADMIN");
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u-bearer-admin", role: "ADMIN" });
    const res = await request(buildProtectedApp())
      .get("/protected/admin")
      .set("Authorization", `Bearer ${access}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("expired Bearer returns 401 token_expired", async () => {
    const expired = jwt.sign({ sub: "u", role: "USER" }, process.env.JWT_SECRET, {
      algorithm: "HS256", expiresIn: "-1s",
    });
    const res = await request(buildProtectedApp())
      .get("/protected/me")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_expired");
  });

  it("malformed Bearer returns 401 invalid_token", async () => {
    const res = await request(buildProtectedApp())
      .get("/protected/me")
      .set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_token");
  });
});
