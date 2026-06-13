/**
 * Tests for Top-up routes
 * POST /topup/create, GET /topup/status/:reference
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestApp, mockUser } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import { handleBayarWebhook, handleCreateTopUp, handleGetTopUpStatus } from "../../src/controllers/topupController.js";

const createMockModel = () => ({
  upsert: vi.fn(),
});

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

// Mock mustikaService
vi.mock("../../src/services/mustikaService.js", () => ({
  createMustikaQris: vi.fn().mockResolvedValue({
    refNo: "QR-TEST-1",
    qrUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR-TEST-1",
    paymentLink: "https://mustikapayment.com/pay/QR-TEST-1",
    amount: 50000,
  }),
  checkMustikaStatus: vi.fn(),
  getMustikaConfig: vi.fn().mockReturnValue({ apiKey: "MP-test", baseUrl: "https://mustikapayment.com" }),
}));

function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    app.post("/topup/create", requireAuth, handleCreateTopUp);
    app.get("/topup/status/:reference", requireAuth, handleGetTopUpStatus);
    app.post("/webhooks/bayar", handleBayarWebhook);
  }, { user });
}

describe("Top-up Routes", () => {
  beforeEach(() => {
    prisma.publicIdCounter ??= createMockModel();
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
      prisma.publicIdCounter.upsert.mockResolvedValue({
        scope: "TOP-IDR-2606",
        nextNumber: 2,
      });
      prisma.topUpOrder.create.mockResolvedValue({
        id: "order-1",
        publicId: "TOP-IDR-2606-000001",
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
      expect(res.body.publicId).toMatch(/^TOP-IDR-\d{4}-000001$/);
      expect(res.body.invoiceId).toBe("INV-TEST-123");
      expect(res.body.amount).toBe(50000);
      expect(res.body.paymentUrl).toBe("https://bayar.gg/pay/test");
      expect(res.body.qrisImageUrl).toBe("https://bayar.gg/qr/test.png");
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.publicIdCounter.upsert).toHaveBeenCalledWith({
        where: { scope: expect.stringMatching(/^TOP-IDR-\d{4}$/) },
        create: { scope: expect.stringMatching(/^TOP-IDR-\d{4}$/), nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
      });
      expect(prisma.topUpOrder.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          publicId: expect.stringMatching(/^TOP-IDR-\d{4}-000001$/),
        }),
      }));
    });
  });

  describe("POST /topup/create with TOPUP_PROVIDER=mustika", () => {
    it("creates a MustikaPay QRIS order and returns mapped fields", async () => {
      const prev = process.env.TOPUP_PROVIDER;
      process.env.TOPUP_PROVIDER = "mustika";

      prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TOP-IDR-2606", nextNumber: 2 });
      prisma.topUpOrder.create.mockResolvedValue({
        id: "order-m1",
        publicId: "TOP-IDR-2606-000002",
        userId: mockUser.id,
        provider: "mustika",
        externalId: "QR-TEST-1",
        amountRupiah: 50000,
        status: "PENDING",
        metadata: {
          qrUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR-TEST-1",
          paymentLink: "https://mustikapayment.com/pay/QR-TEST-1",
        },
      });

      const app = buildApp();
      const res = await request(app).post("/topup/create").send({ amount: 50000 });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.invoiceId).toBe("QR-TEST-1");
      expect(res.body.qrisImageUrl).toBe("https://mustikapayment.com/api/qr?data=000201&ref_no=QR-TEST-1");
      expect(res.body.paymentUrl).toBe("https://mustikapayment.com/pay/QR-TEST-1");
      expect(res.body.expiresAt).toBeTruthy();

      const createArg = prisma.topUpOrder.create.mock.calls[0][0];
      expect(createArg.data.provider).toBe("mustika");
      expect(createArg.data.externalId).toBe("QR-TEST-1");

      process.env.TOPUP_PROVIDER = prev;
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
        publicId: "TOP-IDR-2606-000001",
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
      expect(res.body.publicId).toBe("TOP-IDR-2606-000001");
      expect(res.body.amount).toBe(50000);
    });

    it("should return completed status", async () => {
      prisma.topUpOrder.findFirst.mockResolvedValue({
        id: "order-1",
        publicId: "TOP-IDR-2606-000001",
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
      expect(res.body.publicId).toBe("TOP-IDR-2606-000001");
    });
  });

  describe("POST /webhooks/bayar", () => {
    it("should create wallet transaction with publicId when paid webhook succeeds", async () => {
      prisma.publicIdCounter.upsert.mockResolvedValue({
        scope: "TXN-TOP-2606",
        nextNumber: 2,
      });
      prisma.topUpOrder.findUnique.mockResolvedValue({
        id: "order-1",
        publicId: "TOP-IDR-2606-000001",
        userId: mockUser.id,
        externalId: "INV-TEST-123",
        amountRupiah: 50000,
        status: "PENDING",
        metadata: {},
      });
      prisma.topUpOrder.update.mockResolvedValue({});
      prisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.update.mockResolvedValue({ walletBalance: 150000 });
      prisma.walletTransaction.create.mockResolvedValue({ id: "wallet-transaction-1" });
      prisma.activityLog.create.mockResolvedValue({ id: "activity-1" });
      prisma.user.findUnique.mockResolvedValue({
        email: mockUser.email,
        displayName: mockUser.displayName,
        walletBalance: 150000,
      });

      const app = buildApp();
      const res = await request(app).post("/webhooks/bayar").send({
        invoice_id: "INV-TEST-123",
        status: "paid",
        amount: 50000,
        final_amount: 50000,
        paid_at: "2026-06-01T00:00:00Z",
      });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          publicId: expect.stringMatching(/^TXN-TOP-\d{4}-000001$/),
          userId: mockUser.id,
          type: "TOP_UP",
        }),
      });
    });
  });

  describe("GET /topup/status — MustikaPay active confirm", () => {
    it("credits a pending mustika order when check returns success", async () => {
      const { checkMustikaStatus } = await import("../../src/services/mustikaService.js");
      checkMustikaStatus.mockResolvedValue({ status: "success", amount: 50000 });

      prisma.topUpOrder.findFirst.mockResolvedValue({
        id: "order-m1",
        publicId: "TOP-IDR-2606-000002",
        provider: "mustika",
        externalId: "QR-TEST-1",
        status: "PENDING",
        amountRupiah: 50000,
        finalAmount: null,
        metadata: { qrUrl: "q", paymentLink: "p", expiresAt: new Date(Date.now() + 600000).toISOString() },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // creditTopUpOrder reads order again + credits
      prisma.topUpOrder.findUnique.mockResolvedValue({
        id: "order-m1", userId: mockUser.id, amountRupiah: 50000, status: "PENDING", metadata: {},
      });
      prisma.topUpOrder.update.mockResolvedValue({});
      prisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.update.mockResolvedValue({ walletBalance: 150000 });
      prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TXN-TOP-2606", nextNumber: 2 });
      prisma.walletTransaction.create.mockResolvedValue({ id: "wt-1" });
      prisma.activityLog.create.mockResolvedValue({ id: "al-1" });

      const app = buildApp();
      const res = await request(app).get("/topup/status/order-m1");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.paid).toBe(true);
      expect(checkMustikaStatus).toHaveBeenCalledWith("QR-TEST-1");
    });

    it("auto-cancels a mustika order older than 20 minutes without crediting", async () => {
      const { checkMustikaStatus } = await import("../../src/services/mustikaService.js");
      // Cancel now requires a provider check first; provider reports still-unpaid.
      checkMustikaStatus.mockResolvedValue({ status: "pending" });

      prisma.topUpOrder.findFirst.mockResolvedValue({
        id: "order-old",
        publicId: "TOP-IDR-2606-000003",
        provider: "mustika",
        externalId: "QR-OLD",
        status: "PENDING",
        amountRupiah: 50000,
        finalAmount: null,
        metadata: {},
        createdAt: new Date(Date.now() - 21 * 60 * 1000),
        updatedAt: new Date(Date.now() - 21 * 60 * 1000),
      });
      prisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });

      const app = buildApp();
      const res = await request(app).get("/topup/status/order-old");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELED");
      expect(prisma.topUpOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "PENDING" }),
          data: expect.objectContaining({ status: "CANCELED" }),
        })
      );
    });

    it("credits an OLD pending mustika order (>20 min) when the provider reports success", async () => {
      // Lost-payment regression guard: a late payment must be credited, not silently canceled.
      const { checkMustikaStatus } = await import("../../src/services/mustikaService.js");
      checkMustikaStatus.mockResolvedValue({ status: "success", amount: 50000 });

      prisma.topUpOrder.findFirst.mockResolvedValue({
        id: "order-late",
        publicId: "TOP-IDR-2606-000010",
        provider: "mustika",
        externalId: "QR-LATE",
        status: "PENDING",
        amountRupiah: 50000,
        finalAmount: null,
        metadata: {},
        createdAt: new Date(Date.now() - 21 * 60 * 1000),
        updatedAt: new Date(Date.now() - 21 * 60 * 1000),
      });
      prisma.topUpOrder.findUnique.mockResolvedValue({
        id: "order-late", userId: mockUser.id, amountRupiah: 50000, status: "PENDING", metadata: {},
      });
      prisma.topUpOrder.update.mockResolvedValue({});
      prisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.update.mockResolvedValue({ walletBalance: 150000 });
      prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TXN-TOP-2606", nextNumber: 2 });
      prisma.walletTransaction.create.mockResolvedValue({ id: "wt-1" });
      prisma.activityLog.create.mockResolvedValue({ id: "al-1" });

      const app = buildApp();
      const res = await request(app).get("/topup/status/order-late");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.paid).toBe(true);
      expect(checkMustikaStatus).toHaveBeenCalledWith("QR-LATE");
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    it("leaves a mustika order PENDING and does not credit when reported amount mismatches", async () => {
      const { checkMustikaStatus } = await import("../../src/services/mustikaService.js");
      checkMustikaStatus.mockResolvedValue({ status: "success", amount: 99999 });

      prisma.topUpOrder.findFirst.mockResolvedValue({
        id: "order-mismatch",
        publicId: "TOP-IDR-2606-000009",
        provider: "mustika",
        externalId: "QR-MISMATCH",
        status: "PENDING",
        amountRupiah: 50000,
        finalAmount: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // creditTopUpOrder re-reads the order, then throws on the amount mismatch.
      prisma.topUpOrder.findUnique.mockResolvedValue({
        id: "order-mismatch", userId: mockUser.id, amountRupiah: 50000, status: "PENDING", metadata: {},
      });
      prisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });

      const app = buildApp();
      const res = await request(app).get("/topup/status/order-mismatch");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("PENDING");
      expect(res.body.paid).toBe(false);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("returns enriched QRIS fields for a pending order", async () => {
      const { checkMustikaStatus } = await import("../../src/services/mustikaService.js");
      checkMustikaStatus.mockResolvedValue({ status: "pending" });
      prisma.topUpOrder.findFirst.mockResolvedValue({
        id: "order-m2",
        publicId: "TOP-IDR-2606-000004",
        provider: "mustika",
        externalId: "QR-TEST-2",
        status: "PENDING",
        amountRupiah: 50000,
        finalAmount: null,
        metadata: { qrUrl: "https://q", paymentLink: "https://p", expiresAt: new Date(Date.now() + 600000).toISOString() },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const app = buildApp();
      const res = await request(app).get("/topup/status/order-m2");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("PENDING");
      expect(res.body.qrisImageUrl).toBe("https://q");
      expect(res.body.paymentUrl).toBe("https://p");
      expect(res.body.expiresAt).toBeTruthy();
    });
  });
});
