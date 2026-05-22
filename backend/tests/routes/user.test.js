/**
 * Integration tests for User Controller
 * Tests: roblox ID binding, transactions, admin user management
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestApp, mockUser } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import {
  handleSetRobloxUserId,
  handleGetUserTransactions,
  handleAdminListUsers,
  handleAdminChangeUserRole,
  handleAdminAdjustUserBalance,
} from "../../src/controllers/userController.js";

// Mock roblox ownership service
vi.mock("../../src/services/robloxOwnershipService.js", () => ({
  validateRobloxUser: vi.fn().mockResolvedValue({ id: "123456789", name: "TestUser", displayName: "Test" }),
  verifyPlaceOwnership: vi.fn().mockResolvedValue({ valid: true, universeId: "111", creatorId: "123456789", creatorType: "User", gameName: "Test" }),
}));

function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    app.put("/user/roblox-id", requireAuth, handleSetRobloxUserId);
    app.get("/user/transactions", requireAuth, handleGetUserTransactions);
    app.get("/admin/users", requireAuth, handleAdminListUsers);
    app.put("/admin/users/:id/role", requireAuth, handleAdminChangeUserRole);
    app.post("/admin/users/:id/adjust-balance", requireAuth, handleAdminAdjustUserBalance);
  }, { user });
}

describe("User Controller", () => {
  beforeEach(() => {
    Object.values(prisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method?.mockReset === "function") method.mockReset();
        });
      }
    });
    prisma.$transaction.mockImplementation(async (fn) => {
      if (typeof fn === "function") return await fn(prisma);
      return fn;
    });
  });

  describe("PUT /user/roblox-id", () => {
    it("should return 401 if not authenticated", async () => {
      const app = buildApp(null);
      const res = await request(app).put("/user/roblox-id").send({ robloxUserId: "123" });
      expect(res.status).toBe(401);
    });

    it("should return 400 if robloxUserId missing", async () => {
      const app = buildApp();
      const res = await request(app).put("/user/roblox-id").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("robloxUserId is required");
    });

    it("should return 400 if non-numeric", async () => {
      const app = buildApp();
      const res = await request(app).put("/user/roblox-id").send({ robloxUserId: "abc" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Roblox User ID must be numeric");
    });

    it("should return 404 if Roblox user not found", async () => {
      const { validateRobloxUser } = await import("../../src/services/robloxOwnershipService.js");
      validateRobloxUser.mockResolvedValueOnce(null);

      const app = buildApp();
      const res = await request(app).put("/user/roblox-id").send({ robloxUserId: "999999999" });
      expect(res.status).toBe(404);
    });

    it("should save and return username on success", async () => {
      prisma.user.update.mockResolvedValue({ id: mockUser.id, robloxUserId: "123456789" });

      const app = buildApp();
      const res = await request(app).put("/user/roblox-id").send({ robloxUserId: "123456789" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.robloxUsername).toBe("TestUser");
      expect(res.body.robloxDisplayName).toBe("Test");
    });
  });

  describe("GET /user/transactions", () => {
    it("should return 401 if not authenticated", async () => {
      const app = buildApp(null);
      const res = await request(app).get("/user/transactions");
      expect(res.status).toBe(401);
    });

    it("should return empty transactions", async () => {
      prisma.walletTransaction.findMany.mockResolvedValue([]);
      prisma.walletTransaction.count.mockResolvedValue(0);

      const app = buildApp();
      const res = await request(app).get("/user/transactions");
      expect(res.status).toBe(200);
      expect(res.body.transactions).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });

    it("should return paginated transactions", async () => {
      prisma.walletTransaction.findMany.mockResolvedValue([
        { id: "tx-1", type: "TOP_UP", amount: 50000, balanceAfter: 50000, description: "Top up", createdAt: new Date() },
      ]);
      prisma.walletTransaction.count.mockResolvedValue(1);

      const app = buildApp();
      const res = await request(app).get("/user/transactions?page=1&limit=20");
      expect(res.status).toBe(200);
      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.transactions[0].type).toBe("TOP_UP");
      expect(res.body.pagination.total).toBe(1);
    });

    it("should filter by type", async () => {
      prisma.walletTransaction.findMany.mockResolvedValue([]);
      prisma.walletTransaction.count.mockResolvedValue(0);

      const app = buildApp();
      await request(app).get("/user/transactions?type=PURCHASE");

      expect(prisma.walletTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: "PURCHASE" }),
        })
      );
    });
  });

  describe("GET /admin/users", () => {
    it("should return users list", async () => {
      prisma.user.findMany.mockResolvedValue([
        { ...mockUser, _count: { licenses: 2, purchases: 3 } },
      ]);
      prisma.user.count.mockResolvedValue(1);

      const app = buildApp({ ...mockUser, role: "ADMIN" });
      const res = await request(app).get("/admin/users");
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0].licensesCount).toBe(2);
    });

    it("should support search", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const app = buildApp({ ...mockUser, role: "ADMIN" });
      await request(app).get("/admin/users?search=test@email.com");

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { email: { contains: "test@email.com" } },
            ]),
          }),
        })
      );
    });
  });

  describe("PUT /admin/users/:id/role", () => {
    it("should return 400 for invalid role", async () => {
      const app = buildApp({ ...mockUser, role: "ADMIN" });
      const res = await request(app).put("/admin/users/user-2/role").send({ role: "SUPERADMIN" });
      expect(res.status).toBe(400);
    });

    it("should return 403 when demoting self", async () => {
      const app = buildApp({ ...mockUser, role: "ADMIN" });
      const res = await request(app).put(`/admin/users/${mockUser.id}/role`).send({ role: "USER" });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Cannot demote yourself");
    });

    it("should promote user successfully", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-2", role: "USER" });
      prisma.user.update.mockResolvedValue({ id: "user-2", email: "other@test.com", displayName: "Other", role: "ADMIN" });
      prisma.activityLog.create.mockResolvedValue({});

      const app = buildApp({ ...mockUser, role: "ADMIN" });
      const res = await request(app).put("/admin/users/user-2/role").send({ role: "ADMIN" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user.role).toBe("ADMIN");
    });
  });

  describe("POST /admin/users/:id/adjust-balance", () => {
    it("should return 400 if amount is zero", async () => {
      const app = buildApp({ ...mockUser, role: "ADMIN" });
      const res = await request(app).post("/admin/users/user-2/adjust-balance").send({ amount: 0, reason: "test" });
      expect(res.status).toBe(400);
    });

    it("should return 400 if reason missing", async () => {
      const app = buildApp({ ...mockUser, role: "ADMIN" });
      const res = await request(app).post("/admin/users/user-2/adjust-balance").send({ amount: 5000 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Reason is required");
    });

    it("should return 400 if would go negative", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-2", walletBalance: 10000, email: "x", displayName: "X" });

      const app = buildApp({ ...mockUser, role: "ADMIN" });
      const res = await request(app).post("/admin/users/user-2/adjust-balance").send({ amount: -20000, reason: "deduct" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("negative balance");
    });

    it("should adjust balance successfully", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-2", walletBalance: 50000, email: "x", displayName: "X" });
      prisma.user.update.mockResolvedValue({ id: "user-2", walletBalance: 75000 });
      prisma.walletTransaction.create.mockResolvedValue({});
      prisma.activityLog.create.mockResolvedValue({});

      const app = buildApp({ ...mockUser, role: "ADMIN" });
      const res = await request(app).post("/admin/users/user-2/adjust-balance").send({ amount: 25000, reason: "Bonus" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user.newBalance).toBe(75000);
    });
  });
});
