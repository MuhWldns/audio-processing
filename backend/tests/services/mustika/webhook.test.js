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

import { extractWebhookRefNo, shouldProcessWebhook, processMustikaWebhook } from "../../../src/services/mustika/webhook.js";
import { checkQrisStatus } from "../../../src/services/mustika/client.js";
import { creditVerifiedTopUp } from "../../../src/services/mustika/credit.js";

const order = {
  id: "order-1",
  userId: "user-1",
  provider: "mustika",
  externalId: "QR123",
  amountRupiah: 22500,
  status: "PENDING",
};

const webhookPayload = {
  status: "success",
  service: "QRIS",
  amount: 22500,
  reference: "QR123",
  order_id: null,
  timestamp: "2026-04-20 14:36:26",
  data: {
    amount: 22500,
    net_amount: 22342,
    issuer: "DANA",
    payor: "00***********",
    provider_ref: "QRA177667053434072901481024",
    ref_no: "QR123",
    rrn: "1nqcobu22660",
    settle_at: "2026-04-21 13:00:00",
    status: "SUCCESS",
    type: "QRIS",
    username: "Nauval",
  },
};

describe("MustikaPay webhook processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts ref_no from top-level reference first", () => {
    expect(extractWebhookRefNo(webhookPayload)).toBe("QR123");
  });

  it("falls back to nested data.ref_no", () => {
    expect(extractWebhookRefNo({ ...webhookPayload, reference: undefined })).toBe("QR123");
  });

  it("returns null when ref_no is unavailable", () => {
    expect(extractWebhookRefNo({ status: "success", service: "QRIS", data: {} })).toBe(null);
  });

  it("only processes success QRIS webhooks", () => {
    expect(shouldProcessWebhook(webhookPayload)).toBe(true);
    expect(shouldProcessWebhook({ ...webhookPayload, status: "failed" })).toBe(false);
    expect(shouldProcessWebhook({ ...webhookPayload, service: "VA" })).toBe(false);
  });

  it("verifies webhook with check-status and credits when ref_no and amount match", async () => {
    mockPrisma.topUpOrder.findUnique.mockResolvedValue(order);
    checkQrisStatus.mockResolvedValue({
      refNo: "QR123",
      status: "success",
      amount: 22500,
      netAmount: 22342,
      issuer: "DANA",
      payor: "00***********",
      settleAt: "2026-04-21 13:00:00",
      timestamp: "2026-04-20 14:35:34",
      receiptUrl: "https://mustikapayment.com/nota/QR123.png",
      raw: { ref_no: "QR123", status: "success", amount: 22500 },
    });
    creditVerifiedTopUp.mockResolvedValue({ credited: true, userId: "user-1", amount: 22500, revivedAfterCancel: false });

    const result = await processMustikaWebhook(webhookPayload);

    expect(result).toEqual({ processed: true, credited: true });
    expect(mockPrisma.topUpOrder.findUnique).toHaveBeenCalledWith({ where: { externalId: "QR123" } });
    expect(checkQrisStatus).toHaveBeenCalledWith("QR123");
    expect(creditVerifiedTopUp).toHaveBeenCalledWith("order-1", {
      verifyAmount: 22500,
      finalAmount: 22500,
      checkedVia: "mustika-webhook",
      providerMeta: expect.objectContaining({
        ref_no: "QR123",
        net_amount: 22342,
        issuer: "DANA",
        payor: "00***********",
        settle_at: "2026-04-21 13:00:00",
        receipt_url: "https://mustikapayment.com/nota/QR123.png",
        webhookStatus: "success",
        webhookTimestamp: "2026-04-20 14:36:26",
      }),
    });
  });

  it("does not credit when order is not found", async () => {
    mockPrisma.topUpOrder.findUnique.mockResolvedValue(null);

    const result = await processMustikaWebhook(webhookPayload);

    expect(result).toEqual({ processed: false, reason: "order_not_found" });
    expect(checkQrisStatus).not.toHaveBeenCalled();
    expect(creditVerifiedTopUp).not.toHaveBeenCalled();
  });

  it("does not credit when check-status is not success", async () => {
    mockPrisma.topUpOrder.findUnique.mockResolvedValue(order);
    checkQrisStatus.mockResolvedValue({ refNo: "QR123", status: "pending", amount: 22500, raw: {} });

    const result = await processMustikaWebhook(webhookPayload);

    expect(result).toEqual({ processed: false, reason: "provider_status_pending" });
    expect(creditVerifiedTopUp).not.toHaveBeenCalled();
  });

  it("does not credit when check-status ref_no mismatches", async () => {
    mockPrisma.topUpOrder.findUnique.mockResolvedValue(order);
    checkQrisStatus.mockResolvedValue({ refNo: "QR999", status: "success", amount: 22500, raw: {} });

    const result = await processMustikaWebhook(webhookPayload);

    expect(result).toEqual({ processed: false, reason: "ref_no_mismatch" });
    expect(creditVerifiedTopUp).not.toHaveBeenCalled();
  });

  it("does not credit when amount mismatches", async () => {
    mockPrisma.topUpOrder.findUnique.mockResolvedValue(order);
    checkQrisStatus.mockResolvedValue({ refNo: "QR123", status: "success", amount: 22499, raw: {} });

    const result = await processMustikaWebhook(webhookPayload);

    expect(result).toEqual({ processed: false, reason: "amount_mismatch" });
    expect(creditVerifiedTopUp).not.toHaveBeenCalled();
  });
});