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
  metadata: { qrUrl: "https://qr" },
};

describe("creditVerifiedTopUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma));
    mockPrisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TXN-TOP-2606", nextNumber: 2 });
  });

  it("credits a pending order exactly once with ledger and activity rows", async () => {
    mockPrisma.topUpOrder.findUnique.mockResolvedValue(pendingOrder);
    mockPrisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.update.mockResolvedValue({ walletBalance: 150000 });
    mockPrisma.walletTransaction.create.mockResolvedValue({ id: "txn-1" });
    mockPrisma.activityLog.create.mockResolvedValue({ id: "log-1" });
    mockPrisma.topUpOrder.update.mockResolvedValue({ ...pendingOrder, status: "COMPLETED", finalAmount: 50000 });

    const result = await creditVerifiedTopUp("order-1", {
      verifyAmount: 50000,
      finalAmount: 50000,
      checkedVia: "mustika-webhook",
      providerMeta: { ref_no: "QR123", issuer: "GOPAY" },
    });

    expect(result).toEqual({ credited: true, userId: "user-1", amount: 50000, revivedAfterCancel: false });
    expect(mockPrisma.topUpOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: { in: ["PENDING", "CANCELED"] } },
      data: { status: "COMPLETED" },
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { walletBalance: { increment: 50000 }, totalTopUp: { increment: 50000 } },
      select: { walletBalance: true },
    });
    expect(mockPrisma.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicId: expect.stringMatching(/^TXN-TOP-\d{4}-000001$/),
        userId: "user-1",
        type: "TOP_UP",
        amount: 50000,
        balanceAfter: 150000,
        referenceType: "TOP_UP_ORDER",
        referenceId: "order-1",
        metadata: expect.objectContaining({ ref_no: "QR123", checkedVia: "mustika-webhook" }),
      }),
    });
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "TOP_UP",
        status: "SUCCESS",
        title: "Top up successful",
        amountRupiah: 50000,
      }),
    });
    expect(mockPrisma.topUpOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({
        finalAmount: 50000,
        metadata: expect.objectContaining({ qrUrl: "https://qr", ref_no: "QR123", checkedVia: "mustika-webhook" }),
      }),
    });
  });

  it("does not double-credit an already completed order", async () => {
    mockPrisma.topUpOrder.findUnique.mockResolvedValue({ ...pendingOrder, status: "COMPLETED" });

    const result = await creditVerifiedTopUp("order-1", {
      verifyAmount: 50000,
      checkedVia: "mustika-webhook",
      providerMeta: { ref_no: "QR123" },
    });

    expect(result).toEqual({ credited: false, alreadyProcessed: true, userId: "user-1" });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("fails closed on amount mismatch before claiming", async () => {
    mockPrisma.topUpOrder.findUnique.mockResolvedValue(pendingOrder);

    await expect(creditVerifiedTopUp("order-1", {
      verifyAmount: 49999,
      checkedVia: "mustika-webhook",
      providerMeta: { ref_no: "QR123" },
    })).rejects.toThrow("Top-up amount verification failed: provider 49999 != order 50000");

    expect(mockPrisma.topUpOrder.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("revives a locally canceled order when provider verifies payment", async () => {
    mockPrisma.topUpOrder.findUnique.mockResolvedValue({ ...pendingOrder, status: "CANCELED" });
    mockPrisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.update.mockResolvedValue({ walletBalance: 150000 });
    mockPrisma.walletTransaction.create.mockResolvedValue({ id: "txn-1" });
    mockPrisma.activityLog.create.mockResolvedValue({ id: "log-1" });
    mockPrisma.topUpOrder.update.mockResolvedValue({ ...pendingOrder, status: "COMPLETED" });

    const result = await creditVerifiedTopUp("order-1", {
      verifyAmount: 50000,
      checkedVia: "manual-check",
      providerMeta: { ref_no: "QR123" },
    });

    expect(result.revivedAfterCancel).toBe(true);
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: "Top up successful (late payment)" }),
    });
  });

  it("does not credit when another concurrent processor already claimed the order", async () => {
    mockPrisma.topUpOrder.findUnique.mockResolvedValue(pendingOrder);
    mockPrisma.topUpOrder.updateMany.mockResolvedValue({ count: 0 });

    const result = await creditVerifiedTopUp("order-1", {
      verifyAmount: 50000,
      checkedVia: "mustika-webhook",
      providerMeta: { ref_no: "QR123" },
    });

    expect(result).toEqual({ credited: false, alreadyProcessed: true, userId: "user-1" });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("returns notFound when order does not exist", async () => {
    mockPrisma.topUpOrder.findUnique.mockResolvedValue(null);

    const result = await creditVerifiedTopUp("missing", {
      verifyAmount: 50000,
      checkedVia: "mustika-webhook",
      providerMeta: { ref_no: "QR123" },
    });

    expect(result).toEqual({ credited: false, notFound: true });
  });
});