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
import { signOAuthState, verifyAccessToken } from "../../src/services/authTokenService.js";
import { handleGoogleCallback } from "../../src/controllers/authController.js";

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
