/**
 * Tests for Top-up routes
 * POST /topup/create, GET /topup/status/:reference
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestApp, mockUser } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import { handleCreateTopUp, handleGetTopUpStatus } from "../../src/controllers/topupController.js";

// Mock bayarService
vi.mock("../../src/services/bayarService.js", () => ({
  createBayarPayment: vi.fn().mockResolvedValue({
    success: true,
    data: {
      invoice_id: "INV-TEST-123",
      payment_method: "qris",
      expires_at: "2026-05-14T00:15:00.000Z",
      unique_code: "001",
      final_amount: 50000,
      payment_url: "https://bayar.gg/pay/test",
      qris_static_image_url: "https://bayar.gg/qr/test.png",
    },
  }),
  verifyBayarWebhookSignature: vi.fn().mockReturnValue(true),
  getBayarConfig: vi.fn().mockReturnValue({
    apiKey: "test-key",
    baseUrl: "https://www.bayar.gg/api",
    webhookSecret: "test-secret",
  }),
}));

function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    app.post("/topup/create", requireAuth, handleCreateTopUp);
    app.get("/topup/status/:reference", requireAuth, handleGetTopUpStatus);
  }, { user });
}

describe("Top-up Routes", () => {
  beforeEach(() => {
    Object.values(prisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method?.mockReset === "function") method.mockReset();
        });
      }
    });
  });

  describe("POST /topup/create", () => {
    it("should return 401 if not authenticated", async () => {
      const app = buildApp(null);
      const res = await request(app).post("/topup/create").send({ amount: 50000 });
      expect(res.status).toBe(401);
    });

    it("should return 400 if amount is not integer", async () => {
      const app = buildApp();
      const res = await request(app).post("/topup/create").send({ amount: "abc" });
      expect(res.status).toBe(400);
    });

    it("should return 400 if amount below minimum", async () => {
      const app = buildApp();
      const res = await request(app).post("/topup/create").send({ amount: 500 });
      expect(res.status).toBe(400);
    });

    it("should return 400 if amount exceeds limit", async () => {
      const app = buildApp();
      const res = await request(app).post("/topup/create").send({ amount: 600000 });
      expect(res.status).toBe(400);
    });

    it("should create top-up order successfully", async () => {
      prisma.topUpOrder.create.mockResolvedValue({
        id: "order-1",
        userId: mockUser.id,
        provider: "bayar.gg",
        externalId: "INV-TEST-123",
        amountRupiah: 50000,
        finalAmount: 50000,
        status: "PENDING",
      });

      const app = buildApp();
      const res = await request(app).post("/topup/create").send({ amount: 50000 });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.invoiceId).toBe("INV-TEST-123");
      expect(res.body.amount).toBe(50000);
      expect(res.body.paymentUrl).toBe("https://bayar.gg/pay/test");
      expect(res.body.qrisImageUrl).toBe("https://bayar.gg/qr/test.png");
    });
  });

  describe("GET /topup/status/:reference", () => {
    it("should return 401 if not authenticated", async () => {
      const app = buildApp(null);
      const res = await request(app).get("/topup/status/order-1");
      expect(res.status).toBe(401);
    });

    it("should return 404 if order not found", async () => {
      prisma.topUpOrder.findFirst.mockResolvedValue(null);

      const app = buildApp();
      const res = await request(app).get("/topup/status/non-existent");
      expect(res.status).toBe(404);
    });

    it("should return pending status", async () => {
      prisma.topUpOrder.findFirst.mockResolvedValue({
        id: "order-1",
        status: "PENDING",
        amountRupiah: 50000,
        finalAmount: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const app = buildApp();
      const res = await request(app).get("/topup/status/order-1");

      expect(res.status).toBe(200);
      expect(res.body.paid).toBe(false);
      expect(res.body.status).toBe("PENDING");
      expect(res.body.amount).toBe(50000);
    });

    it("should return completed status", async () => {
      prisma.topUpOrder.findFirst.mockResolvedValue({
        id: "order-1",
        status: "COMPLETED",
        amountRupiah: 50000,
        finalAmount: 50200,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const app = buildApp();
      const res = await request(app).get("/topup/status/order-1");

      expect(res.status).toBe(200);
      expect(res.body.paid).toBe(true);
      expect(res.body.status).toBe("COMPLETED");
    });
  });
});
