/**
 * Tests for Auth routes
 * GET /auth/me, POST /auth/logout
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, mockUser } from "../helpers/testApp.js";
import { mockPrisma, resetAllMocks } from "../helpers/mockPrisma.js";

function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    // Simplified /auth/me for testing
    app.get("/auth/me", (req, res) => {
      if (!req.user) {
        return res.status(200).json({ user: null });
      }
      return res.status(200).json({ user: req.user });
    });

    app.post("/auth/logout", requireAuth, (req, res) => {
      return res.status(200).json({ ok: true });
    });
  }, { user });
}

describe("Auth Routes", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe("GET /auth/me", () => {
    it("should return null user when not authenticated", async () => {
      const app = buildApp(null);
      const res = await request(app).get("/auth/me");

      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });

    it("should return user data when authenticated", async () => {
      const app = buildApp();
      const res = await request(app).get("/auth/me");

      expect(res.status).toBe(200);
      expect(res.body.user).not.toBeNull();
      expect(res.body.user.id).toBe("user-test-123");
      expect(res.body.user.email).toBe("test@example.com");
      expect(res.body.user.displayName).toBe("Test User");
    });
  });

  describe("POST /auth/logout", () => {
    it("should return 401 if not authenticated", async () => {
      const app = buildApp(null);
      const res = await request(app).post("/auth/logout");
      expect(res.status).toBe(401);
    });

    it("should logout successfully", async () => {
      const app = buildApp();
      const res = await request(app).post("/auth/logout");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
