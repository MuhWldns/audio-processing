/**
 * Tests for License management routes
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestApp, mockUser, mockLicense } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import {
  handleGetLicenses,
  handleGetLicenseDetail,
  handleAddGameToWhitelist,
  handleRemoveGameFromWhitelist,
} from "../../src/controllers/licenseController.js";

// Mock roblox ownership service
vi.mock("../../src/services/robloxOwnershipService.js", () => ({
  verifyPlaceOwnership: vi.fn().mockResolvedValue({
    valid: true,
    universeId: "111111",
    creatorId: "123456789",
    creatorType: "User",
    gameName: "Test Game",
  }),
  validateRobloxUser: vi.fn().mockResolvedValue({ id: "123456789", name: "TestUser", displayName: "Test" }),
}));

function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    app.get("/licenses", requireAuth, handleGetLicenses);
    app.get("/licenses/:id", requireAuth, handleGetLicenseDetail);
    app.post("/licenses/:id/whitelist", requireAuth, handleAddGameToWhitelist);
    app.delete("/licenses/:id/whitelist/:gameWhitelistId", requireAuth, handleRemoveGameFromWhitelist);
  }, { user });
}

describe("License Management Routes", () => {
  beforeEach(() => {
    Object.values(prisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method?.mockReset === "function") method.mockReset();
        });
      }
    });
  });

  describe("GET /licenses", () => {
    it("should return 401 if not authenticated", async () => {
      const app = buildApp(null);
      const res = await request(app).get("/licenses");
      expect(res.status).toBe(401);
    });

    it("should return empty list", async () => {
      prisma.license.findMany.mockResolvedValue([]);

      const app = buildApp();
      const res = await request(app).get("/licenses");

      expect(res.status).toBe(200);
      expect(res.body.licenses).toEqual([]);
    });

    it("should return user licenses", async () => {
      prisma.license.findMany.mockResolvedValue([
        {
          ...mockLicense,
          product: { id: "p1", name: "Test Script", slug: "test-script", thumbnail: null, version: "1.0.0" },
          gameWhitelist: [{ id: "gw-1", gameId: "123456", gameName: "My Game", addedAt: new Date() }],
          _count: { verifications: 5 },
        },
      ]);

      const app = buildApp();
      const res = await request(app).get("/licenses");

      expect(res.status).toBe(200);
      expect(res.body.licenses).toHaveLength(1);
      expect(res.body.licenses[0].licenseKey).toBe("RBXR-TEST-1234-ABCD-EF56");
      expect(res.body.licenses[0].games).toHaveLength(1);
    });
  });

  describe("GET /licenses/:id", () => {
    it("should return 404 if not found", async () => {
      prisma.license.findFirst.mockResolvedValue(null);

      const app = buildApp();
      const res = await request(app).get("/licenses/non-existent");
      expect(res.status).toBe(404);
    });

    it("should return license detail", async () => {
      prisma.license.findFirst.mockResolvedValue({
        ...mockLicense,
        product: { id: "p1", name: "Test Script", slug: "test-script", thumbnail: null, version: "1.0.0", description: "desc" },
        purchase: { id: "pur-1", amountRupiah: 25000, purchasedAt: new Date() },
        gameWhitelist: [],
        verifications: [],
      });

      const app = buildApp();
      const res = await request(app).get("/licenses/license-test-123");

      expect(res.status).toBe(200);
      expect(res.body.licenseKey).toBe("RBXR-TEST-1234-ABCD-EF56");
      expect(res.body.licenseType).toBe("PERSONAL");
    });
  });

  describe("POST /licenses/:id/whitelist", () => {
    it("should return 400 if gameId missing", async () => {
      const app = buildApp();
      const res = await request(app).post("/licenses/license-test-123/whitelist").send({});
      expect(res.status).toBe(400);
    });

    it("should return 404 if license not found", async () => {
      prisma.user.findUnique.mockResolvedValue({ robloxUserId: "123456789" });
      prisma.license.findFirst.mockResolvedValue(null);

      const app = buildApp();
      const res = await request(app).post("/licenses/x/whitelist").send({ gameId: "123" });
      expect(res.status).toBe(404);
    });

    it("should return 403 if max games reached", async () => {
      prisma.user.findUnique.mockResolvedValue({ robloxUserId: "123456789" });
      prisma.license.findFirst.mockResolvedValue({
        ...mockLicense,
        maxGames: 3,
        gameWhitelist: [{ id: "g1", active: true }, { id: "g2", active: true }, { id: "g3", active: true }],
      });

      const app = buildApp();
      const res = await request(app).post("/licenses/license-test-123/whitelist").send({ gameId: "999" });

      expect(res.status).toBe(403);
    });

    it("should add game to whitelist", async () => {
      prisma.user.findUnique.mockResolvedValue({ robloxUserId: "123456789" });
      prisma.license.findFirst.mockResolvedValue({
        ...mockLicense,
        maxGames: 3,
        gameWhitelist: [{ id: "g1", active: true }],
      });
      prisma.gameWhitelist.findUnique.mockResolvedValue(null);
      prisma.gameWhitelist.create.mockResolvedValue({
        id: "gw-new",
        licenseId: "license-test-123",
        gameId: "123456",
        gameName: "Test Game",
        active: true,
        addedAt: new Date(),
      });

      const app = buildApp();
      const res = await request(app).post("/licenses/license-test-123/whitelist").send({
        gameId: "123456",
        gameName: "My Game",
      });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.game.gameId).toBe("123456");
    });

    it("should return 409 if already whitelisted", async () => {
      prisma.user.findUnique.mockResolvedValue({ robloxUserId: "123456789" });
      prisma.license.findFirst.mockResolvedValue({
        ...mockLicense,
        maxGames: 3,
        gameWhitelist: [{ id: "g1", active: true }],
      });
      prisma.gameWhitelist.findUnique.mockResolvedValue({ id: "gw-1", active: true, gameName: "X" });

      const app = buildApp();
      const res = await request(app).post("/licenses/license-test-123/whitelist").send({ gameId: "123" });
      expect(res.status).toBe(409);
    });
  });

  describe("DELETE /licenses/:id/whitelist/:gameWhitelistId", () => {
    it("should return 404 if license not found", async () => {
      prisma.license.findFirst.mockResolvedValue(null);

      const app = buildApp();
      const res = await request(app).delete("/licenses/x/whitelist/gw-1");
      expect(res.status).toBe(404);
    });

    it("should deactivate game", async () => {
      prisma.license.findFirst.mockResolvedValue(mockLicense);
      prisma.gameWhitelist.findFirst.mockResolvedValue({ id: "gw-1", licenseId: "license-test-123" });
      prisma.gameWhitelist.update.mockResolvedValue({ id: "gw-1", active: false });

      const app = buildApp();
      const res = await request(app).delete("/licenses/license-test-123/whitelist/gw-1");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
