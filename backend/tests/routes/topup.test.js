/**
 * Tests for Top-up routes — MustikaPay webhook-first
 * POST /topup/create, GET /topup/status/:reference, POST /topup/check/:reference, POST /webhooks/mustika
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestApp, mockUser } from "../helpers/testApp.js";

// ── Prisma mock ──
const createMockModel = () => ({
  findUnique: vi.fn().mockResolvedValue(null),
  findFirst: vi.fn().mockResolvedValue(null),
  findMany: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue({ id: "mock-id" }),
  update: vi.fn().mockResolvedValue({ id: "mock-id" }),
  updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  delete: vi.fn().mockResolvedValue({ id: "mock-id" }),
  deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  count: vi.fn().mockResolvedValue(0),
  upsert: vi.fn().mockResolvedValue({ id: "mock-id" }),
});

const mockPrisma = {
  user: createMockModel(),
  topUpOrder: createMockModel(),
  walletTransaction: createMockModel(),
  activityLog: createMockModel(),
  publicIdCounter: createMockModel(),
  $transaction: vi.fn(async (fn) => fn(mockPrisma)),
  $disconnect: vi.fn(),
};

vi.mock("../../src/prisma.js", () => ({ prisma: mockPrisma }));

// Mock mustika client — only override createQris
vi.mock("../../src/services/mustika/client.js", () => ({
  createQris: vi.fn(),
}));

// Mock mustika webhook processor
vi.mock("../../src/services/mustika/webhook.js", () => ({
  processMustikaWebhook: vi.fn(),
}));

// Mock mustika reconcile
vi.mock("../../src/services/mustika/reconcile.js", () => ({
  manualCheckTopUp: vi.fn(),
}));

import { handleCreateTopUp, handleGetTopUpStatus, handleManualCheckTopUp, handleMustikaWebhook } from "../../src/controllers/topupController.js";

function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    app.post("/topup/create", requireAuth, handleCreateTopUp);
    app.get("/topup/status/:reference", requireAuth, handleGetTopUpStatus);
    app.post("/topup/check/:reference", requireAuth, handleManualCheckTopUp);
    app.post("/webhooks/mustika", handleMustikaWebhook);
  }, { user });
}

describe("Top-up Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
    mockPrisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
  });

  // ── Auth gating ──

  it("POST /topup/create returns 401 if not authenticated", async () => {
    const app = buildApp(null);
    const res = await request(app).post("/topup/create").send({ amount: 50000 });
    expect(res.status).toBe(401);
  });

  it("GET /topup/status/:reference returns 401 if not authenticated", async () => {
    const app = buildApp(null);
    const res = await request(app).get("/topup/status/order-1");
    expect(res.status).toBe(401);
  });

  // ── Validation ──

  it("POST /topup/create returns 400 if amount is not integer", async () => {
    const app = buildApp();
    const res = await request(app).post("/topup/create").send({ amount: "abc" });
    expect(res.status).toBe(400);
  });

  it("POST /topup/create returns 400 if amount below minimum", async () => {
    const app = buildApp();
    const res = await request(app).post("/topup/create").send({ amount: 500 });
    expect(res.status).toBe(400);
  });

  it("POST /topup/create returns 400 if amount exceeds limit", async () => {
    const app = buildApp();
    const res = await request(app).post("/topup/create").send({ amount: 600000 });
    expect(res.status).toBe(400);
  });

  // ── Create top-up ──

  it("creates a MustikaPay QRIS order and stores ref_no as externalId", async () => {
    const { createQris } = await import("../../src/services/mustika/client.js");
    createQris.mockResolvedValue({
      refNo: "QR123",
      qrUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR123",
      paymentLink: "https://mustikapayment.com/pay/QR123",
      amount: 50000,
      raw: { status: "success", ref_no: "QR123" },
    });

    mockPrisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TOP-IDR-2606", nextNumber: 2 });
    mockPrisma.topUpOrder.create.mockResolvedValue({
      id: "order-1",
      publicId: "TOP-IDR-2606-000001",
      userId: mockUser.id,
      provider: "mustika",
      externalId: null,
      amountRupiah: 50000,
      status: "PENDING",
      metadata: null,
    });
    mockPrisma.topUpOrder.update.mockResolvedValue({
      id: "order-1",
      publicId: "TOP-IDR-2606-000001",
      externalId: "QR123",
      amountRupiah: 50000,
      status: "PENDING",
      metadata: {
        qrUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR123",
        paymentLink: "https://mustikapayment.com/pay/QR123",
        expiresAt: expect.any(String),
      },
    });

    const app = buildApp();
    const res = await request(app).post("/topup/create").send({ amount: 50000 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ok: true,
      orderId: "order-1",
      publicId: "TOP-IDR-2606-000001",
      invoiceId: "QR123",
      amount: 50000,
      paymentUrl: "https://mustikapayment.com/pay/QR123",
      qrisImageUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR123",
    });
    expect(mockPrisma.topUpOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: "mustika", externalId: null, status: "PENDING" }),
    });
    expect(mockPrisma.topUpOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({ externalId: "QR123" }),
    });
  });

  // ── Status endpoint (DB-only) ──

  it("GET /topup/status/:reference returns DB-only status for pending order", async () => {
    mockPrisma.topUpOrder.findFirst.mockResolvedValue({
      id: "order-1",
      publicId: "TOP-IDR-2606-000001",
      provider: "mustika",
      externalId: "QR123",
      status: "PENDING",
      amountRupiah: 50000,
      finalAmount: null,
      metadata: {
        qrUrl: "https://qr",
        paymentLink: "https://pay",
        expiresAt: "2026-06-19T13:20:00.000Z",
      },
      createdAt: new Date("2026-06-19T13:00:00.000Z"),
      updatedAt: new Date("2026-06-19T13:00:00.000Z"),
    });

    const app = buildApp();
    const res = await request(app).get("/topup/status/QR123");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      publicId: "TOP-IDR-2606-000001",
      paid: false,
      status: "PENDING",
      amount: 50000,
      qrisImageUrl: "https://qr",
      paymentUrl: "https://pay",
    });
  });

  it("GET /topup/status/:reference returns 404 for unknown order", async () => {
    mockPrisma.topUpOrder.findFirst.mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app).get("/topup/status/non-existent");

    expect(res.status).toBe(404);
  });

  // ── Webhook endpoint ──

  it("POST /webhooks/mustika responds received immediately", async () => {
    const { processMustikaWebhook } = await import("../../src/services/mustika/webhook.js");
    processMustikaWebhook.mockResolvedValue({ processed: true, credited: true });
    const app = buildApp();

    const res = await request(app).post("/webhooks/mustika").send({ status: "success", service: "QRIS", reference: "QR123" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "received" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(processMustikaWebhook).toHaveBeenCalledWith({ status: "success", service: "QRIS", reference: "QR123" });
  });

  it("does not expose the old Bayar.gg webhook route", async () => {
    const app = buildApp();
    const res = await request(app).post("/webhooks/bayar").send({});
    expect(res.status).toBe(404);
  });

  // ── Manual check endpoint ──

  it("POST /topup/check/:reference maps service result to HTTP response", async () => {
    const { manualCheckTopUp } = await import("../../src/services/mustika/reconcile.js");
    manualCheckTopUp.mockResolvedValue({ ok: true, status: "COMPLETED", paid: true });

    const app = buildApp();
    const res = await request(app).post("/topup/check/QR123").send();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, status: "COMPLETED", paid: true });
    expect(manualCheckTopUp).toHaveBeenCalledWith({ userId: mockUser.id, reference: "QR123" });
  });
});