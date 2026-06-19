import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Prisma mock ──
const createMockModel = () => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
});

const mockPrisma = {
  topUpOrder: createMockModel(),
  user: createMockModel(),
  walletTransaction: createMockModel(),
  activityLog: createMockModel(),
  publicIdCounter: { upsert: vi.fn() },
  $transaction: vi.fn(async (callback) => callback(mockPrisma)),
  $disconnect: vi.fn(),
};

vi.mock("../../../src/prisma.js", () => ({ prisma: mockPrisma }));

// Mock client and credit modules
vi.mock("../../../src/services/mustika/client.js", () => ({
  checkQrisStatus: vi.fn(),
}));

vi.mock("../../../src/services/mustika/credit.js", () => ({
  creditVerifiedTopUp: vi.fn(),
}));

import { manualCheckTopUp, cancelExpiredOrders, resetManualCheckCooldowns } from "../../../src/services/mustika/reconcile.js";
import { checkQrisStatus } from "../../../src/services/mustika/client.js";
import { creditVerifiedTopUp } from "../../../src/services/mustika/credit.js";

const pendingOrder = {
  id: "order-1",
  publicId: "TOP-IDR-2606-000001",
  userId: "user-1",
  provider: "mustika",
  externalId: "QR123",
  amountRupiah: 50000,
  finalAmount: null,
  status: "PENDING",
  metadata: { qrUrl: "https://qr", paymentLink: "https://pay" },
  createdAt: new Date("2026-06-19T13:00:00.000Z"),
  updatedAt: new Date("2026-06-19T13:00:00.000Z"),
};

describe("Mustika reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetManualCheckCooldowns();
  });

  it("returns 404 when manual check order is not found or not owned by user", async () => {
    mockPrisma.topUpOrder.findFirst.mockResolvedValue(null);

    const result = await manualCheckTopUp({ userId: "user-1", reference: "QR404", now: 1000 });

    expect(result).toEqual({ ok: false, statusCode: 404, error: "Order not found" });
    expect(checkQrisStatus).not.toHaveBeenCalled();
  });

  it("does not call provider for completed orders", async () => {
    mockPrisma.topUpOrder.findFirst.mockResolvedValue({ ...pendingOrder, status: "COMPLETED", finalAmount: 50000 });

    const result = await manualCheckTopUp({ userId: "user-1", reference: "QR123", now: 1000 });

    expect(result).toMatchObject({ ok: true, status: "COMPLETED", paid: true });
    expect(checkQrisStatus).not.toHaveBeenCalled();
  });

  it("checks provider, credits on verified success, and starts cooldown", async () => {
    mockPrisma.topUpOrder.findFirst.mockResolvedValue(pendingOrder);
    checkQrisStatus.mockResolvedValue({
      refNo: "QR123",
      status: "success",
      amount: 50000,
      netAmount: 49650,
      issuer: "GOPAY",
      payor: "Budi",
      settleAt: "2026-06-19 13:02:00",
      receiptUrl: "https://mustikapayment.com/nota/QR123.png",
      raw: { ref_no: "QR123", status: "success", amount: 50000 },
    });
    creditVerifiedTopUp.mockResolvedValue({ credited: true, userId: "user-1", amount: 50000 });

    const first = await manualCheckTopUp({ userId: "user-1", reference: "QR123", now: 1000 });
    const second = await manualCheckTopUp({ userId: "user-1", reference: "QR123", now: 2000 });

    expect(first).toMatchObject({ ok: true, status: "COMPLETED", paid: true });
    expect(second).toMatchObject({ ok: true, status: "PENDING", paid: false, cooldownRemainingMs: 29000 });
    expect(checkQrisStatus).toHaveBeenCalledTimes(1);
    expect(creditVerifiedTopUp).toHaveBeenCalledWith("order-1", {
      verifyAmount: 50000,
      finalAmount: 50000,
      checkedVia: "manual-check",
      providerMeta: expect.objectContaining({ ref_no: "QR123", issuer: "GOPAY" }),
    });
  });

  it("cancels pending order when provider returns expired", async () => {
    mockPrisma.topUpOrder.findFirst.mockResolvedValue(pendingOrder);
    mockPrisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
    checkQrisStatus.mockResolvedValue({ refNo: "QR123", status: "expired", amount: undefined, raw: { status: "expired" } });

    const result = await manualCheckTopUp({ userId: "user-1", reference: "QR123", now: 1000 });

    expect(result).toMatchObject({ ok: true, status: "CANCELED", paid: false });
    expect(mockPrisma.topUpOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "PENDING" },
      data: { status: "CANCELED", metadata: expect.objectContaining({ checkedVia: "manual-check", providerStatus: "expired" }) },
    });
    expect(creditVerifiedTopUp).not.toHaveBeenCalled();
  });

  it("does not credit on amount mismatch", async () => {
    mockPrisma.topUpOrder.findFirst.mockResolvedValue(pendingOrder);
    checkQrisStatus.mockResolvedValue({ refNo: "QR123", status: "success", amount: 49999, raw: {} });

    const result = await manualCheckTopUp({ userId: "user-1", reference: "QR123", now: 1000 });

    expect(result).toEqual({ ok: false, statusCode: 409, error: "Payment verification mismatch" });
    expect(creditVerifiedTopUp).not.toHaveBeenCalled();
  });

  it("auto-cancels pending Mustika orders older than 25 minutes", async () => {
    mockPrisma.topUpOrder.updateMany.mockResolvedValue({ count: 3 });

    const result = await cancelExpiredOrders(new Date("2026-06-19T13:30:00.000Z"));

    expect(result).toEqual({ canceled: 3 });
    expect(mockPrisma.topUpOrder.updateMany).toHaveBeenCalledWith({
      where: {
        provider: "mustika",
        status: "PENDING",
        createdAt: { lt: new Date("2026-06-19T13:05:00.000Z") },
      },
      data: { status: "CANCELED" },
    });
  });
});