/**
 * Tests for Auth routes
 * GET /auth/me, POST /auth/logout
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, mockUser } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import { handleGetMe, handleLogout } from "../../src/controllers/authController.js";

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
