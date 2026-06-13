# MustikaPay Provider Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MustikaPay as a polling-based QRIS top-up provider alongside the existing Bayar.gg webhook provider, fix the `unhandledRejection` crash, persist pending QRIS across app reloads, and sync `openapi.yaml` + docs to current reality.

**Architecture:** A new `mustikaService.js` mirrors `bayarService.js` (create + check). Wallet-credit logic is extracted from the Bayar.gg webhook into a shared `creditTopUpOrder()` so three triggers reuse it: Bayar.gg webhook, MustikaPay background poller, and the enriched status endpoint. Provider is chosen by `TOPUP_PROVIDER` env. MustikaPay never trusts inbound notifications (its webhook is unsigned) — confirmation is always via `GET /api/v1/check/qris`. A 20-minute auto-cancel is enforced via `expiry=20` on create plus local `CANCELED` marking. The status endpoint returns QRIS render fields so the browser can restore a pending order from a localStorage `orderId`.

**Tech Stack:** Node (ESM) + Express 4, Prisma (MySQL), Bun runtime, Vitest + Supertest, Next.js (frontend), PM2 (single instance).

**Spec:** `docs/superpowers/specs/2026-06-13-mustikapay-migration-design.md`

---

## File Structure

**Backend**
- `backend/src/services/mustikaService.js` — **new**: `getMustikaConfig`, `createMustikaQris`, `checkMustikaStatus`
- `backend/src/services/databaseService.js` — **add** `creditTopUpOrder(tx-aware)` shared credit logic
- `backend/src/services/topupPoller.js` — **new**: 3-min interval, skips when no pending orders, 20-min auto-cancel
- `backend/src/controllers/topupController.js` — provider switch in create; enriched + active-confirm status; webhook delegates to shared credit fn
- `backend/src/middlewares/asyncHandler.js` — **new**: wraps async handlers so rejections reach error middleware
- `backend/src/middlewares/index.js` — export `asyncHandler`
- `backend/src/services/index.js` — export new services
- `backend/src/server.js` — apply `asyncHandler` to async top-up routes; start poller
- `backend/.env.example` — new env vars
- `backend/openapi.yaml` — sync: 11 missing endpoints + MustikaPay/polling/CANCELED updates

**Frontend**
- `frontend/lib/api/topup.ts` — extend `TopUpStatusResponse` with optional QRIS fields
- `frontend/app/topup/page.tsx` — "Saya sudah bayar" button + localStorage persist/restore

**Docs**
- `docs/dokumentasi-teknis.md`, `backend/README.md`, `backend/API_ROUTES.md` — both-providers + polling

---

### Task 1: `mustikaService.js` — config + createMustikaQris

**Files:**
- Create: `backend/src/services/mustikaService.js`
- Test: `backend/tests/services/mustikaService.test.js`

MustikaPay create uses **form-urlencoded** (not JSON), header `X-Api-Key`, endpoint `POST /api/v1/create/qris`. Success response: `{ status:"success", ref_no, qr_url, payment_link, amount }`.

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/services/mustikaService.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun run test -- mustikaService`
Expected: FAIL — module `mustikaService.js` does not exist.

- [ ] **Step 3: Write minimal implementation (config + create)**

```js
// backend/src/services/mustikaService.js
const DEFAULT_BASE_URL = "https://mustikapayment.com";

const getEnvValue = (value) => (value ? value.trim() : "");
const normalizeBaseUrl = (value) => value.replace(/\/+$/, "");

export const getMustikaConfig = () => {
  const apiKey = getEnvValue(process.env.MUSTIKAPAY_API_KEY);
  const baseUrl = getEnvValue(process.env.MUSTIKAPAY_BASE_URL) || DEFAULT_BASE_URL;
  return { apiKey, baseUrl: normalizeBaseUrl(baseUrl) };
};

export const createMustikaQris = async ({
  amount,
  productName,
  customerName,
  expiry = 20,
  redirectUrl,
}) => {
  const { apiKey, baseUrl } = getMustikaConfig();
  if (!apiKey) {
    throw new Error("MustikaPay API key not configured");
  }

  const body = new URLSearchParams();
  body.set("amount", String(amount));
  if (productName) body.set("product_name", productName);
  if (customerName) body.set("customer_name", customerName);
  if (expiry) body.set("expiry", String(expiry));
  if (redirectUrl) body.set("redirect_url", redirectUrl);

  const response = await fetch(`${baseUrl}/api/v1/create/qris`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Api-Key": apiKey,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MustikaPay create-qris failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (data.status !== "success") {
    throw new Error(`MustikaPay create-qris returned status=${data.status} (expected status=success)`);
  }

  return {
    refNo: data.ref_no,
    qrUrl: data.qr_url,
    paymentLink: data.payment_link,
    amount: data.amount,
  };
};
```

- [ ] **Step 4: Run test to verify create + config pass**

Run: `cd backend && bun run test -- mustikaService`
Expected: config + createMustikaQris tests PASS; checkMustikaStatus import still undefined (next task). If the runner errors on the missing export, that's expected until Task 2.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mustikaService.js backend/tests/services/mustikaService.test.js
git commit -m "feat: add MustikaPay createQris service"
```

---

### Task 2: `mustikaService.js` — checkMustikaStatus

**Files:**
- Modify: `backend/src/services/mustikaService.js`
- Test: `backend/tests/services/mustikaService.test.js`

Status check is the **source of truth** for crediting. `GET /api/v1/check/qris?ref_no=...`, header `X-Api-Key`. Response: `{ ref_no, status, type, amount, ... }` where `status ∈ {pending, success, expired}`.

- [ ] **Step 1: Add the failing test** (append inside the top-level `describe("mustikaService", ...)` block, after the `createMustikaQris` describe)

```js
  describe("checkMustikaStatus", () => {
    it("GETs check/qris with X-Api-Key and maps status + amount", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ ref_no: "QR123", status: "success", type: "QRIS", amount: 10000 }),
      });

      const result = await checkMustikaStatus("QR123");

      expect(result.status).toBe("success");
      expect(result.amount).toBe(10000);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("https://mustikapayment.com/api/v1/check/qris?ref_no=QR123");
      expect(opts.method).toBe("GET");
      expect(opts.headers["X-Api-Key"]).toBe("MP-test-key");
    });

    it("url-encodes the ref_no", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ status: "pending" }),
      });
      await checkMustikaStatus("QR 1/2");
      expect(fetchMock.mock.calls[0][0]).toBe("https://mustikapayment.com/api/v1/check/qris?ref_no=QR%201%2F2");
    });

    it("throws on non-ok HTTP response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 404, text: async () => "nope" });
      await expect(checkMustikaStatus("QR123")).rejects.toThrow(/MustikaPay check-qris failed: 404/);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun run test -- mustikaService`
Expected: FAIL — `checkMustikaStatus is not a function`.

- [ ] **Step 3: Add the implementation** (append to `mustikaService.js`)

```js
export const checkMustikaStatus = async (refNo) => {
  const { apiKey, baseUrl } = getMustikaConfig();
  if (!apiKey) {
    throw new Error("MustikaPay API key not configured");
  }

  const url = `${baseUrl}/api/v1/check/qris?ref_no=${encodeURIComponent(refNo)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { "X-Api-Key": apiKey },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MustikaPay check-qris failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return { status: data.status, amount: data.amount, raw: data };
};
```

- [ ] **Step 4: Run test to verify all mustikaService tests pass**

Run: `cd backend && bun run test -- mustikaService`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mustikaService.js backend/tests/services/mustikaService.test.js
git commit -m "feat: add MustikaPay checkQrisStatus service"
```

---

### Task 3: `creditTopUpOrder()` shared credit logic

**Files:**
- Modify: `backend/src/services/databaseService.js`
- Test: `backend/tests/services/creditTopUpOrder.test.js`

Extract the wallet-credit logic currently inside `handleBayarWebhook` into a reusable, transaction-based function. Three callers will reuse it: Bayar.gg webhook, MustikaPay poller, and the enriched status endpoint. Idempotency is preserved: if the order is already `COMPLETED`, return early (no double credit). Amount mismatch between the provider-confirmed amount and `order.amountRupiah` is rejected.

The function operates on a `topUpOrder` id and performs the full credit inside a single `prisma.$transaction`: lock order → credit wallet (`walletBalance += amount`, `totalTopUp += amount`) → write `walletTransaction` (with `publicId` via `generatePublicId`) → write `activityLog` → update order metadata. It returns `{ credited: boolean, alreadyProcessed?: boolean, userId?, amount? }`.

- [ ] **Step 1: Write the failing test**

```js
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

    const first = await creditTopUpOrder("order-1", { confirmedAmount: 10000 });
    expect(first.credited).toBe(true);
    expect(first.userId).toBe("user-1");
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "TOP_UP", amount: 10000 }),
    });

    const second = await creditTopUpOrder("order-1", { confirmedAmount: 10000 });
    expect(second.credited).toBe(false);
    expect(second.alreadyProcessed).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledTimes(1); // not credited again
  });

  it("rejects when confirmed amount does not match order amount", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue({ ...baseOrder });
    await expect(creditTopUpOrder("order-1", { confirmedAmount: 5000 }))
      .rejects.toThrow(/amount mismatch/i);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("returns credited:false when order not found", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue(null);
    const result = await creditTopUpOrder("missing", { confirmedAmount: 10000 });
    expect(result.credited).toBe(false);
    expect(result.notFound).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun run test -- creditTopUpOrder`
Expected: FAIL — `creditTopUpOrder is not a function`.

- [ ] **Step 3: Add the implementation** (append to `backend/src/services/databaseService.js`)

```js
import { generatePublicId } from "./publicIdService.js";

/**
 * Credit a top-up order's wallet atomically and idempotently.
 * Shared by Bayar.gg webhook, MustikaPay poller, and status endpoint.
 * @param {string} orderId
 * @param {Object} opts
 * @param {number} opts.confirmedAmount - amount confirmed by the provider (must match order.amountRupiah)
 * @param {string} [opts.providerName="bayar.gg"]
 * @param {Object} [opts.paymentMeta] - extra metadata to store on the order/ledger
 * @returns {Promise<{credited:boolean, alreadyProcessed?:boolean, notFound?:boolean, userId?:string, amount?:number}>}
 */
export async function creditTopUpOrder(orderId, { confirmedAmount, providerName = "bayar.gg", paymentMeta = {} } = {}) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.topUpOrder.findUnique({ where: { id: orderId } });
    if (!order) return { credited: false, notFound: true };
    if (order.status === "COMPLETED") return { credited: false, alreadyProcessed: true, userId: order.userId };

    if (typeof confirmedAmount === "number" && confirmedAmount !== order.amountRupiah) {
      throw new Error(`Top-up amount mismatch: confirmed ${confirmedAmount} != order ${order.amountRupiah}`);
    }

    const amount = order.amountRupiah;

    // Lock: mark COMPLETED first to prevent race / double-credit
    await tx.topUpOrder.update({ where: { id: order.id }, data: { status: "COMPLETED" } });

    const user = await tx.user.update({
      where: { id: order.userId },
      data: { walletBalance: { increment: amount }, totalTopUp: { increment: amount } },
      select: { walletBalance: true },
    });

    const transactionPublicId = await generatePublicId(tx, "TXN", "TOP");
    await tx.walletTransaction.create({
      data: {
        publicId: transactionPublicId,
        userId: order.userId,
        type: "TOP_UP",
        amount,
        balanceAfter: user.walletBalance,
        referenceType: "TOP_UP_ORDER",
        referenceId: order.id,
        description: `Top up Rp ${amount.toLocaleString("id-ID")} via ${providerName}`,
        metadata: paymentMeta,
      },
    });

    await tx.activityLog.create({
      data: {
        userId: order.userId,
        type: "TOP_UP",
        status: "SUCCESS",
        title: "Top up successful",
        description: `Top up Rp ${amount.toLocaleString("id-ID")}`,
        amountRupiah: amount,
        metadata: paymentMeta,
      },
    });

    await tx.topUpOrder.update({
      where: { id: order.id },
      data: {
        finalAmount: typeof confirmedAmount === "number" ? confirmedAmount : amount,
        metadata: { ...(order.metadata || {}), ...paymentMeta },
      },
    });

    return { credited: true, userId: order.userId, amount };
  });
}
```

> Note: `databaseService.js` already imports `prisma`. Add the `generatePublicId` import at the top of the file alongside the existing import if not already present (keep a single import line).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun run test -- creditTopUpOrder`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/databaseService.js backend/tests/services/creditTopUpOrder.test.js
git commit -m "feat: add shared creditTopUpOrder credit logic"
```

---

### Task 4: `asyncHandler` middleware (fix unhandledRejection crash)

**Files:**
- Create: `backend/src/middlewares/asyncHandler.js`
- Modify: `backend/src/middlewares/index.js`
- Test: `backend/tests/routes/asyncHandler.test.js`

Root cause of the production crash: async Express handlers (e.g. `handleCreateTopUp`) have no catch wrapper, so a rejected promise (gateway 400) escapes to `process.on('unhandledRejection')` and crashes. `asyncHandler(fn)` forwards rejections to `next()` so the existing error middleware returns a JSON 500 instead.

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/routes/asyncHandler.test.js
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { asyncHandler } from "../../src/middlewares/asyncHandler.js";

describe("asyncHandler", () => {
  it("forwards a rejected async handler to the error middleware (no crash)", async () => {
    const app = express();
    app.get("/boom", asyncHandler(async () => {
      throw new Error("gateway exploded");
    }));
    app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("gateway exploded");
  });

  it("passes through a resolving handler normally", async () => {
    const app = express();
    app.get("/ok", asyncHandler(async (req, res) => res.status(200).json({ ok: true })));
    const res = await request(app).get("/ok");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun run test -- asyncHandler`
Expected: FAIL — module `asyncHandler.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/middlewares/asyncHandler.js
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
```

- [ ] **Step 4: Export from the middleware barrel** (`backend/src/middlewares/index.js`)

Add this line alongside the existing exports:

```js
export { asyncHandler } from "./asyncHandler.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && bun run test -- asyncHandler`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add backend/src/middlewares/asyncHandler.js backend/src/middlewares/index.js backend/tests/routes/asyncHandler.test.js
git commit -m "feat: add asyncHandler to prevent unhandledRejection crashes"
```

---

### Task 5: `handleCreateTopUp` — provider switch (Bayar.gg | MustikaPay)

**Files:**
- Modify: `backend/src/controllers/topupController.js`
- Test: `backend/tests/routes/topup.test.js`

`handleCreateTopUp` currently always calls Bayar.gg. Add a provider switch keyed on `process.env.TOPUP_PROVIDER` (default `"bayar.gg"`). When `"mustika"`, call `createMustikaQris`, compute `expiresAt = now + 20 min`, store order with `provider="mustika"`, `externalId=refNo`, and `metadata={ qrUrl, paymentLink, expiresAt }`. The API response shape is unchanged so the frontend needs no rework: `qrisImageUrl ← qrUrl`, `paymentUrl ← paymentLink`, `expiresAt`.

The MustikaPay branch does **not** require `BAYARGG_WEBHOOK_URL` (that 500 guard is Bayar.gg-only). MustikaPay does not accept `order_id`; matching is purely by `externalId`.

- [ ] **Step 1: Add the failing test** (append a new `describe` inside the top-level `describe("Top-up Routes", ...)` block in `topup.test.js`)

First, extend the existing `vi.mock` for `mustikaService` at the top of the file (add after the `bayarService` mock):

```js
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
```

Then the test:

```js
  describe("POST /topup/create with TOPUP_PROVIDER=mustika", () => {
    it("creates a MustikaPay QRIS order and returns mapped fields", async () => {
      const prev = process.env.TOPUP_PROVIDER;
      process.env.TOPUP_PROVIDER = "mustika";

      prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TOP-IDR-2606", nextNumber: 2 });
      prisma.topUpOrder.create.mockResolvedValue({
        id: "order-m1",
        publicId: "TOP-IDR-2606-000002",
        userId: mockUser.id,
        provider: "mustika",
        externalId: "QR-TEST-1",
        amountRupiah: 50000,
        status: "PENDING",
        metadata: {
          qrUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR-TEST-1",
          paymentLink: "https://mustikapayment.com/pay/QR-TEST-1",
        },
      });

      const app = buildApp();
      const res = await request(app).post("/topup/create").send({ amount: 50000 });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.invoiceId).toBe("QR-TEST-1");
      expect(res.body.qrisImageUrl).toBe("https://mustikapayment.com/api/qr?data=000201&ref_no=QR-TEST-1");
      expect(res.body.paymentUrl).toBe("https://mustikapayment.com/pay/QR-TEST-1");
      expect(res.body.expiresAt).toBeTruthy();

      const createArg = prisma.topUpOrder.create.mock.calls[0][0];
      expect(createArg.data.provider).toBe("mustika");
      expect(createArg.data.externalId).toBe("QR-TEST-1");

      process.env.TOPUP_PROVIDER = prev;
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun run test -- topup`
Expected: FAIL — create still uses Bayar.gg path; `provider` is `"bayar.gg"` / `invoiceId` mismatch.

- [ ] **Step 3: Implement the provider switch**

At the top of `backend/src/controllers/topupController.js`, add the import alongside the existing `bayarService` import:

```js
import { createMustikaQris, checkMustikaStatus } from "../services/mustikaService.js";
```

Add a constant near the other module constants (after `PROVIDER_NAME`):

```js
const MUSTIKA_PROVIDER = "mustika";
const MUSTIKA_EXPIRY_MIN = 20;
const getTopUpProvider = () => (process.env.TOPUP_PROVIDER || "bayar.gg").trim();
```

Replace the body of `handleCreateTopUp` (the part from the webhook-url guard through the order create + response) with a provider branch. The validation of `amount` at the top stays unchanged. New structure:

```js
export const handleCreateTopUp = async (req, res) => {
  const amount = toNumber(req.body?.amount);

  if (!Number.isInteger(amount)) {
    return res.status(400).json({ error: "Amount must be an integer" });
  }
  if (amount < MIN_TOPUP_AMOUNT) {
    return res.status(400).json({ error: "Amount must be at least 1000" });
  }
  if (amount > MAX_QRIS_AMOUNT) {
    return res.status(400).json({ error: "Amount exceeds QRIS limit" });
  }

  const customerName = req.body?.customer_name;
  const customerEmail = req.body?.customer_email;
  const customerPhone = req.body?.customer_phone;
  const provider = getTopUpProvider();

  let externalId;
  let providerName;
  let metadata;

  if (provider === MUSTIKA_PROVIDER) {
    const redirectUrl = `${process.env.FRONTEND_URL || ""}/topup`;
    const payment = await createMustikaQris({
      amount,
      productName: `Top up Rp ${amount.toLocaleString("id-ID")}`,
      customerName,
      expiry: MUSTIKA_EXPIRY_MIN,
      redirectUrl,
    });
    const expiresAt = new Date(Date.now() + MUSTIKA_EXPIRY_MIN * 60 * 1000).toISOString();
    externalId = payment.refNo;
    providerName = MUSTIKA_PROVIDER;
    metadata = {
      qrUrl: payment.qrUrl,
      paymentLink: payment.paymentLink,
      expiresAt,
    };
  } else {
    const webhookUrl = getWebhookUrl();
    if (!webhookUrl) {
      return res.status(500).json({ error: "Webhook URL not configured" });
    }
    const paymentData = await createBayarPayment({
      amount,
      description: `Top up Rp ${amount.toLocaleString("id-ID")}`,
      customerName,
      customerEmail,
      customerPhone,
      callbackUrl: webhookUrl,
      paymentMethod: PAYMENT_METHOD,
    });
    const invoiceId = paymentData?.data?.invoice_id;
    if (!invoiceId) {
      return res.status(502).json({ error: "Payment gateway did not return invoice ID" });
    }
    externalId = invoiceId;
    providerName = PROVIDER_NAME;
    metadata = buildTopUpMetadata(paymentData);
  }

  const order = await prisma.$transaction(async (tx) => {
    const publicId = await generatePublicId(tx, "TOP", "IDR");
    return tx.topUpOrder.create({
      data: {
        publicId,
        userId: req.user.id,
        provider: providerName,
        externalId,
        amountRupiah: amount,
        finalAmount: null,
        status: "PENDING",
        metadata,
      },
    });
  });

  return res.status(201).json({
    ok: true,
    orderId: order.id,
    publicId: order.publicId,
    invoiceId: externalId,
    amount,
    paymentUrl: metadata.paymentLink || metadata.paymentUrl,
    qrisImageUrl: metadata.qrUrl || metadata.qrisImageUrl,
    expiresAt: metadata.expiresAt,
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun run test -- topup`
Expected: PASS — both the Bayar.gg create test and the new MustikaPay test green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/topupController.js backend/tests/routes/topup.test.js
git commit -m "feat: add provider switch to top-up create (Bayar.gg | MustikaPay)"
```

---

### Task 6: Status endpoint — enrich response + active MustikaPay confirm + 20-min auto-cancel

**Files:**
- Modify: `backend/src/controllers/topupController.js`
- Test: `backend/tests/routes/topup.test.js`

Two changes to `handleGetTopUpStatus`:

1. **Enrich the response** with QRIS render fields (`qrisImageUrl`, `paymentUrl`, `expiresAt`) sourced from `order.metadata`, so the browser can fully restore a pending order after reload (Task 11). This is additive — existing fields unchanged.
2. **Active confirm for MustikaPay**: when a PENDING `mustika` order is fetched, the endpoint must reach the source of truth. If the order is older than 20 minutes → mark `CANCELED`. Otherwise call `checkMustikaStatus(externalId)`: `success` → `creditTopUpOrder` → return COMPLETED; `expired` → mark CANCELED; `pending` → stay PENDING.

The `findFirst` select must be widened to include `provider`, `externalId`, `metadata`, and `createdAt` (currently it selects only status/amount fields).

- [ ] **Step 1: Add the failing tests** (append a new `describe` block inside `describe("Top-up Routes", ...)`)

```js
  describe("GET /topup/status — MustikaPay active confirm", () => {
    it("credits a pending mustika order when check returns success", async () => {
      const { checkMustikaStatus } = await import("../../src/services/mustikaService.js");
      const { creditTopUpOrder } = await import("../../src/services/databaseService.js");
      checkMustikaStatus.mockResolvedValue({ status: "success", amount: 50000 });
      vi.spyOn(await import("../../src/services/databaseService.js"), "creditTopUpOrder");

      prisma.topUpOrder.findFirst.mockResolvedValue({
        id: "order-m1",
        publicId: "TOP-IDR-2606-000002",
        provider: "mustika",
        externalId: "QR-TEST-1",
        status: "PENDING",
        amountRupiah: 50000,
        finalAmount: null,
        metadata: { qrUrl: "q", paymentLink: "p", expiresAt: new Date(Date.now() + 600000).toISOString() },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // creditTopUpOrder reads order again + credits
      prisma.topUpOrder.findUnique.mockResolvedValue({
        id: "order-m1", userId: mockUser.id, amountRupiah: 50000, status: "PENDING", metadata: {},
      });
      prisma.topUpOrder.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({ walletBalance: 150000 });
      prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TXN-TOP-2606", nextNumber: 2 });
      prisma.walletTransaction.create.mockResolvedValue({ id: "wt-1" });
      prisma.activityLog.create.mockResolvedValue({ id: "al-1" });

      const app = buildApp();
      const res = await request(app).get("/topup/status/order-m1");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.paid).toBe(true);
      expect(checkMustikaStatus).toHaveBeenCalledWith("QR-TEST-1");
    });

    it("auto-cancels a mustika order older than 20 minutes without crediting", async () => {
      const { checkMustikaStatus } = await import("../../src/services/mustikaService.js");
      checkMustikaStatus.mockReset();

      prisma.topUpOrder.findFirst.mockResolvedValue({
        id: "order-old",
        publicId: "TOP-IDR-2606-000003",
        provider: "mustika",
        externalId: "QR-OLD",
        status: "PENDING",
        amountRupiah: 50000,
        finalAmount: null,
        metadata: {},
        createdAt: new Date(Date.now() - 21 * 60 * 1000),
        updatedAt: new Date(Date.now() - 21 * 60 * 1000),
      });
      prisma.topUpOrder.update.mockResolvedValue({});

      const app = buildApp();
      const res = await request(app).get("/topup/status/order-old");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELED");
      expect(prisma.topUpOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "CANCELED" }) })
      );
    });

    it("returns enriched QRIS fields for a pending order", async () => {
      const { checkMustikaStatus } = await import("../../src/services/mustikaService.js");
      checkMustikaStatus.mockResolvedValue({ status: "pending" });
      prisma.topUpOrder.findFirst.mockResolvedValue({
        id: "order-m2",
        publicId: "TOP-IDR-2606-000004",
        provider: "mustika",
        externalId: "QR-TEST-2",
        status: "PENDING",
        amountRupiah: 50000,
        finalAmount: null,
        metadata: { qrUrl: "https://q", paymentLink: "https://p", expiresAt: new Date(Date.now() + 600000).toISOString() },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const app = buildApp();
      const res = await request(app).get("/topup/status/order-m2");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("PENDING");
      expect(res.body.qrisImageUrl).toBe("https://q");
      expect(res.body.paymentUrl).toBe("https://p");
      expect(res.body.expiresAt).toBeTruthy();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun run test -- topup`
Expected: FAIL — status endpoint doesn't confirm via MustikaPay, doesn't auto-cancel, doesn't return QRIS fields.

- [ ] **Step 3: Implement the enriched + active-confirm status endpoint**

Add the import for the shared credit fn at the top of `topupController.js` (alongside the existing `databaseService` usage — `debitWallet` is not imported here; add a fresh import):

```js
import { creditTopUpOrder } from "../services/databaseService.js";
```

Add a constant near the others:

```js
const MUSTIKA_EXPIRY_MS = 20 * 60 * 1000;
```

Replace the entire `handleGetTopUpStatus` function with:

```js
export const handleGetTopUpStatus = async (req, res) => {
  const { reference } = req.params;

  if (!reference) {
    return res.status(400).json({ error: "Reference is required" });
  }

  const order = await prisma.topUpOrder.findFirst({
    where: {
      userId: req.user.id,
      OR: [{ id: reference }, { externalId: reference }],
    },
    select: {
      id: true,
      publicId: true,
      provider: true,
      externalId: true,
      status: true,
      amountRupiah: true,
      finalAmount: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  let status = order.status;

  // Active confirmation for pending MustikaPay orders (no trusted webhook)
  if (status === "PENDING" && order.provider === MUSTIKA_PROVIDER) {
    const ageMs = Date.now() - new Date(order.createdAt).getTime();
    if (ageMs > MUSTIKA_EXPIRY_MS) {
      await prisma.topUpOrder.update({ where: { id: order.id }, data: { status: "CANCELED" } });
      status = "CANCELED";
    } else {
      try {
        const check = await checkMustikaStatus(order.externalId);
        if (check.status === "success") {
          await creditTopUpOrder(order.id, {
            confirmedAmount: order.amountRupiah,
            providerName: MUSTIKA_PROVIDER,
            paymentMeta: { ref_no: order.externalId, checkedVia: "status-endpoint" },
          });
          status = "COMPLETED";
        } else if (check.status === "expired") {
          await prisma.topUpOrder.update({ where: { id: order.id }, data: { status: "CANCELED" } });
          status = "CANCELED";
        }
      } catch (err) {
        console.error("[topup] MustikaPay status check failed:", err.message);
        // leave as PENDING; next poll / button retry will reconcile
      }
    }
  }

  const meta = order.metadata || {};
  return res.status(200).json({
    ok: true,
    publicId: order.publicId,
    paid: status === "COMPLETED",
    status,
    amount: order.amountRupiah,
    finalAmount: order.finalAmount,
    qrisImageUrl: meta.qrUrl || meta.qrisImageUrl || null,
    paymentUrl: meta.paymentLink || meta.paymentUrl || null,
    expiresAt: meta.expiresAt || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun run test -- topup`
Expected: PASS — all topup describe blocks green (existing pending/completed tests still pass because they use `provider` absent → not mustika, and now also get the extra null QRIS fields which they don't assert on).

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/topupController.js backend/tests/routes/topup.test.js
git commit -m "feat: active MustikaPay confirm + enriched status response + 20-min auto-cancel"
```

---

### Task 7: Refactor `handleBayarWebhook` to delegate to `creditTopUpOrder`

**Files:**
- Modify: `backend/src/controllers/topupController.js`
- Test: `backend/tests/routes/topup.test.js` (existing webhook test must still pass)

The webhook currently inlines the full credit transaction. Replace its body with a call to the shared `creditTopUpOrder` so all three triggers share one code path. Signature verification, the `status !== "paid"` early-ignore, and the email side-effect remain in the handler. The order lookup inside the webhook uses `externalId` (the Bayar.gg `invoice_id`) — resolve it to an order id first, then call `creditTopUpOrder(order.id, ...)`.

- [ ] **Step 1: Confirm the existing webhook test still describes desired behavior**

The existing test `"should create wallet transaction with publicId when paid webhook succeeds"` asserts a `walletTransaction.create` with `type: "TOP_UP"` and a `TXN-TOP-...` publicId. `creditTopUpOrder` produces exactly that, so the test stays valid. No new test needed; this is a refactor guarded by the existing test.

- [ ] **Step 2: Run the existing test to establish the baseline**

Run: `cd backend && bun run test -- topup`
Expected: PASS currently (before refactor).

- [ ] **Step 3: Refactor the webhook body**

Replace the `try { ... } catch` transaction block in `handleBayarWebhook` (the part that finds the order, locks it, credits wallet, writes ledger/activity, updates order) with a lookup + delegation:

```js
  try {
    const order = await prisma.topUpOrder.findUnique({ where: { externalId: invoiceId } });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const paymentMeta = {
      invoiceId,
      status,
      amount: req.body?.amount,
      finalAmount: req.body?.final_amount,
      uniqueCode: req.body?.unique_code,
      paidAt: req.body?.paid_at,
      paidReffNum: req.body?.paid_reff_num,
      customerName: req.body?.customer_name,
      customerEmail: req.body?.customer_email,
      customerPhone: req.body?.customer_phone,
    };

    const result = await creditTopUpOrder(order.id, {
      confirmedAmount: order.amountRupiah,
      providerName: PROVIDER_NAME,
      paymentMeta,
    });

    if (result.notFound) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (result.credited) {
      const user = await prisma.user.findUnique({
        where: { id: result.userId },
        select: { email: true, displayName: true, walletBalance: true },
      });
      if (user) {
        sendTopUpSuccessEmail(user, result.amount, user.walletBalance).catch(() => {});
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[webhook] Error processing payment:", err);
    return res.status(500).json({ error: "Failed to process payment" });
  }
```

> Note: the webhook's confirmedAmount uses `order.amountRupiah` (not the webhook's `final_amount`) to keep the existing test's expectation of a `TOP_UP` of the order amount. The webhook's `final_amount` is preserved in `paymentMeta` and written to `order.finalAmount` by `creditTopUpOrder`.

- [ ] **Step 4: Run test to verify it still passes**

Run: `cd backend && bun run test -- topup`
Expected: PASS — the webhook test is green via the shared function.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/topupController.js
git commit -m "refactor: Bayar.gg webhook delegates to shared creditTopUpOrder"
```

---

### Task 8: `topupPoller.js` — background reconciliation (only when pending exists)

**Files:**
- Create: `backend/src/services/topupPoller.js`
- Test: `backend/tests/services/topupPoller.test.js`

A function `pollPendingMustikaOrders()` that: (1) counts PENDING `mustika` orders and returns immediately if zero (no provider calls); (2) for each pending order, if older than 20 min → mark `CANCELED` (after one final `checkMustikaStatus` that still credits on `success`); else `checkMustikaStatus` → `success` credits, `expired` cancels, `pending` left alone. Per-order errors are caught so one bad order doesn't abort the batch. A separate `startTopUpPoller(intervalMs)` wires it to `setInterval` and returns the timer (so `server.js` can start it and tests don't need timers).

Guard: if `MUSTIKAPAY_API_KEY` is empty, `pollPendingMustikaOrders` returns early without querying.

- [ ] **Step 1: Write the failing test**

```js
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
    expect(creditSpy).toHaveBeenCalledWith("o1", expect.objectContaining({ confirmedAmount: 10000 }));
    expect(result.checked).toBe(1);
    creditSpy.mockRestore();
  });

  it("auto-cancels a pending order older than 20 minutes when not yet paid", async () => {
    prisma.topUpOrder.count.mockResolvedValue(1);
    prisma.topUpOrder.findMany.mockResolvedValue([
      { id: "old", externalId: "QR-OLD", amountRupiah: 10000, createdAt: new Date(Date.now() - 21 * 60 * 1000), metadata: {} },
    ]);
    checkMustikaStatus.mockResolvedValue({ status: "pending" });
    prisma.topUpOrder.update.mockResolvedValue({});

    await pollPendingMustikaOrders();

    expect(prisma.topUpOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "old" }, data: expect.objectContaining({ status: "CANCELED" }) })
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun run test -- topupPoller`
Expected: FAIL — module `topupPoller.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/services/topupPoller.js
import { prisma } from "../prisma.js";
import { checkMustikaStatus } from "./mustikaService.js";
import { creditTopUpOrder } from "./databaseService.js";

const MUSTIKA_PROVIDER = "mustika";
const MUSTIKA_EXPIRY_MS = 20 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 3 * 60 * 1000;

export async function pollPendingMustikaOrders() {
  const apiKey = (process.env.MUSTIKAPAY_API_KEY || "").trim();
  if (!apiKey) {
    return { skipped: true, checked: 0 };
  }

  const pendingCount = await prisma.topUpOrder.count({
    where: { provider: MUSTIKA_PROVIDER, status: "PENDING" },
  });
  if (pendingCount === 0) {
    return { checked: 0 };
  }

  const orders = await prisma.topUpOrder.findMany({
    where: { provider: MUSTIKA_PROVIDER, status: "PENDING" },
    select: { id: true, externalId: true, amountRupiah: true, createdAt: true, metadata: true },
  });

  let checked = 0;
  for (const order of orders) {
    checked += 1;
    const isExpired = Date.now() - new Date(order.createdAt).getTime() > MUSTIKA_EXPIRY_MS;
    try {
      const check = await checkMustikaStatus(order.externalId);
      if (check.status === "success") {
        await creditTopUpOrder(order.id, {
          confirmedAmount: order.amountRupiah,
          providerName: MUSTIKA_PROVIDER,
          paymentMeta: { ref_no: order.externalId, checkedVia: "poller" },
        });
      } else if (check.status === "expired" || isExpired) {
        await prisma.topUpOrder.update({ where: { id: order.id }, data: { status: "CANCELED" } });
      }
    } catch (err) {
      console.error(`[poller] order ${order.id} check failed:`, err.message);
    }
  }

  return { checked };
}

export function startTopUpPoller(intervalMs = DEFAULT_INTERVAL_MS) {
  const timer = setInterval(() => {
    pollPendingMustikaOrders().catch((err) => {
      console.error("[poller] run failed:", err.message);
    });
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun run test -- topupPoller`
Expected: PASS (all five cases).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/topupPoller.js backend/tests/services/topupPoller.test.js
git commit -m "feat: add MustikaPay top-up poller (skips when no pending orders)"
```

---

### Task 9: Wire-up — `services/index.js` exports, `server.js` asyncHandler + poller start

**Files:**
- Modify: `backend/src/services/index.js`
- Modify: `backend/src/server.js`

This is a wiring task (no new unit test — verified by the existing suite still passing and the app booting). It does three things: export the new services, wrap the async top-up routes with `asyncHandler` (the actual crash fix in production), and start the poller after `app.listen`.

- [ ] **Step 1: Export new services from the barrel**

`backend/src/services/index.js` currently exports only `authService`, `tokenService`, `uploadService`. Append:

```js
export * from "./bayarService.js";
export * from "./mustikaService.js";
export * from "./topupPoller.js";
```

> `bayarService` is added too because it was previously not re-exported; this keeps the barrel complete. If a duplicate-export error appears (another module already re-exports it), drop the `bayarService` line and keep the other two.

- [ ] **Step 2: Apply `asyncHandler` to the async top-up routes in `server.js`**

Add `asyncHandler` to the destructured import from `./middlewares/index.js` (the import already lists `ensureAuthReady, requireAuth, ...`):

```js
import { ensureAuthReady, requireAuth, createUploadLimiter, validateApiKey, validateAudioFile, requireAdmin, asyncHandler } from "./middlewares/index.js";
```

Import the poller starter near the other service imports at the top of `server.js`:

```js
import { startTopUpPoller } from "./services/topupPoller.js";
```

Replace the three top-up route registrations (currently at `server.js:220-222`) with `asyncHandler`-wrapped handlers:

```js
app.post("/topup/create", requireAuth, topupLimiter, validate(createTopUpSchema), asyncHandler(handleCreateTopUp));
app.get("/topup/status/:reference", requireAuth, asyncHandler(handleGetTopUpStatus));
app.post("/webhooks/bayar", asyncHandler(handleBayarWebhook));
```

- [ ] **Step 3: Start the poller after the server begins listening**

In the `app.listen(port, () => { ... })` callback at the bottom of `server.js`, add the poller start after the existing console logs:

```js
app.listen(port, () => {
  console.log(`Upload API listening on http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  startTopUpPoller();
  console.log("MustikaPay top-up poller started (3-min interval)");
});
```

- [ ] **Step 4: Run the full backend test suite to verify nothing regressed**

Run: `cd backend && bun run test`
Expected: PASS — all suites green (mustikaService, creditTopUpOrder, asyncHandler, topup, topupPoller, plus pre-existing auth/cart/checkout/etc.).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/index.js backend/src/server.js
git commit -m "feat: wire MustikaPay services, asyncHandler routes, and poller start"
```

---

### Task 10: Frontend `topup.ts` — extend status response type

**Files:**
- Modify: `frontend/lib/api/topup.ts`

The enriched status endpoint (Task 6) now returns optional QRIS render fields and may report `CANCELED`. Extend the `TopUpStatusResponse` type so the page can restore a pending order from these fields. No test (type-only change verified by `tsc`/build).

- [ ] **Step 1: Update the type**

In `frontend/lib/api/topup.ts`, replace the `TopUpStatusResponse` type with:

```ts
export type TopUpStatusResponse = {
  ok: boolean;
  publicId?: string;
  paid: boolean;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELED";
  amount: number;
  finalAmount: number | null;
  qrisImageUrl?: string | null;
  paymentUrl?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS — no type errors from the change.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api/topup.ts
git commit -m "feat: extend TopUpStatusResponse with QRIS render fields"
```

---

### Task 11: Frontend `page.tsx` — "Saya sudah bayar" button + localStorage persist/restore

**Files:**
- Modify: `frontend/app/topup/page.tsx`

Two UX additions. (1) A "Saya sudah bayar" button on the `qris`/`polling` step that triggers an immediate `getTopUpStatus(orderId)` instead of waiting for the next poll tick. (2) Persist the pending order id to `localStorage` on create and restore the full QRIS step on mount from the enriched status endpoint, so closing/reopening the app re-displays the pending QR. Backend stays the source of truth — only the `orderId` is stored client-side.

The existing `?order=` restore (`page.tsx:173-181`) only restores `orderId` and starts polling; it never re-renders the QR. We replace it with a fetch-and-restore that reads `qrisImageUrl`/`paymentUrl`/`expiresAt`/`amount` from the status response.

- [ ] **Step 1: Add the localStorage key constant** (near the top of the file, after `quickAmounts`)

```tsx
const PENDING_KEY = 'pendingTopUpOrder';
```

- [ ] **Step 2: Persist orderId on create success and clear it on terminal states**

In `handleSubmit`, right after `setOrderId(result.orderId);`, add:

```tsx
      if (typeof window !== 'undefined') {
        localStorage.setItem(PENDING_KEY, result.orderId);
      }
```

In `handleReset`, after the `setStep('input')` line, add:

```tsx
    if (typeof window !== 'undefined') {
      localStorage.removeItem(PENDING_KEY);
    }
```

In `startPolling`, clear the key on the terminal transitions. After `setStep('success');` add `localStorage.removeItem(PENDING_KEY);` and after `setStep('failed');` add `localStorage.removeItem(PENDING_KEY);`. (Both guarded by `typeof window !== 'undefined'`.)

- [ ] **Step 3: Add a "Saya sudah bayar" button to the QRIS/polling status panel**

In the `(step === 'qris' || step === 'polling')` block, inside the status panel `div` (right before the existing "Batalkan & Kembali" button at `page.tsx:365`), add:

```tsx
            <button
              type="button"
              onClick={async () => {
                if (!orderId) return;
                try {
                  const status = await getTopUpStatus(orderId);
                  if (status.paid || status.status === 'COMPLETED') {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    if (typeof window !== 'undefined') localStorage.removeItem(PENDING_KEY);
                    setStep('success');
                    await refreshUser();
                  } else if (status.status === 'CANCELED' || status.status === 'FAILED') {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    if (typeof window !== 'undefined') localStorage.removeItem(PENDING_KEY);
                    setStep('failed');
                    setError('Pembayaran dibatalkan atau kedaluwarsa.');
                  } else {
                    setError('Pembayaran belum terdeteksi. Coba lagi sebentar.');
                  }
                } catch {
                  setError('Gagal mengecek status. Coba lagi.');
                }
              }}
              className="w-full rounded-full bg-emerald-500/90 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Saya sudah bayar
            </button>
```

- [ ] **Step 4: Replace the `?order=` restore effect with a full QRIS restore**

Replace the entire `useEffect` at `page.tsx:173-181` (the one reading the `order` URL param) with:

```tsx
  // Restore a pending order on mount: from ?order= param or localStorage.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (step !== 'input') return;

    const params = new URLSearchParams(window.location.search);
    const restoreId = params.get('order') || localStorage.getItem(PENDING_KEY);
    if (!restoreId) return;

    let cancelled = false;
    (async () => {
      try {
        const status = await getTopUpStatus(restoreId);
        if (cancelled) return;

        if (status.status === 'PENDING') {
          setOrderId(restoreId);
          setOrderAmount(status.amount);
          setQrisImageUrl(status.qrisImageUrl || null);
          setPaymentUrl(status.paymentUrl || null);
          setExpiresAt(status.expiresAt || null);
          localStorage.setItem(PENDING_KEY, restoreId);
          setStep('qris');
          startPolling(restoreId);
        } else {
          // Terminal state — nothing pending to show.
          localStorage.removeItem(PENDING_KEY);
        }
      } catch {
        // Ignore; user can start a new top-up.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, startPolling]);
```

- [ ] **Step 5: Manual verification (dev server)**

Run backend + frontend dev servers. With `TOPUP_PROVIDER=mustika` and a valid `MUSTIKAPAY_API_KEY`:
1. Create a top-up → QR renders, polling starts.
2. Reload the page → QR still renders (restored from localStorage + status endpoint), polling resumes.
3. Click "Saya sudah bayar" before paying → "belum terdeteksi" message; status stays pending.
4. After paying (or mocking `success`) → success step shows, localStorage cleared.

If the UI cannot be exercised end-to-end in this environment, state that explicitly rather than claiming it passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/topup/page.tsx
git commit -m "feat: persist pending QRIS across reload + 'Saya sudah bayar' button"
```

---

### Task 12: `.env.example` — add MustikaPay + provider vars

**Files:**
- Modify: `backend/.env.example`

Add the new env contract. Bayar.gg vars stay. `TOPUP_PROVIDER` defaults to `bayar.gg` so existing behavior is unchanged until explicitly switched.

- [ ] **Step 1: Add the variables**

In `backend/.env.example`, in the `# Payment Gateway` section (after the existing `BAYARGG_WEBHOOK_URL=` line), add:

```
# Payment provider selector: "bayar.gg" (webhook) or "mustika" (polling)
TOPUP_PROVIDER=bayar.gg

# Payment Gateway — MustikaPay (QRIS, polling-based, no webhook secret)
MUSTIKAPAY_API_KEY=
MUSTIKAPAY_BASE_URL=https://mustikapayment.com
```

- [ ] **Step 2: Commit**

```bash
git add backend/.env.example
git commit -m "docs: add MustikaPay + TOPUP_PROVIDER env vars"
```

---

### Task 13: Sync `openapi.yaml` to current reality

**Files:**
- Modify: `backend/openapi.yaml`

Two parts. (A) Update the existing top-up paths/schemas for MustikaPay + polling + `CANCELED`. (B) Add the 11 endpoints that exist in `server.js` but are missing from the spec. This is a documentation-accuracy task; verified by an OpenAPI lint/parse.

**Missing endpoints to add** (verified against `server.js`):
- `GET /user/transactions`, `PUT /user/roblox-id`
- `POST /api/license/handshake`, `POST /api/license/heartbeat`, `POST /api/license/enforce`
- `GET /admin/licenses/active`, `GET /admin/licenses/{id}/logs`, `POST /admin/licenses/{id}/kill`
- `GET /admin/users`, `PUT /admin/users/{id}/role`, `POST /admin/users/{id}/adjust-balance`

- [ ] **Step 1: Update the TopUp tag description**

Change the `TopUp` tag (line ~24):

```yaml
  - name: TopUp
    description: Wallet top-up via QRIS (Bayar.gg webhook or MustikaPay polling, selected by TOPUP_PROVIDER)
```

- [ ] **Step 2: Update `/topup/create` description + response example**

In `/topup/create`, change the `description` to note both providers, and adjust the response example so it is provider-agnostic:

```yaml
      description: |
        Creates a QRIS top-up order. Provider is selected by the server's TOPUP_PROVIDER env
        ("bayar.gg" uses a signed webhook; "mustika" uses polling — no webhook).
        Amount in Rupiah is credited to the wallet only after the payment is confirmed.
```

Update the `"201"` example block to include the MustikaPay-style identifiers (keep it a single representative example):

```yaml
              example:
                ok: true
                orderId: "clx3order1"
                publicId: "TOP-IDR-2606-000001"
                invoiceId: "QR1776670534209"
                amount: 10000
                paymentUrl: "https://mustikapayment.com/pay/QR1776670534209"
                qrisImageUrl: "https://mustikapayment.com/api/qr?data=000201...&ref_no=QR1776670534209"
                expiresAt: "2026-06-13T11:20:00.000Z"
```

- [ ] **Step 3: Update `/topup/status/{reference}` to return the enriched fields + CANCELED**

Replace the `"200"` examples for this path with:

```yaml
        "200":
          description: Order status (QRIS render fields included while pending)
          content:
            application/json:
              examples:
                pending:
                  summary: Payment pending
                  value:
                    ok: true
                    publicId: "TOP-IDR-2606-000001"
                    paid: false
                    status: "PENDING"
                    amount: 10000
                    finalAmount: null
                    qrisImageUrl: "https://mustikapayment.com/api/qr?data=000201...&ref_no=QR123"
                    paymentUrl: "https://mustikapayment.com/pay/QR123"
                    expiresAt: "2026-06-13T11:20:00.000Z"
                    createdAt: "2026-06-13T11:00:00.000Z"
                    updatedAt: "2026-06-13T11:00:00.000Z"
                completed:
                  summary: Payment completed
                  value:
                    ok: true
                    publicId: "TOP-IDR-2606-000001"
                    paid: true
                    status: "COMPLETED"
                    amount: 10000
                    finalAmount: 10000
                    qrisImageUrl: null
                    paymentUrl: null
                    expiresAt: null
                    createdAt: "2026-06-13T11:00:00.000Z"
                    updatedAt: "2026-06-13T11:05:00.000Z"
                canceled:
                  summary: Auto-canceled after 20 minutes (MustikaPay)
                  value:
                    ok: true
                    publicId: "TOP-IDR-2606-000001"
                    paid: false
                    status: "CANCELED"
                    amount: 10000
                    finalAmount: null
                    createdAt: "2026-06-13T11:00:00.000Z"
                    updatedAt: "2026-06-13T11:21:00.000Z"
```

- [ ] **Step 4: Update the `TopUpOrder` schema**

In `components.schemas.TopUpOrder`, add `publicId` and make the `paymentUrl`/`qrisImageUrl` descriptions provider-agnostic:

```yaml
    TopUpOrder:
      type: object
      properties:
        orderId:
          type: string
        publicId:
          type: string
          nullable: true
        invoiceId:
          type: string
          description: Provider reference (Bayar.gg invoice_id or MustikaPay ref_no)
        amount:
          type: integer
          description: Amount in Rupiah
        finalAmount:
          type: integer
          nullable: true
        paymentUrl:
          type: string
          description: Provider payment page URL
        qrisImageUrl:
          type: string
          description: QR code image URL for QRIS payment
        expiresAt:
          type: string
          format: date-time
        status:
          type: string
          enum: [PENDING, COMPLETED, FAILED, CANCELED]
```

- [ ] **Step 5: Add the missing User endpoints**

Add under `paths:` (anywhere among the path items; group near other user routes). Add a `User` tag to the `tags:` list first:

```yaml
  - name: User
    description: Authenticated user profile, transactions, Roblox binding
```

Then the paths:

```yaml
  /user/transactions:
    get:
      tags: [User]
      summary: Get wallet transaction history
      operationId: getUserTransactions
      security:
        - cookieAuth: []
      parameters:
        - name: page
          in: query
          schema: { type: integer, default: 1 }
        - name: limit
          in: query
          schema: { type: integer, default: 20, maximum: 100 }
        - name: type
          in: query
          schema:
            type: string
            enum: [ALL, TOP_UP, PURCHASE, AUDIO_CHARGE, REFUND, ADJUSTMENT]
          description: Filter by transaction type (ALL = no filter)
      responses:
        "200":
          description: Paginated wallet transactions
          content:
            application/json:
              example:
                transactions:
                  - id: "txn-1"
                    publicId: "TXN-TOP-2606-000001"
                    type: "TOP_UP"
                    amount: 10000
                    balanceAfter: 60000
                    description: "Top up Rp 10.000 via mustika"
                    referenceType: "TOP_UP_ORDER"
                    referenceId: "order-1"
                    createdAt: "2026-06-13T11:05:00.000Z"
                pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
        "401":
          $ref: "#/components/responses/Unauthorized"

  /user/roblox-id:
    put:
      tags: [User]
      summary: Set or update Roblox User ID
      operationId: setRobloxUserId
      security:
        - cookieAuth: []
      description: Validates the Roblox user exists via the Roblox API before saving.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [robloxUserId]
              properties:
                robloxUserId:
                  type: string
                  description: Numeric Roblox user ID
            example:
              robloxUserId: "123456789"
      responses:
        "200":
          description: Roblox ID saved
          content:
            application/json:
              example:
                ok: true
                robloxUserId: "123456789"
                robloxUsername: "builderman"
                robloxDisplayName: "builderman"
        "400":
          description: Missing or non-numeric ID
          content:
            application/json:
              examples:
                missing: { value: { error: "robloxUserId is required" } }
                notNumeric: { value: { error: "Roblox User ID must be numeric" } }
        "401":
          $ref: "#/components/responses/Unauthorized"
        "404":
          description: Roblox user not found
          content:
            application/json:
              example:
                error: "Roblox User ID not found. Please check your ID."
        "502":
          description: Roblox API error
          content:
            application/json:
              example:
                error: "Failed to validate Roblox User ID. Please try again later."
```

- [ ] **Step 6: Add the License enforcement endpoints**

```yaml
  /api/license/handshake:
    post:
      tags: [Verification]
      summary: License handshake (Roblox runtime enforcement)
      operationId: licenseHandshake
      security: []
      description: |
        Called from the protected Roblox asset module. Validates the license + game,
        returns a time-bucketed signKey and a session token. Rate limited (10/min).
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [licenseKey, gameId]
              properties:
                licenseKey: { type: string }
                gameId: { type: string }
                gameName: { type: string }
                creatorId: { type: string }
                creatorType: { type: string }
            example:
              licenseKey: "RBXR-A2B3-C4D5-E6F7-G8H9"
              gameId: "123456789"
              gameName: "My Roblox Game"
      responses:
        "200":
          description: Handshake result
          content:
            application/json:
              examples:
                valid:
                  value:
                    valid: true
                    sessionToken: "a1b2c3..."
                    signKey: "9f8e7d..."
                    expiresIn: 300
                    product: { name: "UI System Pro", version: "1.2.0" }
                    license: { type: "PERSONAL", maxGames: 3 }
                invalid:
                  value:
                    valid: false
                    reason: "not_whitelisted"
        "400":
          description: Missing params
          content:
            application/json:
              example:
                valid: false
                reason: "missing_params"

  /api/license/heartbeat:
    post:
      tags: [Verification]
      summary: License heartbeat (periodic re-verification + signKey rotation)
      operationId: licenseHeartbeat
      security: []
      description: Rate limited (15/min). Requires a session token from the handshake.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [licenseKey, gameId, sessionToken]
              properties:
                licenseKey: { type: string }
                gameId: { type: string }
                sessionToken: { type: string }
                creatorId: { type: string }
            example:
              licenseKey: "RBXR-A2B3-C4D5-E6F7-G8H9"
              gameId: "123456789"
              sessionToken: "a1b2c3..."
      responses:
        "200":
          description: Heartbeat result
          content:
            application/json:
              examples:
                valid:
                  value:
                    valid: true
                    signKey: "rotated..."
                    expiresIn: 300
                invalid:
                  value:
                    valid: false
                    reason: "invalid_session"
        "400":
          description: Missing params
          content:
            application/json:
              example:
                valid: false
                reason: "missing_params"

  /api/license/enforce:
    post:
      tags: [Verification]
      summary: Fetch encrypted enforcement payload
      operationId: licenseEnforce
      security: []
      description: |
        Returns an XOR-encrypted, base64-encoded Lua payload for the given phase (1-5).
        Rate limited (5/min). The client derives the decryption key from signKey+licenseKey+gameId.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [licenseKey, gameId]
              properties:
                licenseKey: { type: string }
                gameId: { type: string }
                phase: { type: integer, minimum: 1, maximum: 5, default: 1 }
            example:
              licenseKey: "RBXR-A2B3-C4D5-E6F7-G8H9"
              gameId: "123456789"
              phase: 1
      responses:
        "200":
          description: Encrypted enforcement payload
          content:
            application/json:
              example:
                payload: "base64-encrypted-lua..."
                nextPhase: 2
                nextDelay: 300
        "400":
          description: Missing params
          content:
            application/json:
              example:
                error: "missing_params"
```

- [ ] **Step 7: Add the missing Admin endpoints**

```yaml
  /admin/licenses/active:
    get:
      tags: [Admin]
      summary: List currently-active licenses (verified in last 5 min)
      operationId: adminActiveLicenses
      security:
        - cookieAuth: []
      responses:
        "200":
          description: Active licenses snapshot
          content:
            application/json:
              example:
                count: 1
                licenses:
                  - id: "clx6lic1"
                    licenseKey: "RBXR-A2B3-C4D5-E6F7-G8H9"
                    licenseType: "PERSONAL"
                    lastVerifiedAt: "2026-06-13T11:00:00.000Z"
                    user: { id: "clx1abc123", email: "dev@rbxroyale.com", displayName: "RBX Dev" }
                    product: { id: "clx4prod1", name: "UI System Pro", slug: "ui-system-pro" }
                    activeGames:
                      - { gameId: "123456789", gameName: "My Roblox Game" }
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"

  /admin/licenses/{id}/logs:
    get:
      tags: [Admin]
      summary: Verification logs for a license
      operationId: adminLicenseLogs
      security:
        - cookieAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
        - name: page
          in: query
          schema: { type: integer, default: 1 }
        - name: limit
          in: query
          schema: { type: integer, default: 50, maximum: 100 }
      responses:
        "200":
          description: Paginated verification logs
          content:
            application/json:
              example:
                licenseId: "clx6lic1"
                licenseKey: "RBXR-A2B3-C4D5-E6F7-G8H9"
                logs:
                  - id: "ver-1"
                    gameId: "123456789"
                    success: true
                    reason: "handshake_ok"
                    verifiedAt: "2026-06-13T11:00:00.000Z"
                pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          description: License not found
          content:
            application/json:
              example:
                error: "License not found"

  /admin/licenses/{id}/kill:
    post:
      tags: [Admin]
      summary: Kill switch — suspend a license immediately
      operationId: adminKillSwitch
      security:
        - cookieAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                reason: { type: string }
            example:
              reason: "Chargeback fraud"
      responses:
        "200":
          description: License suspended
          content:
            application/json:
              example:
                ok: true
                license: { id: "clx6lic1", licenseKey: "RBXR-A2B3-C4D5-E6F7-G8H9", status: "SUSPENDED" }
                message: "License suspended. Next heartbeat will trigger enforcement."
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          description: License not found
          content:
            application/json:
              example:
                error: "License not found"

  /admin/users:
    get:
      tags: [Admin]
      summary: List users (paginated, searchable)
      operationId: adminListUsers
      security:
        - cookieAuth: []
      parameters:
        - name: page
          in: query
          schema: { type: integer, default: 1 }
        - name: limit
          in: query
          schema: { type: integer, default: 50, maximum: 100 }
        - name: search
          in: query
          schema: { type: string }
          description: Matches email, displayName, username, fullName
        - name: role
          in: query
          schema:
            type: string
            enum: [ALL, USER, ADMIN]
      responses:
        "200":
          description: Paginated user list
          content:
            application/json:
              example:
                users:
                  - id: "clx1abc123"
                    publicId: "ACC-IDN-2606-000001"
                    email: "dev@rbxroyale.com"
                    displayName: "RBX Dev"
                    role: "USER"
                    walletBalance: 50000
                    totalTopUp: 100000
                    totalSpent: 50000
                    licensesCount: 2
                    purchasesCount: 3
                    createdAt: "2026-05-01T10:00:00.000Z"
                pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"

  /admin/users/{id}/role:
    put:
      tags: [Admin]
      summary: Change a user's role
      operationId: adminChangeUserRole
      security:
        - cookieAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [role]
              properties:
                role:
                  type: string
                  enum: [USER, ADMIN]
            example:
              role: "ADMIN"
      responses:
        "200":
          description: Role updated
          content:
            application/json:
              example:
                ok: true
                user: { id: "clx1abc123", email: "dev@rbxroyale.com", displayName: "RBX Dev", role: "ADMIN" }
        "400":
          description: Invalid role
          content:
            application/json:
              example:
                error: "Valid role required: USER or ADMIN"
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          description: Forbidden (e.g. cannot demote yourself)
          content:
            application/json:
              example:
                error: "Cannot demote yourself"
        "404":
          description: User not found
          content:
            application/json:
              example:
                error: "User not found"

  /admin/users/{id}/adjust-balance:
    post:
      tags: [Admin]
      summary: Adjust a user's wallet balance
      operationId: adminAdjustUserBalance
      security:
        - cookieAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [amount, reason]
              properties:
                amount:
                  type: integer
                  description: Non-zero; positive credits, negative debits
                reason:
                  type: string
            example:
              amount: 25000
              reason: "Goodwill credit"
      responses:
        "200":
          description: Balance adjusted
          content:
            application/json:
              example:
                ok: true
                user: { id: "clx1abc123", newBalance: 75000 }
        "400":
          description: Invalid adjustment
          content:
            application/json:
              examples:
                zeroAmount: { value: { error: "Amount must be a non-zero number" } }
                missingReason: { value: { error: "Reason is required" } }
                wouldGoNegative:
                  value:
                    error: "Adjustment would result in negative balance"
                    currentBalance: 10000
                    adjustment: -50000
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          description: User not found
          content:
            application/json:
              example:
                error: "User not found"
```

- [ ] **Step 8: Validate the OpenAPI document parses**

Run: `cd backend && npx @redocly/cli lint openapi.yaml` (or `npx @apidevtools/swagger-cli validate openapi.yaml` if Redocly is unavailable).
Expected: No structural errors. Warnings about descriptions/examples are acceptable.

If neither linter is available offline, verify it parses as YAML:
Run: `cd backend && node -e "const y=require('js-yaml');const fs=require('fs');y.load(fs.readFileSync('openapi.yaml','utf8'));console.log('OK')"`
Expected: `OK`.

- [ ] **Step 9: Commit**

```bash
git add backend/openapi.yaml
git commit -m "docs: sync openapi.yaml — MustikaPay/polling + 11 missing endpoints"
```

---

### Task 14: Update prose docs (dokumentasi-teknis, READMEs, API_ROUTES)

**Files:**
- Modify: `docs/dokumentasi-teknis.md`
- Modify: `backend/README.md`
- Modify: `backend/API_ROUTES.md`

Reflect the both-providers reality: Bayar.gg uses a signed webhook, MustikaPay uses polling (no signature). Do **not** delete Bayar.gg docs — it remains a selectable provider via `TOPUP_PROVIDER`. This is a docs task; no tests.

- [ ] **Step 1: `dokumentasi-teknis.md` — overview + tech-stack lines**

Change the architecture overview line (line ~12) and the gateway table row (line ~61):

```
... terintegrasi dengan payment gateway QRIS (Bayar.gg webhook & MustikaPay polling, dipilih via TOPUP_PROVIDER), object storage (Backblaze B2), dan email transaksional (Resend).
```

```
| Bayar.gg | Payment gateway QRIS — webhook (HMAC) |
| MustikaPay | Payment gateway QRIS — polling (tanpa signature) |
```

- [ ] **Step 2: `dokumentasi-teknis.md` — endpoint table (section 5.3, lines ~656-658)**

Replace the three top-up rows with:

```
| POST | /topup/create | Login | Buat pembayaran QRIS (Bayar.gg atau MustikaPay, sesuai TOPUP_PROVIDER) |
| GET | /topup/status/:reference | Login | Cek status; untuk MustikaPay aktif konfirmasi ke gateway + auto-cancel 20 menit |
| POST | /webhooks/bayar | Publik (signature) | Webhook Bayar.gg saat pembayaran berhasil (tidak dipakai MustikaPay) |
```

- [ ] **Step 3: `dokumentasi-teknis.md` — rewrite section 6.2 (Alur Top-Up)**

Replace the entire 6.2 body (lines ~740-759) with a provider-split flow:

```
### 6.2 Alur Top-Up (QRIS)

Top-up tersedia lewat dua payment gateway QRIS yang dipilih server via env `TOPUP_PROVIDER`:
Bayar.gg (konfirmasi via webhook ber-signature) dan MustikaPay (konfirmasi via polling,
karena webhook MustikaPay tidak ber-signature sehingga tidak dipercaya sebagai sumber kebenaran).

Alur umum (kedua provider):
1. User memasukkan nominal di /topup (min Rp 1.000, maks Rp 500.000).
2. Frontend POST /topup/create; backend memvalidasi via Zod.
3. Backend memanggil gateway aktif untuk membuat QRIS, menyimpan TopUpOrder PENDING
   (provider, externalId, metadata berisi qrUrl/paymentLink/expiresAt).
4. Backend mengembalikan orderId, invoiceId, qrisImageUrl, paymentUrl, expiresAt.
5. Frontend menampilkan QR, menyimpan orderId ke localStorage, dan polling /topup/status tiap 3 detik.
   Saat app ditutup lalu dibuka lagi, order PENDING dipulihkan dari localStorage + status endpoint.

Konfirmasi pembayaran:
- Bayar.gg: gateway mengirim webhook POST /webhooks/bayar; backend verifikasi HMAC SHA256,
  lalu kredit wallet (atomic, idempotent) via creditTopUpOrder.
- MustikaPay: tidak ada webhook tepercaya. Konfirmasi terjadi lewat (a) poller background tiap 3 menit
  yang hanya jalan bila ada order PENDING, dan (b) tombol "Saya sudah bayar" / polling status endpoint —
  keduanya memanggil GET /api/v1/check/qris. Jika "success" → kredit (verifikasi nominal cocok);
  jika "expired" atau order lewat 20 menit → order ditandai CANCELED (auto-cancel; MustikaPay tidak
  punya endpoint cancel, QR mati sendiri via expiry=20).

Keamanan: kredit wallet selalu lewat creditTopUpOrder — atomic (satu transaction), idempotent
(tidak double-credit), dan menolak bila nominal terkonfirmasi tidak cocok dengan order.
```

- [ ] **Step 4: `dokumentasi-teknis.md` — env-vars table (section ~922)**

After the `BAYARGG_WEBHOOK_URL` row, add:

```
| TOPUP_PROVIDER | Pemilih gateway top-up: "bayar.gg" atau "mustika" |
| MUSTIKAPAY_API_KEY | MustikaPay API key (header X-Api-Key) |
| MUSTIKAPAY_BASE_URL | Base URL MustikaPay (default https://mustikapayment.com) |
```

- [ ] **Step 5: `backend/README.md` — payment line + services tree + env**

Change the Payment line (line ~11):

```
- **Payment:** Bayar.gg (QRIS, webhook) & MustikaPay (QRIS, polling) — selected by `TOPUP_PROVIDER`
```

In the services tree (near line ~125), add under `services/`:

```
│   │   ├── mustikaService.js   # MustikaPay payment gateway (QRIS, polling)
│   │   ├── topupPoller.js      # Background reconciliation for MustikaPay orders
```

In the setup/env section, note the new vars (`TOPUP_PROVIDER`, `MUSTIKAPAY_API_KEY`, `MUSTIKAPAY_BASE_URL`) and that MustikaPay needs no webhook secret.

- [ ] **Step 6: `backend/API_ROUTES.md` — top-up table + behavior**

Update the `/topup/*` rows and payloads (lines ~145-194):

```
| POST | `/topup/create` | Protected | Zod: `createTopUpSchema` | Create QRIS payment (provider via TOPUP_PROVIDER) |
| GET | `/topup/status/:reference` | Protected | — | Poll status; MustikaPay: active confirm + 20-min auto-cancel |
| POST | `/webhooks/bayar` | Public (signature verified) | — | Bayar.gg webhook (MustikaPay uses polling, no webhook) |
```

Update the `/topup/create` response example to be provider-agnostic (MustikaPay `ref_no` as `invoiceId`, `mustikapayment.com` URLs) and note that `GET /topup/status` returns `qrisImageUrl`/`paymentUrl`/`expiresAt` while pending and may report `CANCELED`. Update the `TOP_UP` trigger row (line ~449) to: `Bayar.gg webhook OR MustikaPay status check/poller confirms payment`.

- [ ] **Step 7: Commit**

```bash
git add docs/dokumentasi-teknis.md backend/README.md backend/API_ROUTES.md
git commit -m "docs: document MustikaPay polling provider alongside Bayar.gg"
```

---

## Self-Review

- **Spec coverage:** MustikaPay service create+check (T1-2), shared credit/idempotency/amount-check (T3), unhandledRejection fix (T4), provider switch (T5), enriched+active-confirm status & 20-min auto-cancel (T6), webhook refactor (T7), poller that skips when idle (T8), wiring+poller start (T9), frontend type (T10), "Saya sudah bayar" + localStorage restore (T11), env (T12), openapi sync incl. 11 missing endpoints (T13), prose docs (T14). All spec sections map to a task.
- **Type/name consistency:** `creditTopUpOrder(orderId, { confirmedAmount, providerName, paymentMeta })` is defined in T3 and called identically in T6/T7/T8. `checkMustikaStatus(refNo)` returns `{ status, amount, raw }` (T2) and is consumed by `.status`/`.amount` everywhere. `createMustikaQris` returns `{ refNo, qrUrl, paymentLink, amount }` (T1) used in T5. `MUSTIKA_PROVIDER="mustika"` and 20-min constants are consistent across T5/T6/T8. Status `CANCELED` matches the Prisma `UsageStatus` enum and the frontend type (T10).
- **Placeholders:** none — every code/test step has full content.

---

## Execution

Implement task-by-task with `superpowers:subagent-driven-development` (fresh subagent per task + review) or `superpowers:executing-plans` (inline with checkpoints). Each task ends in its own commit; run the relevant `bun run test -- <name>` before committing, and the full `bun run test` after Task 9.
