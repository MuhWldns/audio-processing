/**
 * Integration tests for License Verification flow
 * Tests: handshake, heartbeat, enforce, creator validation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestApp, mockUser, mockLicense } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import {
  handleLicenseHandshake,
  handleLicenseHeartbeat,
  handleLicenseEnforce,
} from "../../src/controllers/licenseEnforceController.js";

function buildApp(user = mockUser) {
  return createTestApp((app) => {
    app.post("/api/license/handshake", handleLicenseHandshake);
    app.post("/api/license/heartbeat", handleLicenseHeartbeat);
    app.post("/api/license/enforce", handleLicenseEnforce);
  }, { user: null }); // Public endpoints, no auth required
}

describe("License Verification Flow", () => {
  beforeEach(() => {
    Object.values(prisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method?.mockReset === "function") method.mockReset();
        });
      }
    });
  });

  describe("POST /api/license/handshake", () => {
    it("should return missing_params if no licenseKey", async () => {
      const app = buildApp();
      const res = await request(app).post("/api/license/handshake").send({ gameId: "123" });
      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe("missing_params");
    });

    it("should return missing_params if no gameId", async () => {
      const app = buildApp();
      const res = await request(app).post("/api/license/handshake").send({ licenseKey: "RBXR-TEST" });
      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
    });

    it("should return invalid_key for non-existent license", async () => {
      prisma.license.findUnique.mockResolvedValue(null);

      const app = buildApp();
      const res = await request(app).post("/api/license/handshake").send({
        licenseKey: "RBXR-FAKE-1234-ABCD-EF56",
        gameId: "123456789",
      });
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe("invalid_key");
    });

    it("should return not_whitelisted if game not in whitelist", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "ACTIVE",
        product: { id: "p1", name: "Script", version: "1.0.0", active: true },
        gameWhitelist: [], // empty = not whitelisted
      });

      const app = buildApp();
      const res = await request(app).post("/api/license/handshake").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "999999",
      });
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe("not_whitelisted");
    });

    it("should return creator_mismatch if creatorId does not match whitelist", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "ACTIVE",
        product: { id: "p1", name: "Script", version: "1.0.0", active: true },
        gameWhitelist: [{ id: "gw-1", gameId: "123456", creatorId: "111111", creatorType: "User", active: true }],
      });
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).post("/api/license/handshake").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
        creatorId: "222222", // mismatch
        creatorType: "User",
      });
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe("creator_mismatch");
    });

    it("should return valid with signKey and sessionToken on success", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "ACTIVE",
        metadata: {},
        product: { id: "p1", name: "Test Script", version: "1.2.0", active: true },
        gameWhitelist: [{ id: "gw-1", gameId: "123456", creatorId: "123456789", creatorType: "User", active: true }],
      });
      prisma.license.update.mockResolvedValue({});
      prisma.gameWhitelist.update.mockResolvedValue({});
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).post("/api/license/handshake").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
        creatorId: "123456789",
        creatorType: "User",
        gameName: "My Game",
      });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.signKey).toBeDefined();
      expect(res.body.signKey.length).toBe(32);
      expect(res.body.sessionToken).toBeDefined();
      expect(res.body.expiresIn).toBe(300);
      expect(res.body.product.name).toBe("Test Script");
      expect(res.body.license.type).toBe("PERSONAL");
    });

    it("should return license_suspended for suspended license", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "SUSPENDED",
        product: { id: "p1", name: "Script", version: "1.0.0", active: true },
        gameWhitelist: [{ id: "gw-1", gameId: "123456", active: true }],
      });
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).post("/api/license/handshake").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
      });
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe("license_suspended");
    });

    it("should auto-expire and return expired for past-due license", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "ACTIVE",
        expiresAt: new Date("2020-01-01"),
        product: { id: "p1", name: "Script", version: "1.0.0", active: true },
        gameWhitelist: [{ id: "gw-1", gameId: "123456", active: true }],
      });
      prisma.license.update.mockResolvedValue({});
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).post("/api/license/handshake").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
      });
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe("expired");
    });
  });

  describe("POST /api/license/heartbeat", () => {
    it("should return missing_params without sessionToken", async () => {
      const app = buildApp();
      const res = await request(app).post("/api/license/heartbeat").send({
        licenseKey: "RBXR-TEST",
        gameId: "123",
      });
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe("missing_params");
    });

    it("should return invalid_session for wrong token", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "ACTIVE",
        metadata: { lastSessionToken: "correct-token" },
        product: { id: "p1", name: "Script", version: "1.0.0", active: true },
        gameWhitelist: [{ id: "gw-1", gameId: "123456", active: true }],
      });
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).post("/api/license/heartbeat").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
        sessionToken: "wrong-token",
      });
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe("invalid_session");
    });

    it("should return valid with rotated signKey", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "ACTIVE",
        metadata: { lastSessionToken: "valid-token" },
        product: { id: "p1", name: "Script", version: "1.0.0", active: true },
        gameWhitelist: [{ id: "gw-1", gameId: "123456", creatorId: "123456789", active: true }],
      });
      prisma.license.update.mockResolvedValue({});
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).post("/api/license/heartbeat").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
        sessionToken: "valid-token",
        creatorId: "123456789",
      });
      expect(res.body.valid).toBe(true);
      expect(res.body.signKey).toBeDefined();
      expect(res.body.signKey.length).toBe(32);
      expect(res.body.expiresIn).toBe(300);
    });

    it("should return creator_mismatch on heartbeat", async () => {
      prisma.license.findUnique.mockResolvedValue({
        ...mockLicense,
        status: "ACTIVE",
        metadata: { lastSessionToken: "valid-token" },
        product: { id: "p1", name: "Script", version: "1.0.0", active: true },
        gameWhitelist: [{ id: "gw-1", gameId: "123456", creatorId: "111111", active: true }],
      });
      prisma.licenseVerification.create.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).post("/api/license/heartbeat").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
        sessionToken: "valid-token",
        creatorId: "999999", // mismatch
      });
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe("creator_mismatch");
    });
  });

  describe("POST /api/license/enforce", () => {
    it("should return missing_params without required fields", async () => {
      const app = buildApp();
      const res = await request(app).post("/api/license/enforce").send({});
      expect(res.status).toBe(400);
    });

    it("should return encrypted payload for phase 1", async () => {
      const app = buildApp();
      const res = await request(app).post("/api/license/enforce").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
        phase: 1,
      });
      expect(res.status).toBe(200);
      expect(res.body.payload).toBeDefined();
      expect(res.body.payload.length).toBeGreaterThan(0);
      expect(res.body.nextPhase).toBe(2);
      expect(res.body.nextDelay).toBe(300);
    });

    it("should cap phase at 5", async () => {
      const app = buildApp();
      const res = await request(app).post("/api/license/enforce").send({
        licenseKey: "RBXR-TEST-1234-ABCD-EF56",
        gameId: "123456",
        phase: 99,
      });
      expect(res.status).toBe(200);
      expect(res.body.nextPhase).toBe(5); // capped
      expect(res.body.nextDelay).toBe(300); // fallback delay
    });

    it("should return different payloads for different phases", async () => {
      const app = buildApp();
      const res1 = await request(app).post("/api/license/enforce").send({
        licenseKey: "RBXR-TEST", gameId: "123", phase: 1,
      });
      const res2 = await request(app).post("/api/license/enforce").send({
        licenseKey: "RBXR-TEST", gameId: "123", phase: 3,
      });
      expect(res1.body.payload).not.toBe(res2.body.payload);
    });
  });
});
