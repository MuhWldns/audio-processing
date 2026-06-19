/**
 * Tests for Auth routes
 * GET /auth/me, POST /auth/logout
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { createTestApp, mockUser } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import { handleGetMe, handleLogout } from "../../src/controllers/authController.js";
import { handleGetCart } from "../../src/controllers/cartController.js";
import { requireAuth } from "../../src/middlewares/auth.js";
import { signAccessToken } from "../../src/services/authTokenService.js";

function resetPrismaMocks() {
  Object.values(prisma).forEach((model) => {
    if (typeof model === "function" && model.mockReset) {
      model.mockReset();
      return;
    }

    if (typeof model === "object" && model !== null) {
      Object.values(model).forEach((method) => {
        if (typeof method === "function" && method.mockReset) {
          method.mockReset();
        }
      });
    }
  });
}

function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    app.get("/auth/me", handleGetMe);

    app.post("/auth/logout", requireAuth, (req, res, next) => {
      req.logout = (callback) => callback();
      req.session.destroy = (callback) => callback();
      return handleLogout(req, res, next);
    });
  }, { user });
}

describe("Auth Routes", () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  describe("GET /auth/me", () => {
    it("should return null user when not authenticated", async () => {
      const app = buildApp(null);
      const res = await request(app).get("/auth/me");

      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });

    it("should return user data when authenticated", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        accounts: [{ provider: "GOOGLE" }],
      });
      const app = buildApp();
      const res = await request(app).get("/auth/me");

      expect(res.status).toBe(200);
      expect(res.body.user).not.toBeNull();
      expect(res.body.user.id).toBe("user-test-123");
      expect(res.body.user.publicId).toBe("ACC-IDN-2606-000001");
      expect(res.body.user.email).toBe("test@example.com");
      expect(res.body.user.displayName).toBe("Test User");
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-test-123" },
        include: { accounts: true },
      });
    });
  });

  describe("POST /auth/logout", () => {
    it("should return 401 if not authenticated", async () => {
      const app = buildApp(null);
      const res = await request(app).post("/auth/logout");
      expect(res.status).toBe(401);
    });

    it("should logout successfully", async () => {
      prisma.activityLog.create.mockResolvedValue({ id: "activity-test-123" });
      const app = buildApp();
      const res = await request(app).post("/auth/logout");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-test-123",
          type: "LOGOUT",
          status: "SUCCESS",
        }),
      });
    });
  });
});

// Build an app that exercises the REAL requireAuth from src/middlewares/auth.js
// (the createTestApp helper installs its own mock requireAuth, which we don't
// want here since we're testing the production middleware). We mount /cart
// because handleGetCart only reads req.user.id and needs one Prisma mock for
// the happy path — the simplest route that proves Bearer reaches the controller.
function buildBearerApp() {
  const app = express();
  app.use(express.json());
  // No passport / session — Bearer path should not require either.
  app.get("/cart", requireAuth, handleGetCart);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

describe("requireAuth — Bearer token path", () => {
  beforeEach(() => {
    resetPrismaMocks();
    process.env.JWT_SECRET = "test-secret";
    process.env.ACCESS_TOKEN_TTL_DAYS = "7";
  });

  it("accepts a valid Bearer JWT and populates req.user", async () => {
    const token = signAccessToken("user-bearer-1", "USER");
    prisma.user.findUnique.mockResolvedValueOnce({
      id: "user-bearer-1",
      role: "USER",
      email: "b@example.com",
    });
    // No cart for this user → handleGetCart returns 200 with empty items.
    prisma.cart.findUnique.mockResolvedValueOnce(null);

    const app = buildBearerApp();
    const res = await request(app)
      .get("/cart")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-bearer-1" },
    });
  });

  it("returns 401 invalid_token for a malformed Bearer", async () => {
    const app = buildBearerApp();
    const res = await request(app)
      .get("/cart")
      .set("Authorization", "Bearer not-a-real-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_token");
  });

  it("returns 401 token_expired for an expired Bearer", async () => {
    const expired = jwt.sign(
      { sub: "u", role: "USER" },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "-1s" },
    );
    const app = buildBearerApp();
    const res = await request(app)
      .get("/cart")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_expired");
  });

  it("returns 401 invalid_token when Bearer subject does not exist", async () => {
    const token = signAccessToken("ghost-user", "USER");
    prisma.user.findUnique.mockResolvedValueOnce(null);
    const app = buildBearerApp();
    const res = await request(app)
      .get("/cart")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_token");
  });

  it("falls back to cookie session path when no Bearer header is present", async () => {
    // No Authorization header → falls through to req.isAuthenticated() check,
    // which is false in this minimal app, so returns 401 "Not authenticated".
    const app = buildBearerApp();
    const res = await request(app).get("/cart");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Not authenticated");
  });

  it("propagates DB errors as 500, NOT 401, when user lookup throws", async () => {
    const token = signAccessToken("user-db-fail", "USER");
    prisma.user.findUnique.mockRejectedValueOnce(new Error("connection refused"));
    const app = buildBearerApp();
    const res = await request(app)
      .get("/cart")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(500);
    expect(res.body.error).not.toBe("invalid_token");
  });
});

// Regression: /auth/me must accept Bearer JWT, not only cookie session.
// Earlier version of /auth/me had no middleware so req.user was only ever
// populated by the passport cookie deserializer. Mobile clients sending a
// valid Bearer JWT got `{user: null}` back. optionalAuth fixes this.
import { optionalAuth } from "../../src/middlewares/auth.js";

function buildMeApp() {
  const app = express();
  app.use(express.json());
  app.get("/auth/me", optionalAuth, handleGetMe);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

describe("GET /auth/me — Bearer support (regression)", () => {
  beforeEach(() => {
    resetPrismaMocks();
    process.env.JWT_SECRET = "test-secret";
    process.env.ACCESS_TOKEN_TTL_DAYS = "7";
  });

  it("returns the user when called with a valid Bearer JWT", async () => {
    const token = signAccessToken("user-me-bearer", "USER");
    // optionalAuth's user lookup → returns minimal record.
    prisma.user.findUnique.mockResolvedValueOnce({
      id: "user-me-bearer",
      role: "USER",
    });
    // handleGetMe → buildMePayload then re-fetches with include accounts.
    prisma.user.findUnique.mockResolvedValueOnce({
      id: "user-me-bearer",
      publicId: "ACC-IDN-2606-000999",
      email: "bearer@example.com",
      displayName: "Bearer User",
      role: "USER",
      walletBalance: 0,
      totalTopUp: 0,
      totalSpent: 0,
      freeAudioDateKey: null,
      freeAudioUsedToday: 0,
      freeAudioDailyLimit: 3,
      paidAudioCost: 2000,
      accounts: [{ provider: "GOOGLE" }],
    });

    const app = buildMeApp();
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).not.toBeNull();
    expect(res.body.user.id).toBe("user-me-bearer");
    expect(res.body.user.email).toBe("bearer@example.com");
  });

  it("returns {user:null} when called with no Bearer and no cookie", async () => {
    const app = buildMeApp();
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it("returns 401 token_expired when Bearer is expired (NOT silently anonymous)", async () => {
    const expired = jwt.sign(
      { sub: "u", role: "USER" },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "-1s" },
    );
    const app = buildMeApp();
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_expired");
  });

  it("returns 401 invalid_token when Bearer is malformed", async () => {
    const app = buildMeApp();
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_token");
  });
});

// Regression: POST /auth/logout via Bearer must revoke refresh tokens, not just
// run the cookie/session no-ops. Earlier version called req.logout() +
// req.session.destroy() (no-ops for Bearer) and returned {ok:true} while the
// user's refresh token stayed alive — a silent logout failure.
function buildLogoutApp() {
  const app = express();
  app.use(express.json());
  app.post("/auth/logout", requireAuth, handleLogout);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

describe("POST /auth/logout — Bearer path (regression)", () => {
  beforeEach(() => {
    resetPrismaMocks();
    process.env.JWT_SECRET = "test-secret";
    process.env.ACCESS_TOKEN_TTL_DAYS = "7";
  });

  it("revokes all refresh tokens for the user when called via Bearer", async () => {
    const token = signAccessToken("user-logout-bearer", "USER");
    prisma.user.findUnique.mockResolvedValueOnce({ id: "user-logout-bearer", role: "USER" });
    prisma.session.deleteMany.mockResolvedValueOnce({ count: 2 });
    prisma.activityLog.create.mockResolvedValueOnce({ id: "log-1" });

    const app = buildLogoutApp();
    const res = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-logout-bearer" },
    });
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-logout-bearer",
        type: "LOGOUT",
        status: "SUCCESS",
      }),
    });
  });

  it("is idempotent — returns 200 even when no refresh rows exist", async () => {
    const token = signAccessToken("user-logout-empty", "USER");
    prisma.user.findUnique.mockResolvedValueOnce({ id: "user-logout-empty", role: "USER" });
    prisma.session.deleteMany.mockResolvedValueOnce({ count: 0 });
    prisma.activityLog.create.mockResolvedValueOnce({ id: "log-2" });

    const app = buildLogoutApp();
    const res = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("propagates DB errors as 500, NOT a false {ok:true}", async () => {
    const token = signAccessToken("user-logout-dbfail", "USER");
    prisma.user.findUnique.mockResolvedValueOnce({ id: "user-logout-dbfail", role: "USER" });
    prisma.session.deleteMany.mockRejectedValueOnce(new Error("connection refused"));

    const app = buildLogoutApp();
    const res = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.ok).not.toBe(true);
  });
});
