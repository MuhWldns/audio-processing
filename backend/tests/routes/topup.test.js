/**
 * Tests for Top-up routes — MustikaPay webhook-first
 * POST /topup/create, GET /topup/status/:reference
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestApp, mockUser } from "../helpers/testApp.js";

// ── Prisma mock (must be before controller import) ──
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

import { handleCreateTopUp, handleGetTopUpStatus } from "../../src/controllers/topupController.js";

function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    app.post("/topup/create", requireAuth, handleCreateTopUp);
    app.get("/topup/status/:reference", requireAuth, handleGetTopUpStatus);
  }, { user });
}

describe("Top-up route surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
    mockPrisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
  });

  it("does not expose the old Bayar.gg webhook route", async () => {
    const app = buildApp();
    const res = await request(app).post("/webhooks/bayar").send({});
    expect(res.status).toBe(404);
  });

  it("GET /topup/status/:reference returns stored DB status without provider calls", async () => {
    mockPrisma.topUpOrder.findFirst.mockResolvedValue({
      id: "order-1",
      publicId: "TOP-IDR-2606-000001",
      provider: "mustika",
      externalId: "QR123",
      status: "PENDING",
      amountRupiah: 50000,
      finalAmount: null,
      metadata: {
        qrUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR123",
        paymentLink: "https://mustikapayment.com/pay/QR123",
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
      finalAmount: null,
      qrisImageUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR123",
      paymentUrl: "https://mustikapayment.com/pay/QR123",
      expiresAt: "2026-06-19T13:20:00.000Z",
    });
    expect(mockPrisma.topUpOrder.findFirst).toHaveBeenCalledWith({
      where: {
        userId: mockUser.id,
        OR: [{ id: "QR123" }, { externalId: "QR123" }],
      },
      select: expect.any(Object),
    });
  });
});