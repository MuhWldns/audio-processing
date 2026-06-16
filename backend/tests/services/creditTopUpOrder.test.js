// backend/tests/services/creditTopUpOrder.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  it("rejects when confirmed amount does not match order amount (requireAmountMatch)", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...baseOrder });
    await expect(creditTopUpOrder("order-1", { verifyAmount: 5000, requireAmountMatch: true }))
      .rejects.toThrow(/amount verification failed/i);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.topUpOrder.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed when requireAmountMatch and verifyAmount is undefined", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...baseOrder });
    await expect(creditTopUpOrder("order-1", { verifyAmount: undefined, requireAmountMatch: true }))
      .rejects.toThrow(/amount verification failed/i);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.topUpOrder.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed when requireAmountMatch and verifyAmount is NaN", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...baseOrder });
    await expect(creditTopUpOrder("order-1", { verifyAmount: NaN, requireAmountMatch: true }))
      .rejects.toThrow(/amount verification failed/i);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.topUpOrder.updateMany).not.toHaveBeenCalled();
  });

  it("credits once when requireAmountMatch and verifyAmount equals order amount", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...baseOrder });
    prisma.topUpOrder.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({ walletBalance: 110000 });
    prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TXN-TOP-2606", nextNumber: 2 });
    prisma.walletTransaction.create.mockResolvedValue({ id: "wt-1" });
    prisma.activityLog.create.mockResolvedValue({ id: "al-1" });

    const result = await creditTopUpOrder("order-1", { verifyAmount: 10000, requireAmountMatch: true, finalAmount: 10000 });
    expect(result.credited).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
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

describe("creditTopUpOrder — revival after cancel (late payment)", () => {
  let warnSpy;

  beforeEach(() => {
    Object.values(prisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((m) => { if (typeof m?.mockReset === "function") m.mockReset(); });
      }
    });
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    prisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  const canceledOrder = { ...baseOrder, status: "CANCELED" };

  it("revives a CANCELED order when provider confirms matching payment", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...canceledOrder });
    prisma.topUpOrder.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({ walletBalance: 110000 });
    prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TXN-TOP-2606", nextNumber: 2 });
    prisma.walletTransaction.create.mockResolvedValue({ id: "wt-1" });
    prisma.activityLog.create.mockResolvedValue({ id: "al-1" });

    const result = await creditTopUpOrder("order-1", {
      verifyAmount: 10000,
      requireAmountMatch: true,
      providerName: "mustikapay",
      finalAmount: 10000,
    });

    expect(result.credited).toBe(true);
    expect(result.revivedAfterCancel).toBe(true);
    expect(result.userId).toBe("user-1");
    expect(result.amount).toBe(10000);
    // wallet incremented exactly once
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ walletBalance: { increment: 10000 } }),
    }));
    // CAS allowed claiming a CANCELED order
    expect(prisma.topUpOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: { in: ["PENDING", "CANCELED"] } },
      data: { status: "COMPLETED" },
    });
    // ops alert fired
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/REVIVED canceled order/i);
    // activity log shows the late-payment title
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "TOP_UP",
        status: "SUCCESS",
        title: "Top up successful (late payment)",
      }),
    });
  });

  it("fails closed on a CANCELED order with a mismatched provider amount", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...canceledOrder });

    await expect(creditTopUpOrder("order-1", {
      verifyAmount: 5000,
      requireAmountMatch: true,
      providerName: "mustikapay",
    })).rejects.toThrow(/amount verification failed/i);

    // not credited, status not changed
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.topUpOrder.updateMany).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("stays idempotent: a COMPLETED order is not revived or double-credited", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...baseOrder, status: "COMPLETED" });

    const result = await creditTopUpOrder("order-1", {
      verifyAmount: 10000,
      requireAmountMatch: true,
      providerName: "mustikapay",
    });

    expect(result.credited).toBe(false);
    expect(result.alreadyProcessed).toBe(true);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.topUpOrder.updateMany).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("normal PENDING success reports revivedAfterCancel:false with the normal title and no warn", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...baseOrder });
    prisma.topUpOrder.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({ walletBalance: 110000 });
    prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TXN-TOP-2606", nextNumber: 2 });
    prisma.walletTransaction.create.mockResolvedValue({ id: "wt-1" });
    prisma.activityLog.create.mockResolvedValue({ id: "al-1" });

    const result = await creditTopUpOrder("order-1", { verifyAmount: 10000, finalAmount: 10000 });

    expect(result.credited).toBe(true);
    expect(result.revivedAfterCancel).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: "Top up successful" }),
    });
  });

  it("two concurrent calls on a CANCELED order credit exactly once", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...canceledOrder });
    prisma.topUpOrder.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({ walletBalance: 110000 });
    prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TXN-TOP-2606", nextNumber: 2 });
    prisma.walletTransaction.create.mockResolvedValue({ id: "wt-1" });
    prisma.activityLog.create.mockResolvedValue({ id: "al-1" });
    // first claim wins, second loses the CAS race
    prisma.topUpOrder.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const first = await creditTopUpOrder("order-1", { verifyAmount: 10000, requireAmountMatch: true });
    const second = await creditTopUpOrder("order-1", { verifyAmount: 10000, requireAmountMatch: true });

    const credited = [first, second].filter((r) => r.credited);
    const skipped = [first, second].filter((r) => !r.credited);
    expect(credited).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].alreadyProcessed).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledTimes(1); // wallet incremented once
  });

  it("returns notFound for a missing order on the revival path", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue(null);

    const result = await creditTopUpOrder("missing", { verifyAmount: 10000, requireAmountMatch: true });

    expect(result.credited).toBe(false);
    expect(result.notFound).toBe(true);
    expect(prisma.topUpOrder.updateMany).not.toHaveBeenCalled();
  });
});
