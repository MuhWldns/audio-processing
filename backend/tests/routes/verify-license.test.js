/**
 * Tests for License Verification route
 * POST /api/verify-license
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, mockLicense } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import { handleVerifyLicense } from "../../src/controllers/verifyLicenseController.js";

function buildApp() {
  return createTestApp((app) => {
    app.post("/api/verify-license", handleVerifyLicense);
  });
}

describe("License Verification Route", () => {
  beforeEach(() => {
    Object.values(prisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method?.mockReset === "function") method.mockReset();
        });
      }
    });
  });

  describe("POST /api/verify-license", () => {
    it("should return 400 if licenseKey missing", async () => {
      const app = buildApp();
      const res = await request(app).post("/api/verify-license").send({ gameId: "123" });

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
    });

    it("should return 400 if gameId missing", async () => {
      const app = buildApp();
      const res = await request(app).post("/api/verify-license").send({ licenseKey: "RBXR-TEST" });

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
    });

    it("should return invalid for non-existent key", async () => {
      prisma.license.findUnique.mockResolvedValue(null);

      const app = buildApp();
      const res = await request(app).post("/api/verify-license").send({
        licenseKey: "RBXR-FAKE-KEY1-KEY2-KEY3",
        gameId: "123456",
      });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.message).toBe("Invalid license key");
    });

    it("should return invalid for suspended license", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "SUSPENDED",
        product: { id: "p1", name: "Script", version: "1.0.0", active: true },
        gameWhitelist: [],
      });
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).post("/api/verify-license").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
      });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.message).toBe("License is suspended");
    });

    it("should return invalid for expired license", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "ACTIVE",
        expiresAt: new Date("2020-01-01"),
        product: { id: "p1", name: "Script", version: "1.0.0", active: true },
        gameWhitelist: [],
      });
      prisma.license.update.mockResolvedValue({});
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).post("/api/verify-license").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
      });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.message).toBe("License has expired");
    });

    it("should return invalid for deactivated product", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "ACTIVE",
        product: { id: "p1", name: "Script", version: "1.0.0", active: false },
        gameWhitelist: [{ id: "gw-1", gameId: "123456", active: true }],
      });
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).post("/api/verify-license").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
      });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.message).toBe("Product is no longer available");
    });

    it("should return invalid if game not whitelisted", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "ACTIVE",
        product: { id: "p1", name: "Script", version: "1.0.0", active: true },
        gameWhitelist: [],
      });
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).post("/api/verify-license").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "999999",
      });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.message).toContain("not whitelisted");
    });

    it("should return valid for correct key + whitelisted game", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "ACTIVE",
        expiresAt: null,
        product: { id: "p1", name: "Advanced UI System", version: "1.2.0", active: true },
        gameWhitelist: [{ id: "gw-1", gameId: "123456", gameName: "My Game", active: true }],
      });
      prisma.license.update.mockResolvedValue({});
      prisma.gameWhitelist.update.mockResolvedValue({});
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).post("/api/verify-license").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
        gameName: "My Game",
      });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.message).toBe("License verified successfully");
      expect(res.body.product.name).toBe("Advanced UI System");
      expect(res.body.product.version).toBe("1.2.0");
      expect(res.body.license.type).toBe("PERSONAL");
    });

    it("should log verification attempts", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "ACTIVE",
        product: { id: "p1", name: "Script", version: "1.0.0", active: true },
        gameWhitelist: [{ id: "gw-1", gameId: "123456", gameName: null, active: true }],
      });
      prisma.license.update.mockResolvedValue({});
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      await request(app).post("/api/verify-license").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
      });

      expect(prisma.licenseVerification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            licenseId: "license-test-123",
            gameId: "123456",
            success: true,
          }),
        })
      );
    });
  });
});
