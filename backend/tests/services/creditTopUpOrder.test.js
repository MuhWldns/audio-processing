// backend/tests/services/creditTopUpOrder.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../src/prisma.js";
import { creditTopUpOrder } from "../../src/services/databaseService.js";

const baseOrder = {
  id: "order-1",
  publicId: "TOP-IDR-2606-000001",
  userId: "user-1",
  externalId: "QR123",
  amountRupiah: 10000,
  status: "PENDING",
  metadata: {},
};

describe("creditTopUpOrder", () => {
  beforeEach(() => {
    Object.values(prisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((m) => { if (typeof m?.mockReset === "function") m.mockReset(); });
      }
    });
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    // Reset clears the setup default; the atomic claim must succeed by default.
    prisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
  });

  it("credits wallet once for a pending order and is idempotent on second call", async () => {
    prisma.topUpOrder.findUnique
      .mockResolvedValueOnce({ ...baseOrder })
      .mockResolvedValueOnce({ ...baseOrder, status: "COMPLETED" });
    prisma.topUpOrder.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({ walletBalance: 110000 });
    prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TXN-TOP-2606", nextNumber: 2 });
    prisma.walletTransaction.create.mockResolvedValue({ id: "wt-1" });
    prisma.activityLog.create.mockResolvedValue({ id: "al-1" });

    const first = await creditTopUpOrder("order-1", { verifyAmount: 10000, finalAmount: 10000 });
    expect(first.credited).toBe(true);
    expect(first.userId).toBe("user-1");
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "TOP_UP", amount: 10000 }),
    });

    const second = await creditTopUpOrder("order-1", { verifyAmount: 10000, finalAmount: 10000 });
    expect(second.credited).toBe(false);
    expect(second.alreadyProcessed).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledTimes(1); // not credited again
  });

  it("does not credit when the atomic claim loses the race (count:0)", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...baseOrder });
    prisma.topUpOrder.updateMany.mockResolvedValue({ count: 0 });

    const result = await creditTopUpOrder("order-1", { verifyAmount: 10000, finalAmount: 10000 });
    expect(result.credited).toBe(false);
    expect(result.alreadyProcessed).toBe(true);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects when confirmed amount does not match order amount", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...baseOrder });
    await expect(creditTopUpOrder("order-1", { verifyAmount: 5000 }))
      .rejects.toThrow(/amount mismatch/i);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.topUpOrder.updateMany).not.toHaveBeenCalled();
  });

  it("returns credited:false when order not found", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue(null);
    const result = await creditTopUpOrder("missing", { verifyAmount: 10000 });
    expect(result.credited).toBe(false);
    expect(result.notFound).toBe(true);
  });

  it("records the gateway final amount without verifying (Bayar.gg surcharge)", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...baseOrder });
    prisma.topUpOrder.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({ walletBalance: 110000 });
    prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TXN-TOP-2606", nextNumber: 2 });
    prisma.walletTransaction.create.mockResolvedValue({ id: "wt-1" });
    prisma.activityLog.create.mockResolvedValue({ id: "al-1" });

    const result = await creditTopUpOrder("order-1", { finalAmount: 10200 });
    expect(result.credited).toBe(true);
    expect(result.amount).toBe(10000); // credits what was ordered

    const updateCall = prisma.topUpOrder.update.mock.calls.find(
      ([arg]) => arg?.data && Object.prototype.hasOwnProperty.call(arg.data, "finalAmount")
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall[0].data.finalAmount).toBe(10200);
  });
});
