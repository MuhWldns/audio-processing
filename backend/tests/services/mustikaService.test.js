import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createMustikaQris, checkMustikaStatus, getMustikaConfig } from "../../src/services/mustikaService.js";

describe("mustikaService", () => {
  beforeEach(() => {
    process.env.MUSTIKAPAY_API_KEY = "MP-test-key";
    process.env.MUSTIKAPAY_BASE_URL = "https://mustikapayment.com";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getMustikaConfig", () => {
    it("reads api key and defaults base url", () => {
      delete process.env.MUSTIKAPAY_BASE_URL;
      const cfg = getMustikaConfig();
      expect(cfg.apiKey).toBe("MP-test-key");
      expect(cfg.baseUrl).toBe("https://mustikapayment.com");
    });
    it("trims trailing slash from base url", () => {
      process.env.MUSTIKAPAY_BASE_URL = "https://mustikapayment.com/";
      expect(getMustikaConfig().baseUrl).toBe("https://mustikapayment.com");
    });
  });

  describe("createMustikaQris", () => {
    it("posts form-urlencoded with X-Api-Key and maps the response", async () => {
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

      const result = await createMustikaQris({
        amount: 10000,
        productName: "Top up",
        customerName: "Budi",
        expiry: 20,
        redirectUrl: "https://site/topup?order=o1",
      });

      expect(result).toEqual({
        refNo: "QR123",
        qrUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR123",
        paymentLink: "https://mustikapayment.com/pay/QR123",
        amount: 10000,
      });

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("https://mustikapayment.com/api/v1/create/qris");
      expect(opts.method).toBe("POST");
      expect(opts.headers["X-Api-Key"]).toBe("MP-test-key");
      expect(opts.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      const body = new URLSearchParams(opts.body);
      expect(body.get("amount")).toBe("10000");
      expect(body.get("product_name")).toBe("Top up");
      expect(body.get("expiry")).toBe("20");
      expect(body.get("redirect_url")).toBe("https://site/topup?order=o1");
    });

    it("throws when api key is missing", async () => {
      delete process.env.MUSTIKAPAY_API_KEY;
      await expect(createMustikaQris({ amount: 10000 })).rejects.toThrow("MustikaPay API key not configured");
    });

    it("throws on non-ok HTTP response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 400, text: async () => "bad" });
      await expect(createMustikaQris({ amount: 10000 })).rejects.toThrow(/MustikaPay create-qris failed: 400/);
    });

    it("throws when status is not success", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ status: "error" }) });
      await expect(createMustikaQris({ amount: 10000 })).rejects.toThrow(/status=success/);
    });
  });
});
