// backend/tests/services/topupPoller.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../src/prisma.js";

vi.mock("../../src/services/mustikaService.js", () => ({
  checkMustikaStatus: vi.fn(),
}));

import { pollPendingMustikaOrders } from "../../src/services/topupPoller.js";
import { checkMustikaStatus } from "../../src/services/mustikaService.js";
import * as dbService from "../../src/services/databaseService.js";

describe("pollPendingMustikaOrders", () => {
  beforeEach(() => {
    process.env.MUSTIKAPAY_API_KEY = "MP-test";
    Object.values(prisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((m) => { if (typeof m?.mockReset === "function") m.mockReset(); });
      }
    });
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    checkMustikaStatus.mockReset();
  });

  it("makes no provider calls when there are no pending mustika orders", async () => {
    prisma.topUpOrder.count.mockResolvedValue(0);
    const result = await pollPendingMustikaOrders();
    expect(result.checked).toBe(0);
    expect(prisma.topUpOrder.findMany).not.toHaveBeenCalled();
    expect(checkMustikaStatus).not.toHaveBeenCalled();
  });

  it("skips entirely when MUSTIKAPAY_API_KEY is missing", async () => {
    delete process.env.MUSTIKAPAY_API_KEY;
    const result = await pollPendingMustikaOrders();
    expect(result.skipped).toBe(true);
    expect(prisma.topUpOrder.count).not.toHaveBeenCalled();
  });

  it("credits a pending order whose check returns success", async () => {
    prisma.topUpOrder.count.mockResolvedValue(1);
    prisma.topUpOrder.findMany.mockResolvedValue([
      { id: "o1", externalId: "QR1", amountRupiah: 10000, createdAt: new Date(), metadata: {} },
    ]);
    checkMustikaStatus.mockResolvedValue({ status: "success", amount: 10000 });
    const creditSpy = vi.spyOn(dbService, "creditTopUpOrder").mockResolvedValue({ credited: true, userId: "u1", amount: 10000 });

    const result = await pollPendingMustikaOrders();

    expect(checkMustikaStatus).toHaveBeenCalledWith("QR1");
    expect(creditSpy).toHaveBeenCalledWith("o1", expect.objectContaining({ verifyAmount: 10000, finalAmount: 10000 }));
    expect(result.checked).toBe(1);
    creditSpy.mockRestore();
  });

  it("auto-cancels a pending order older than 20 minutes when not yet paid", async () => {
    prisma.topUpOrder.count.mockResolvedValue(1);
    prisma.topUpOrder.findMany.mockResolvedValue([
      { id: "old", externalId: "QR-OLD", amountRupiah: 10000, createdAt: new Date(Date.now() - 21 * 60 * 1000), metadata: {} },
    ]);
    checkMustikaStatus.mockResolvedValue({ status: "pending" });
    prisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });

    await pollPendingMustikaOrders();

    expect(prisma.topUpOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "old", status: "PENDING" }, data: expect.objectContaining({ status: "CANCELED" }) })
    );
  });

  it("continues the batch when one order's check throws", async () => {
    prisma.topUpOrder.count.mockResolvedValue(2);
    prisma.topUpOrder.findMany.mockResolvedValue([
      { id: "bad", externalId: "QR-BAD", amountRupiah: 10000, createdAt: new Date(), metadata: {} },
      { id: "good", externalId: "QR-GOOD", amountRupiah: 10000, createdAt: new Date(), metadata: {} },
    ]);
    checkMustikaStatus
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ status: "pending" });

    const result = await pollPendingMustikaOrders();
    expect(result.checked).toBe(2);
    expect(checkMustikaStatus).toHaveBeenCalledTimes(2);
  });
});
