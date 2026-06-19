import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createQris, checkQrisStatus, getMustikaConfig, MustikaHttpError } from "../../../src/services/mustika/client.js";

describe("MustikaPay client", () => {
  beforeEach(() => {
    process.env.MUSTIKAPAY_API_KEY = "MP-test-key";
    process.env.MUSTIKAPAY_BASE_URL = "https://mustikapayment.com/";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MUSTIKAPAY_API_KEY;
    delete process.env.MUSTIKAPAY_BASE_URL;
  });

  it("reads API key and normalizes base URL", () => {
    expect(getMustikaConfig()).toEqual({
      apiKey: "MP-test-key",
      baseUrl: "https://mustikapayment.com",
    });
  });

  it("createQris posts form-urlencoded data and maps ref_no response", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        ref_no: "QR123",
        qr_url: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR123",
        payment_link: "https://mustikapayment.com/pay/QR123",
        amount: 10000,
      }),
    });

    const result = await createQris({
      amount: 10000,
      productName: "Top up Rp 10.000",
      customerName: "Budi",
      expiry: 20,
      redirectUrl: "https://audio.muhwldns.me/topup",
    });

    expect(result).toMatchObject({
      refNo: "QR123",
      qrUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR123",
      paymentLink: "https://mustikapayment.com/pay/QR123",
      amount: 10000,
    });
    expect(result.raw.ref_no).toBe("QR123");

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mustikapayment.com/api/v1/create/qris");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Api-Key": "MP-test-key",
    });

    const body = new URLSearchParams(opts.body);
    expect(body.get("amount")).toBe("10000");
    expect(body.get("product_name")).toBe("Top up Rp 10.000");
    expect(body.get("customer_name")).toBe("Budi");
    expect(body.get("expiry")).toBe("20");
    expect(body.get("redirect_url")).toBe("https://audio.muhwldns.me/topup");
    expect(body.has("order_id")).toBe(false);
  });

  it("createQris rejects success responses without ref_no", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", qr_url: "https://qr", payment_link: "https://pay", amount: 10000 }),
    });

    await expect(createQris({ amount: 10000 })).rejects.toThrow("MustikaPay create-qris missing ref_no");
  });

  it("checkQrisStatus maps success response fields", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ref_no: "QR123",
        status: "success",
        type: "QRIS",
        amount: 10000,
        net_amount: 9930,
        issuer: "GOPAY",
        payor: "Budi Santoso",
        settle_at: "2026-04-21 13:00:00",
        timestamp: "2026-04-20 14:35:34",
        receipt_url: "https://mustikapayment.com/nota/QR123.png",
      }),
    });

    const result = await checkQrisStatus("QR123");

    expect(result).toMatchObject({
      refNo: "QR123",
      status: "success",
      amount: 10000,
      netAmount: 9930,
      issuer: "GOPAY",
      payor: "Budi Santoso",
      settleAt: "2026-04-21 13:00:00",
      timestamp: "2026-04-20 14:35:34",
      receiptUrl: "https://mustikapayment.com/nota/QR123.png",
    });
    expect(result.raw.ref_no).toBe("QR123");
    expect(fetchMock.mock.calls[0][0]).toBe("https://mustikapayment.com/api/v1/check/qris?ref_no=QR123");
  });

  it("throws structured MustikaHttpError on non-2xx response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '{"status":"error","message":"Akses Ditolak"}',
    });

    await expect(checkQrisStatus("QR123")).rejects.toMatchObject({
      name: "MustikaHttpError",
      action: "check-qris",
      statusCode: 403,
      body: '{"status":"error","message":"Akses Ditolak"}',
    });
  });

  it("throws when API key is missing", async () => {
    delete process.env.MUSTIKAPAY_API_KEY;
    await expect(checkQrisStatus("QR123")).rejects.toThrow("MustikaPay API key not configured");
  });
});