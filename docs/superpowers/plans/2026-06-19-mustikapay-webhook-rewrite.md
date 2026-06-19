# MustikaPay Webhook Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current dual-provider/polling top-up implementation with a MustikaPay-only, webhook-first QRIS flow that verifies callbacks via Check Status before crediting wallet balance.

**Architecture:** MustikaPay is the only payment provider. Webhook callbacks are acknowledged immediately and processed asynchronously; callback payloads are untrusted triggers, while MustikaPay Check Status is the confirmation source of truth. Status polling becomes DB-only; manual check and local auto-cancel are recovery/hygiene paths that do not reintroduce aggressive polling.

**Tech Stack:** Bun, Express 4, Prisma 6, MySQL, Vitest 4, Supertest, native `fetch`, ESM modules.

## Global Constraints

- Remove Bayar.gg support entirely: service, route, env docs, and tests.
- Remove MustikaPay polling entirely; no backend interval may call MustikaPay Check Status repeatedly.
- Do not send internal CUID/order IDs to MustikaPay QRIS; `/api/v1/create/qris` does not document `order_id` support.
- Store MustikaPay `ref_no` in `TopUpOrder.externalId` and match webhook payloads via `payload.reference || payload.data?.ref_no`.
- `GET /topup/status/:reference` must be DB-only and must never call MustikaPay.
- `POST /webhooks/mustika` must return `200 { "status": "received" }` immediately, then process async in-process.
- Webhook crediting must verify with `GET /api/v1/check/qris?ref_no=...` before wallet credit.
- Credit transaction must be atomic, idempotent, amount-verified, race-safe, and able to revive locally canceled paid orders.
- Manual check cooldown is 30 seconds per order/ref_no, in memory.
- Auto-cancel is local DB-only after 25 minutes, with a 5-minute interval.
- Production runs PM2 fork mode, not cluster mode.
- Existing production DB may be dropped/re-initialized; legacy data migration is out of scope.

## File Structure

Create:

- `backend/src/services/mustika/client.js` — MustikaPay HTTP client only. No Prisma imports.
- `backend/src/services/mustika/credit.js` — atomic DB transaction for verified top-up credit.
- `backend/src/services/mustika/webhook.js` — webhook payload extraction and async processing orchestration.
- `backend/src/services/mustika/reconcile.js` — manual check/cooldown and local auto-cancel.
- `backend/tests/services/mustika/client.test.js`
- `backend/tests/services/mustika/credit.test.js`
- `backend/tests/services/mustika/webhook.test.js`
- `backend/tests/services/mustika/reconcile.test.js`

Modify:

- `backend/src/controllers/topupController.js` — rewrite as thin Mustika-only controller.
- `backend/src/server.js` — remove Bayar webhook and poller startup; add Mustika webhook and manual check routes.
- `backend/src/services/databaseService.js` — remove old `creditTopUpOrder` export after replacement exists.
- `backend/.env.example` — remove Bayar/TOPUP_PROVIDER docs, keep Mustika vars.
- `backend/openapi.yaml` — update top-up/webhook API docs.
- `backend/README.md` — update provider description.
- `docs/dokumentasi-teknis.md` — update payment architecture from polling to webhook-first.
- `frontend/app/topup/page.tsx` — ensure status polling remains DB-only and add/use manual check action.
- `frontend/lib/api/topup.ts` — add manual check API helper if missing.
- Existing tests under `backend/tests/routes/topup.test.js` — rewrite for Mustika-only behavior.

Delete:

- `backend/src/services/bayarService.js`
- `backend/src/services/topupPoller.js`
- Old tests that only validate Bayar.gg behavior.

---

### Task 1: Remove Bayar.gg and Old Poller Wiring

**Files:**
- Delete: `backend/src/services/bayarService.js`
- Delete: `backend/src/services/topupPoller.js`
- Modify: `backend/src/server.js`
- Modify: `backend/src/controllers/topupController.js`
- Modify: `backend/tests/routes/topup.test.js`

**Interfaces:**
- Consumes: existing `handleCreateTopUp`, `handleGetTopUpStatus` names from `backend/src/controllers/topupController.js`.
- Produces: server route surface with no `/webhooks/bayar` and no `startTopUpPoller()` import/call. Later tasks will add `/webhooks/mustika` and `/topup/check/:reference`.

- [ ] **Step 1: Write failing route-surface tests**

Replace the route setup in `backend/tests/routes/topup.test.js` so it no longer imports Bayar handlers/services. At minimum, write tests that assert the old Bayar webhook is absent and status polling does not require any provider mock.

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createTestApp, mockUser } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import { handleCreateTopUp, handleGetTopUpStatus } from "../../src/controllers/topupController.js";

const createMockModel = () => ({ upsert: vi.fn() });

function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    app.post("/topup/create", requireAuth, handleCreateTopUp);
    app.get("/topup/status/:reference", requireAuth, handleGetTopUpStatus);
  }, { user });
}

describe("Top-up route surface", () => {
  beforeEach(() => {
    prisma.publicIdCounter ??= createMockModel();
    Object.values(prisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method?.mockReset === "function") method.mockReset();
        });
      }
    });
  });

  it("does not expose the old Bayar.gg webhook route", async () => {
    const app = buildApp();
    const res = await request(app).post("/webhooks/bayar").send({});
    expect(res.status).toBe(404);
  });

  it("GET /topup/status/:reference returns stored DB status without provider calls", async () => {
    prisma.topUpOrder.findFirst.mockResolvedValue({
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
    expect(prisma.topUpOrder.findFirst).toHaveBeenCalledWith({
      where: {
        userId: mockUser.id,
        OR: [{ id: "QR123" }, { externalId: "QR123" }],
      },
      select: expect.any(Object),
    });
  });
});
```

- [ ] **Step 2: Run the route-surface tests and verify they fail**

Run:

```bash
cd backend && bun test tests/routes/topup.test.js
```

Expected before implementation: FAIL because `handleBayarWebhook` imports/mocks may still exist, old route assumptions still exist, or controller still imports deleted/soon-to-delete Bayar code.

- [ ] **Step 3: Remove old server wiring**

In `backend/src/server.js`:

1. Remove the import of `startTopUpPoller` from `./services/topupPoller.js`.
2. Remove `handleBayarWebhook` from the top-up controller import list.
3. Remove this route:

```js
app.post("/webhooks/bayar", asyncHandler(handleBayarWebhook));
```

4. Remove these startup lines:

```js
startTopUpPoller();
console.log("MustikaPay top-up poller started (3-min interval)");
```

Do not add the new Mustika webhook route in this task; that belongs to a later task.

- [ ] **Step 4: Strip Bayar branches from controller enough to compile**

In `backend/src/controllers/topupController.js`, remove:

```js
import { createBayarPayment, verifyBayarWebhookSignature } from "../services/bayarService.js";
```

Remove the `handleBayarWebhook` export entirely.

Temporarily leave `handleCreateTopUp` Mustika-only using the existing `createMustikaQris` import until Task 2 replaces the client. The create handler should not read `TOPUP_PROVIDER` and should not branch to Bayar.

- [ ] **Step 5: Delete old service files**

Delete:

```bash
rm backend/src/services/bayarService.js backend/src/services/topupPoller.js
```

On Windows PowerShell equivalent:

```powershell
Remove-Item "backend/src/services/bayarService.js", "backend/src/services/topupPoller.js"
```

- [ ] **Step 6: Run tests for this task**

Run:

```bash
cd backend && bun test tests/routes/topup.test.js
```

Expected: route-surface tests pass, but other old tests in the file may still fail if they still assert Bayar behavior. Remove or rewrite remaining Bayar-specific tests in this file so this test file is Mustika-only.

- [ ] **Step 7: Commit**

```bash
git add backend/src/server.js backend/src/controllers/topupController.js backend/tests/routes/topup.test.js
git rm backend/src/services/bayarService.js backend/src/services/topupPoller.js
git commit -m "refactor(topup): remove Bayar and polling wiring"
```

---

### Task 2: Build MustikaPay HTTP Client

**Files:**
- Create: `backend/src/services/mustika/client.js`
- Create: `backend/tests/services/mustika/client.test.js`
- Modify: `backend/src/controllers/topupController.js` imports after client exists.

**Interfaces:**
- Produces:
  - `getMustikaConfig(): { apiKey: string, baseUrl: string }`
  - `createQris({ amount, productName, customerName, expiry, redirectUrl }): Promise<{ refNo: string, qrUrl: string, paymentLink: string, amount: number, raw: object }>`
  - `checkQrisStatus(refNo: string): Promise<{ refNo: string, status: string, amount?: number, netAmount?: number, issuer?: string, payor?: string, settleAt?: string, timestamp?: string, receiptUrl?: string, raw: object }>`
  - `MustikaHttpError extends Error` with fields `{ action, statusCode, body }`
- Consumes: native `fetch`, env vars `MUSTIKAPAY_API_KEY`, `MUSTIKAPAY_BASE_URL`.

- [ ] **Step 1: Write failing client tests**

Create `backend/tests/services/mustika/client.test.js`:

```js
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
```

- [ ] **Step 2: Run client tests and verify they fail**

Run:

```bash
cd backend && bun test tests/services/mustika/client.test.js
```

Expected: FAIL because `backend/src/services/mustika/client.js` does not exist.

- [ ] **Step 3: Implement `client.js`**

Create `backend/src/services/mustika/client.js`:

```js
const DEFAULT_BASE_URL = "https://mustikapayment.com";

const getEnvValue = (value) => (value ? value.trim() : "");
const normalizeBaseUrl = (value) => value.replace(/\/+$/, "");

export class MustikaHttpError extends Error {
  constructor(action, statusCode, body) {
    super(`MustikaPay ${action} failed: ${statusCode} ${body}`);
    this.name = "MustikaHttpError";
    this.action = action;
    this.statusCode = statusCode;
    this.body = body;
  }
}

export const getMustikaConfig = () => {
  const apiKey = getEnvValue(process.env.MUSTIKAPAY_API_KEY);
  const baseUrl = getEnvValue(process.env.MUSTIKAPAY_BASE_URL) || DEFAULT_BASE_URL;
  return { apiKey, baseUrl: normalizeBaseUrl(baseUrl) };
};

const requireApiKey = () => {
  const config = getMustikaConfig();
  if (!config.apiKey) {
    throw new Error("MustikaPay API key not configured");
  }
  return config;
};

const readNonOkBody = async (response) => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

export const createQris = async ({ amount, productName, customerName, expiry = 20, redirectUrl } = {}) => {
  const { apiKey, baseUrl } = requireApiKey();

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
    throw new MustikaHttpError("create-qris", response.status, await readNonOkBody(response));
  }

  const data = await response.json();
  if (data.status !== "success") {
    throw new Error(`MustikaPay create-qris returned status=${data.status} (expected status=success)`);
  }
  if (!data.ref_no) {
    throw new Error("MustikaPay create-qris missing ref_no");
  }

  return {
    refNo: data.ref_no,
    qrUrl: data.qr_url,
    paymentLink: data.payment_link,
    amount: data.amount == null ? undefined : Number(data.amount),
    raw: data,
  };
};

export const checkQrisStatus = async (refNo) => {
  const { apiKey, baseUrl } = requireApiKey();
  const url = `${baseUrl}/api/v1/check/qris?ref_no=${encodeURIComponent(refNo)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "X-Api-Key": apiKey },
  });

  if (!response.ok) {
    throw new MustikaHttpError("check-qris", response.status, await readNonOkBody(response));
  }

  const data = await response.json();
  return {
    refNo: data.ref_no,
    status: data.status,
    amount: data.amount == null ? undefined : Number(data.amount),
    netAmount: data.net_amount == null ? undefined : Number(data.net_amount),
    issuer: data.issuer,
    payor: data.payor,
    settleAt: data.settle_at,
    timestamp: data.timestamp,
    receiptUrl: data.receipt_url,
    raw: data,
  };
};
```

- [ ] **Step 4: Run client tests and verify they pass**

Run:

```bash
cd backend && bun test tests/services/mustika/client.test.js
```

Expected: PASS.

- [ ] **Step 5: Update imports away from old `mustikaService.js`**

In files that still import from `../services/mustikaService.js`, switch to the new client names only when needed:

```js
import { createQris, checkQrisStatus } from "../services/mustika/client.js";
```

Do not delete `backend/src/services/mustikaService.js` until all imports are moved in later tasks, unless `grep` confirms no references remain.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/mustika/client.js backend/tests/services/mustika/client.test.js backend/src/controllers/topupController.js
git commit -m "feat(mustika): add QRIS HTTP client"
```

---

### Task 3: Build Atomic MustikaPay Credit Transaction

**Files:**
- Create: `backend/src/services/mustika/credit.js`
- Create: `backend/tests/services/mustika/credit.test.js`
- Modify: `backend/src/services/databaseService.js`

**Interfaces:**
- Consumes:
  - Prisma client from `backend/src/prisma.js`.
  - `generatePublicId(tx, prefix, kind)` from `backend/src/services/publicIdService.js`.
- Produces:
  - `creditVerifiedTopUp(orderId: string, args: { verifyAmount: number, finalAmount?: number, providerMeta?: object, checkedVia: string }): Promise<{ credited: boolean, alreadyProcessed?: boolean, notFound?: boolean, userId?: string, amount?: number, revivedAfterCancel?: boolean }>`.
  - Later webhook/manual-check tasks rely on `creditVerifiedTopUp` being amount-verified and idempotent.

- [ ] **Step 1: Write failing unit tests for idempotent credit behavior**

Create `backend/tests/services/mustika/credit.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/prisma.js";
import { creditVerifiedTopUp } from "../../../src/services/mustika/credit.js";

const createMockModel = () => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
});

const tx = {
  topUpOrder: createMockModel(),
  user: createMockModel(),
  walletTransaction: createMockModel(),
  activityLog: createMockModel(),
  publicIdCounter: { upsert: vi.fn() },
};

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
    Object.values(tx).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method?.mockReset === "function") method.mockReset();
        });
      }
    });

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    tx.publicIdCounter.upsert.mockResolvedValue({ scope: "TXN-TOP-2606", nextNumber: 2 });
  });

  it("credits a pending order exactly once with ledger and activity rows", async () => {
    tx.topUpOrder.findUnique.mockResolvedValue(pendingOrder);
    tx.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.user.update.mockResolvedValue({ walletBalance: 150000 });
    tx.walletTransaction.create.mockResolvedValue({ id: "txn-1" });
    tx.activityLog.create.mockResolvedValue({ id: "log-1" });
    tx.topUpOrder.update.mockResolvedValue({ ...pendingOrder, status: "COMPLETED", finalAmount: 50000 });

    const result = await creditVerifiedTopUp("order-1", {
      verifyAmount: 50000,
      finalAmount: 50000,
      checkedVia: "mustika-webhook",
      providerMeta: { ref_no: "QR123", issuer: "GOPAY" },
    });

    expect(result).toEqual({ credited: true, userId: "user-1", amount: 50000, revivedAfterCancel: false });
    expect(tx.topUpOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: { in: ["PENDING", "CANCELED"] } },
      data: { status: "COMPLETED" },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { walletBalance: { increment: 50000 }, totalTopUp: { increment: 50000 } },
      select: { walletBalance: true },
    });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
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
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "TOP_UP",
        status: "SUCCESS",
        title: "Top up successful",
        amountRupiah: 50000,
      }),
    });
    expect(tx.topUpOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({
        finalAmount: 50000,
        metadata: expect.objectContaining({ qrUrl: "https://qr", ref_no: "QR123", checkedVia: "mustika-webhook" }),
      }),
    });
  });

  it("does not double-credit an already completed order", async () => {
    tx.topUpOrder.findUnique.mockResolvedValue({ ...pendingOrder, status: "COMPLETED" });

    const result = await creditVerifiedTopUp("order-1", {
      verifyAmount: 50000,
      checkedVia: "mustika-webhook",
      providerMeta: { ref_no: "QR123" },
    });

    expect(result).toEqual({ credited: false, alreadyProcessed: true, userId: "user-1" });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("fails closed on amount mismatch before claiming", async () => {
    tx.topUpOrder.findUnique.mockResolvedValue(pendingOrder);

    await expect(creditVerifiedTopUp("order-1", {
      verifyAmount: 49999,
      checkedVia: "mustika-webhook",
      providerMeta: { ref_no: "QR123" },
    })).rejects.toThrow("Top-up amount verification failed: provider 49999 != order 50000");

    expect(tx.topUpOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("revives a locally canceled order when provider verifies payment", async () => {
    tx.topUpOrder.findUnique.mockResolvedValue({ ...pendingOrder, status: "CANCELED" });
    tx.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.user.update.mockResolvedValue({ walletBalance: 150000 });
    tx.walletTransaction.create.mockResolvedValue({ id: "txn-1" });
    tx.activityLog.create.mockResolvedValue({ id: "log-1" });
    tx.topUpOrder.update.mockResolvedValue({ ...pendingOrder, status: "COMPLETED" });

    const result = await creditVerifiedTopUp("order-1", {
      verifyAmount: 50000,
      checkedVia: "manual-check",
      providerMeta: { ref_no: "QR123" },
    });

    expect(result.revivedAfterCancel).toBe(true);
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: "Top up successful (late payment)" }),
    });
  });

  it("does not credit when another concurrent processor already claimed the order", async () => {
    tx.topUpOrder.findUnique.mockResolvedValue(pendingOrder);
    tx.topUpOrder.updateMany.mockResolvedValue({ count: 0 });

    const result = await creditVerifiedTopUp("order-1", {
      verifyAmount: 50000,
      checkedVia: "mustika-webhook",
      providerMeta: { ref_no: "QR123" },
    });

    expect(result).toEqual({ credited: false, alreadyProcessed: true, userId: "user-1" });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("returns notFound when order does not exist", async () => {
    tx.topUpOrder.findUnique.mockResolvedValue(null);

    const result = await creditVerifiedTopUp("missing", {
      verifyAmount: 50000,
      checkedVia: "mustika-webhook",
      providerMeta: { ref_no: "QR123" },
    });

    expect(result).toEqual({ credited: false, notFound: true });
  });
});
```

- [ ] **Step 2: Run credit tests and verify they fail**

Run:

```bash
cd backend && bun test tests/services/mustika/credit.test.js
```

Expected: FAIL because `backend/src/services/mustika/credit.js` does not exist.

- [ ] **Step 3: Implement `credit.js`**

Create `backend/src/services/mustika/credit.js`:

```js
import { prisma } from "../../prisma.js";
import { generatePublicId } from "../publicIdService.js";

const TOP_UP_REFERENCE_TYPE = "TOP_UP_ORDER";
const MUSTIKA_PROVIDER = "mustika";

const normalizeProviderMeta = ({ checkedVia, providerMeta }) => ({
  ...(providerMeta || {}),
  checkedVia,
  provider: MUSTIKA_PROVIDER,
});

export async function creditVerifiedTopUp(orderId, { verifyAmount, finalAmount, checkedVia, providerMeta = {} } = {}) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.topUpOrder.findUnique({ where: { id: orderId } });
    if (!order) return { credited: false, notFound: true };
    if (order.status === "COMPLETED") return { credited: false, alreadyProcessed: true, userId: order.userId };

    if (!Number.isFinite(verifyAmount) || verifyAmount !== order.amountRupiah) {
      throw new Error(`Top-up amount verification failed: provider ${verifyAmount} != order ${order.amountRupiah}`);
    }

    const wasCanceled = order.status === "CANCELED";
    const claim = await tx.topUpOrder.updateMany({
      where: { id: order.id, status: { in: ["PENDING", "CANCELED"] } },
      data: { status: "COMPLETED" },
    });

    if (claim.count === 0) {
      return { credited: false, alreadyProcessed: true, userId: order.userId };
    }

    const amount = order.amountRupiah;
    const paymentMeta = normalizeProviderMeta({ checkedVia, providerMeta });

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
        referenceType: TOP_UP_REFERENCE_TYPE,
        referenceId: order.id,
        description: `Top up Rp ${amount.toLocaleString("id-ID")} via MustikaPay`,
        metadata: paymentMeta,
      },
    });

    await tx.activityLog.create({
      data: {
        userId: order.userId,
        type: "TOP_UP",
        status: "SUCCESS",
        title: wasCanceled ? "Top up successful (late payment)" : "Top up successful",
        description: `Top up Rp ${amount.toLocaleString("id-ID")}`,
        amountRupiah: amount,
        metadata: paymentMeta,
      },
    });

    await tx.topUpOrder.update({
      where: { id: order.id },
      data: {
        finalAmount: typeof finalAmount === "number" ? finalAmount : amount,
        metadata: { ...(order.metadata || {}), ...paymentMeta },
      },
    });

    if (wasCanceled) {
      console.warn(`[topup] REVIVED canceled order ${order.id} after MustikaPay verified payment — user ${order.userId} credited ${amount}`);
    }

    return { credited: true, userId: order.userId, amount, revivedAfterCancel: wasCanceled };
  });
}
```

- [ ] **Step 4: Remove old `creditTopUpOrder` export**

In `backend/src/services/databaseService.js`, delete the old `creditTopUpOrder` function after all imports have been moved to `creditVerifiedTopUp`. If other non-topup code imports `creditTopUpOrder`, update that code to use the new Mustika-specific function only when it is part of top-up processing.

- [ ] **Step 5: Run credit tests and verify they pass**

Run:

```bash
cd backend && bun test tests/services/mustika/credit.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/mustika/credit.js backend/tests/services/mustika/credit.test.js backend/src/services/databaseService.js
git commit -m "feat(mustika): add verified topup credit transaction"
```

---

### Task 4: Build Webhook Extraction and Async Processor

**Files:**
- Create: `backend/src/services/mustika/webhook.js`
- Create: `backend/tests/services/mustika/webhook.test.js`

**Interfaces:**
- Consumes:
  - `checkQrisStatus(refNo)` from `backend/src/services/mustika/client.js`.
  - `creditVerifiedTopUp(orderId, args)` from `backend/src/services/mustika/credit.js`.
  - Prisma `topUpOrder.findUnique`.
- Produces:
  - `extractWebhookRefNo(payload: object): string | null`
  - `shouldProcessWebhook(payload: object): boolean`
  - `processMustikaWebhook(payload: object): Promise<{ processed: boolean, reason?: string, credited?: boolean }>`

- [ ] **Step 1: Write failing webhook tests**

Create `backend/tests/services/mustika/webhook.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/prisma.js";
import { extractWebhookRefNo, shouldProcessWebhook, processMustikaWebhook } from "../../../src/services/mustika/webhook.js";
import { checkQrisStatus } from "../../../src/services/mustika/client.js";
import { creditVerifiedTopUp } from "../../../src/services/mustika/credit.js";

vi.mock("../../../src/services/mustika/client.js", () => ({
  checkQrisStatus: vi.fn(),
}));

vi.mock("../../../src/services/mustika/credit.js", () => ({
  creditVerifiedTopUp: vi.fn(),
}));

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
    prisma.topUpOrder.findUnique.mockReset();
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
    prisma.topUpOrder.findUnique.mockResolvedValue(order);
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
    expect(prisma.topUpOrder.findUnique).toHaveBeenCalledWith({ where: { externalId: "QR123" } });
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
    prisma.topUpOrder.findUnique.mockResolvedValue(null);

    const result = await processMustikaWebhook(webhookPayload);

    expect(result).toEqual({ processed: false, reason: "order_not_found" });
    expect(checkQrisStatus).not.toHaveBeenCalled();
    expect(creditVerifiedTopUp).not.toHaveBeenCalled();
  });

  it("does not credit when check-status is not success", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue(order);
    checkQrisStatus.mockResolvedValue({ refNo: "QR123", status: "pending", amount: 22500, raw: {} });

    const result = await processMustikaWebhook(webhookPayload);

    expect(result).toEqual({ processed: false, reason: "provider_status_pending" });
    expect(creditVerifiedTopUp).not.toHaveBeenCalled();
  });

  it("does not credit when check-status ref_no mismatches", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue(order);
    checkQrisStatus.mockResolvedValue({ refNo: "QR999", status: "success", amount: 22500, raw: {} });

    const result = await processMustikaWebhook(webhookPayload);

    expect(result).toEqual({ processed: false, reason: "ref_no_mismatch" });
    expect(creditVerifiedTopUp).not.toHaveBeenCalled();
  });

  it("does not credit when amount mismatches", async () => {
    prisma.topUpOrder.findUnique.mockResolvedValue(order);
    checkQrisStatus.mockResolvedValue({ refNo: "QR123", status: "success", amount: 22499, raw: {} });

    const result = await processMustikaWebhook(webhookPayload);

    expect(result).toEqual({ processed: false, reason: "amount_mismatch" });
    expect(creditVerifiedTopUp).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run webhook tests and verify they fail**

Run:

```bash
cd backend && bun test tests/services/mustika/webhook.test.js
```

Expected: FAIL because `backend/src/services/mustika/webhook.js` does not exist.

- [ ] **Step 3: Implement `webhook.js`**

Create `backend/src/services/mustika/webhook.js`:

```js
import { prisma } from "../../prisma.js";
import { checkQrisStatus } from "./client.js";
import { creditVerifiedTopUp } from "./credit.js";

const MUSTIKA_PROVIDER = "mustika";

export const extractWebhookRefNo = (payload) => {
  const refNo = payload?.reference || payload?.data?.ref_no;
  return typeof refNo === "string" && refNo.trim() ? refNo.trim() : null;
};

export const shouldProcessWebhook = (payload) => {
  return payload?.status === "success" && payload?.service === "QRIS";
};

const buildProviderMeta = ({ payload, check }) => ({
  ref_no: check.refNo,
  net_amount: check.netAmount,
  issuer: check.issuer,
  payor: check.payor,
  settle_at: check.settleAt,
  timestamp: check.timestamp,
  receipt_url: check.receiptUrl,
  webhookStatus: payload?.status,
  webhookService: payload?.service,
  webhookAmount: payload?.amount,
  webhookTimestamp: payload?.timestamp,
  webhookProviderRef: payload?.data?.provider_ref,
  webhookRrn: payload?.data?.rrn,
  providerRaw: check.raw,
});

export async function processMustikaWebhook(payload) {
  if (!shouldProcessWebhook(payload)) {
    return { processed: false, reason: "ignored_event" };
  }

  const refNo = extractWebhookRefNo(payload);
  if (!refNo) {
    console.warn("[mustika webhook] missing ref_no", { status: payload?.status, service: payload?.service });
    return { processed: false, reason: "missing_ref_no" };
  }

  const order = await prisma.topUpOrder.findUnique({ where: { externalId: refNo } });
  if (!order) {
    console.warn(`[mustika webhook] order not found for ref_no ${refNo}`);
    return { processed: false, reason: "order_not_found" };
  }

  if (order.provider !== MUSTIKA_PROVIDER) {
    console.warn(`[mustika webhook] ref_no ${refNo} belongs to provider ${order.provider}, not mustika`);
    return { processed: false, reason: "provider_mismatch" };
  }

  if (order.status === "COMPLETED") {
    return { processed: true, credited: false, reason: "already_completed" };
  }

  const check = await checkQrisStatus(refNo);
  if (check.status !== "success") {
    console.warn(`[mustika webhook] provider status for ${refNo} is ${check.status}, not success`);
    return { processed: false, reason: `provider_status_${check.status}` };
  }

  if (check.refNo !== order.externalId) {
    console.warn(`[mustika webhook] ref_no mismatch for order ${order.id}: check=${check.refNo} order=${order.externalId}`);
    return { processed: false, reason: "ref_no_mismatch" };
  }

  if (check.amount !== order.amountRupiah) {
    console.warn(`[mustika webhook] amount mismatch for order ${order.id}: check=${check.amount} order=${order.amountRupiah}`);
    return { processed: false, reason: "amount_mismatch" };
  }

  const credit = await creditVerifiedTopUp(order.id, {
    verifyAmount: check.amount,
    finalAmount: check.amount,
    checkedVia: "mustika-webhook",
    providerMeta: buildProviderMeta({ payload, check }),
  });

  return { processed: true, credited: Boolean(credit.credited) };
}
```

- [ ] **Step 4: Run webhook tests and verify they pass**

Run:

```bash
cd backend && bun test tests/services/mustika/webhook.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mustika/webhook.js backend/tests/services/mustika/webhook.test.js
git commit -m "feat(mustika): verify webhook callbacks before credit"
```

---

### Task 5: Build Manual Check, Cooldown, and Auto-Cancel Reconciliation

**Files:**
- Create: `backend/src/services/mustika/reconcile.js`
- Create: `backend/tests/services/mustika/reconcile.test.js`

**Interfaces:**
- Consumes:
  - `checkQrisStatus(refNo)` from `backend/src/services/mustika/client.js`.
  - `creditVerifiedTopUp(orderId, args)` from `backend/src/services/mustika/credit.js`.
  - Prisma `topUpOrder` queries/updates.
- Produces:
  - `MANUAL_CHECK_COOLDOWN_MS = 30_000`
  - `AUTO_CANCEL_AFTER_MS = 25 * 60 * 1000`
  - `manualCheckTopUp({ userId, reference, now = Date.now() }): Promise<{ ok: true, status: string, paid: boolean, cooldownRemainingMs?: number, order?: object } | { ok: false, statusCode: number, error: string }>`
  - `cancelExpiredOrders(now = new Date()): Promise<{ canceled: number }>`
  - `startAutoCanceler(intervalMs = 5 * 60 * 1000): NodeJS.Timer`
  - `resetManualCheckCooldowns()` for tests.

- [ ] **Step 1: Write failing reconciliation tests**

Create `backend/tests/services/mustika/reconcile.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/prisma.js";
import { checkQrisStatus } from "../../../src/services/mustika/client.js";
import { creditVerifiedTopUp } from "../../../src/services/mustika/credit.js";
import { manualCheckTopUp, cancelExpiredOrders, resetManualCheckCooldowns } from "../../../src/services/mustika/reconcile.js";

vi.mock("../../../src/services/mustika/client.js", () => ({
  checkQrisStatus: vi.fn(),
}));

vi.mock("../../../src/services/mustika/credit.js", () => ({
  creditVerifiedTopUp: vi.fn(),
}));

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
    prisma.topUpOrder.findFirst.mockReset();
    prisma.topUpOrder.updateMany.mockReset();
  });

  it("returns 404 when manual check order is not found or not owned by user", async () => {
    prisma.topUpOrder.findFirst.mockResolvedValue(null);

    const result = await manualCheckTopUp({ userId: "user-1", reference: "QR404", now: 1000 });

    expect(result).toEqual({ ok: false, statusCode: 404, error: "Order not found" });
    expect(checkQrisStatus).not.toHaveBeenCalled();
  });

  it("does not call provider for completed orders", async () => {
    prisma.topUpOrder.findFirst.mockResolvedValue({ ...pendingOrder, status: "COMPLETED", finalAmount: 50000 });

    const result = await manualCheckTopUp({ userId: "user-1", reference: "QR123", now: 1000 });

    expect(result).toMatchObject({ ok: true, status: "COMPLETED", paid: true });
    expect(checkQrisStatus).not.toHaveBeenCalled();
  });

  it("checks provider, credits on verified success, and starts cooldown", async () => {
    prisma.topUpOrder.findFirst.mockResolvedValue(pendingOrder);
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
    prisma.topUpOrder.findFirst.mockResolvedValue(pendingOrder);
    prisma.topUpOrder.updateMany.mockResolvedValue({ count: 1 });
    checkQrisStatus.mockResolvedValue({ refNo: "QR123", status: "expired", amount: undefined, raw: { status: "expired" } });

    const result = await manualCheckTopUp({ userId: "user-1", reference: "QR123", now: 1000 });

    expect(result).toMatchObject({ ok: true, status: "CANCELED", paid: false });
    expect(prisma.topUpOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "PENDING" },
      data: { status: "CANCELED", metadata: expect.objectContaining({ checkedVia: "manual-check", providerStatus: "expired" }) },
    });
    expect(creditVerifiedTopUp).not.toHaveBeenCalled();
  });

  it("does not credit on amount mismatch", async () => {
    prisma.topUpOrder.findFirst.mockResolvedValue(pendingOrder);
    checkQrisStatus.mockResolvedValue({ refNo: "QR123", status: "success", amount: 49999, raw: {} });

    const result = await manualCheckTopUp({ userId: "user-1", reference: "QR123", now: 1000 });

    expect(result).toEqual({ ok: false, statusCode: 409, error: "Payment verification mismatch" });
    expect(creditVerifiedTopUp).not.toHaveBeenCalled();
  });

  it("auto-cancels pending Mustika orders older than 25 minutes", async () => {
    prisma.topUpOrder.updateMany.mockResolvedValue({ count: 3 });

    const result = await cancelExpiredOrders(new Date("2026-06-19T13:30:00.000Z"));

    expect(result).toEqual({ canceled: 3 });
    expect(prisma.topUpOrder.updateMany).toHaveBeenCalledWith({
      where: {
        provider: "mustika",
        status: "PENDING",
        createdAt: { lt: new Date("2026-06-19T13:05:00.000Z") },
      },
      data: { status: "CANCELED" },
    });
  });
});
```

- [ ] **Step 2: Run reconciliation tests and verify they fail**

Run:

```bash
cd backend && bun test tests/services/mustika/reconcile.test.js
```

Expected: FAIL because `backend/src/services/mustika/reconcile.js` does not exist.

- [ ] **Step 3: Implement `reconcile.js`**

Create `backend/src/services/mustika/reconcile.js`:

```js
import { prisma } from "../../prisma.js";
import { checkQrisStatus } from "./client.js";
import { creditVerifiedTopUp } from "./credit.js";

export const MANUAL_CHECK_COOLDOWN_MS = 30 * 1000;
export const AUTO_CANCEL_AFTER_MS = 25 * 60 * 1000;
const DEFAULT_AUTO_CANCEL_INTERVAL_MS = 5 * 60 * 1000;
const MUSTIKA_PROVIDER = "mustika";

const manualCheckCooldowns = new Map();

export const resetManualCheckCooldowns = () => {
  manualCheckCooldowns.clear();
};

const findUserOrder = (userId, reference) => prisma.topUpOrder.findFirst({
  where: {
    userId,
    OR: [{ id: reference }, { externalId: reference }],
  },
});

const buildProviderMeta = (check) => ({
  ref_no: check.refNo,
  net_amount: check.netAmount,
  issuer: check.issuer,
  payor: check.payor,
  settle_at: check.settleAt,
  timestamp: check.timestamp,
  receipt_url: check.receiptUrl,
  providerStatus: check.status,
  providerRaw: check.raw,
});

const cooldownKeyFor = (order) => order.externalId || order.id;

const getCooldownRemainingMs = (key, now) => {
  const last = manualCheckCooldowns.get(key);
  if (!last) return 0;
  return Math.max(0, MANUAL_CHECK_COOLDOWN_MS - (now - last));
};

export async function manualCheckTopUp({ userId, reference, now = Date.now() }) {
  const order = await findUserOrder(userId, reference);
  if (!order) {
    return { ok: false, statusCode: 404, error: "Order not found" };
  }

  if (order.status === "COMPLETED") {
    return { ok: true, status: "COMPLETED", paid: true, order };
  }
  if (order.status === "CANCELED") {
    return { ok: true, status: "CANCELED", paid: false, order };
  }

  const key = cooldownKeyFor(order);
  const cooldownRemainingMs = getCooldownRemainingMs(key, now);
  if (cooldownRemainingMs > 0) {
    return { ok: true, status: order.status, paid: false, cooldownRemainingMs, order };
  }
  manualCheckCooldowns.set(key, now);

  const check = await checkQrisStatus(order.externalId);

  if (check.status === "expired") {
    await prisma.topUpOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "CANCELED", metadata: { ...(order.metadata || {}), checkedVia: "manual-check", providerStatus: "expired" } },
    });
    return { ok: true, status: "CANCELED", paid: false, order: { ...order, status: "CANCELED" } };
  }

  if (check.status !== "success") {
    return { ok: true, status: order.status, paid: false, order };
  }

  if (check.refNo !== order.externalId || check.amount !== order.amountRupiah) {
    console.warn(`[mustika manual-check] verification mismatch for order ${order.id}: ref=${check.refNo}/${order.externalId} amount=${check.amount}/${order.amountRupiah}`);
    return { ok: false, statusCode: 409, error: "Payment verification mismatch" };
  }

  await creditVerifiedTopUp(order.id, {
    verifyAmount: check.amount,
    finalAmount: check.amount,
    checkedVia: "manual-check",
    providerMeta: buildProviderMeta(check),
  });

  return { ok: true, status: "COMPLETED", paid: true, order: { ...order, status: "COMPLETED", finalAmount: check.amount } };
}

export async function cancelExpiredOrders(now = new Date()) {
  const cutoff = new Date(now.getTime() - AUTO_CANCEL_AFTER_MS);
  const result = await prisma.topUpOrder.updateMany({
    where: {
      provider: MUSTIKA_PROVIDER,
      status: "PENDING",
      createdAt: { lt: cutoff },
    },
    data: { status: "CANCELED" },
  });
  return { canceled: result.count };
}

export function startAutoCanceler(intervalMs = DEFAULT_AUTO_CANCEL_INTERVAL_MS) {
  console.log(`[reconcile] auto-cancel started (${intervalMs}ms interval, expiry ${AUTO_CANCEL_AFTER_MS}ms)`);
  const timer = setInterval(() => {
    cancelExpiredOrders().catch((err) => {
      console.error("[reconcile] auto-cancel run failed:", err.message);
    });
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}
```

- [ ] **Step 4: Run reconciliation tests and verify they pass**

Run:

```bash
cd backend && bun test tests/services/mustika/reconcile.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mustika/reconcile.js backend/tests/services/mustika/reconcile.test.js
git commit -m "feat(mustika): add manual check and local cancel"
```

---

### Task 6: Rewrite Top-Up Controller and Routes

**Files:**
- Modify: `backend/src/controllers/topupController.js`
- Modify: `backend/src/server.js`
- Modify: `backend/tests/routes/topup.test.js`

**Interfaces:**
- Consumes:
  - `createQris` from `backend/src/services/mustika/client.js`.
  - `processMustikaWebhook` from `backend/src/services/mustika/webhook.js`.
  - `manualCheckTopUp`, `startAutoCanceler` from `backend/src/services/mustika/reconcile.js`.
  - `generatePublicId` from `backend/src/services/publicIdService.js`.
- Produces controller exports:
  - `handleCreateTopUp(req, res)`
  - `handleGetTopUpStatus(req, res)`
  - `handleManualCheckTopUp(req, res)`
  - `handleMustikaWebhook(req, res)`

- [ ] **Step 1: Write/replace route tests for Mustika-only behavior**

Rewrite `backend/tests/routes/topup.test.js` to cover the final route surface. Keep existing auth/min/max amount tests, but remove Bayar and `TOPUP_PROVIDER` tests.

Add these mocks at the top:

```js
vi.mock("../../src/services/mustika/client.js", () => ({
  createQris: vi.fn().mockResolvedValue({
    refNo: "QR123",
    qrUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR123",
    paymentLink: "https://mustikapayment.com/pay/QR123",
    amount: 50000,
    raw: { status: "success", ref_no: "QR123" },
  }),
}));

vi.mock("../../src/services/mustika/webhook.js", () => ({
  processMustikaWebhook: vi.fn().mockResolvedValue({ processed: true, credited: true }),
}));

vi.mock("../../src/services/mustika/reconcile.js", () => ({
  manualCheckTopUp: vi.fn(),
}));
```

Route setup:

```js
function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    app.post("/topup/create", requireAuth, handleCreateTopUp);
    app.get("/topup/status/:reference", requireAuth, handleGetTopUpStatus);
    app.post("/topup/check/:reference", requireAuth, handleManualCheckTopUp);
    app.post("/webhooks/mustika", handleMustikaWebhook);
  }, { user });
}
```

Add tests:

```js
it("creates a MustikaPay QRIS order and stores ref_no as externalId", async () => {
  prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TOP-IDR-2606", nextNumber: 2 });
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  prisma.topUpOrder.create.mockResolvedValue({
    id: "order-1",
    publicId: "TOP-IDR-2606-000001",
    userId: mockUser.id,
    provider: "mustika",
    externalId: null,
    amountRupiah: 50000,
    status: "PENDING",
    metadata: null,
  });
  prisma.topUpOrder.update.mockResolvedValue({
    id: "order-1",
    publicId: "TOP-IDR-2606-000001",
    externalId: "QR123",
    amountRupiah: 50000,
    status: "PENDING",
    metadata: {
      qrUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR123",
      paymentLink: "https://mustikapayment.com/pay/QR123",
      expiresAt: expect.any(String),
    },
  });

  const app = buildApp();
  const res = await request(app).post("/topup/create").send({ amount: 50000 });

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({
    ok: true,
    orderId: "order-1",
    publicId: "TOP-IDR-2606-000001",
    invoiceId: "QR123",
    amount: 50000,
    paymentUrl: "https://mustikapayment.com/pay/QR123",
    qrisImageUrl: "https://mustikapayment.com/api/qr?data=000201&ref_no=QR123",
  });
  expect(prisma.topUpOrder.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ provider: "mustika", externalId: null, status: "PENDING" }),
  });
  expect(prisma.topUpOrder.update).toHaveBeenCalledWith({
    where: { id: "order-1" },
    data: expect.objectContaining({ externalId: "QR123" }),
  });
});

it("webhook responds received immediately and starts async processing", async () => {
  const { processMustikaWebhook } = await import("../../src/services/mustika/webhook.js");
  const app = buildApp();

  const res = await request(app).post("/webhooks/mustika").send({ status: "success", service: "QRIS", reference: "QR123" });

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: "received" });
  await new Promise((resolve) => setImmediate(resolve));
  expect(processMustikaWebhook).toHaveBeenCalledWith({ status: "success", service: "QRIS", reference: "QR123" });
});

it("manual check maps service result to HTTP response", async () => {
  const { manualCheckTopUp } = await import("../../src/services/mustika/reconcile.js");
  manualCheckTopUp.mockResolvedValue({ ok: true, status: "COMPLETED", paid: true });

  const app = buildApp();
  const res = await request(app).post("/topup/check/QR123").send();

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true, status: "COMPLETED", paid: true });
  expect(manualCheckTopUp).toHaveBeenCalledWith({ userId: mockUser.id, reference: "QR123" });
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
cd backend && bun test tests/routes/topup.test.js
```

Expected: FAIL because controller/routes are not rewritten yet.

- [ ] **Step 3: Rewrite `topupController.js`**

Replace `backend/src/controllers/topupController.js` with a Mustika-only controller:

```js
import { prisma } from "../prisma.js";
import { createQris } from "../services/mustika/client.js";
import { processMustikaWebhook } from "../services/mustika/webhook.js";
import { manualCheckTopUp } from "../services/mustika/reconcile.js";
import { generatePublicId } from "../services/publicIdService.js";

const MIN_TOPUP_AMOUNT = 1000;
const MAX_QRIS_AMOUNT = 500000;
const MUSTIKA_PROVIDER = "mustika";
const MUSTIKA_EXPIRY_MIN = 20;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const buildExpiresAt = () => new Date(Date.now() + MUSTIKA_EXPIRY_MIN * 60 * 1000).toISOString();

const buildStatusResponse = (order, status = order.status) => {
  const meta = order.metadata || {};
  return {
    ok: true,
    publicId: order.publicId,
    paid: status === "COMPLETED",
    status,
    amount: order.amountRupiah,
    finalAmount: order.finalAmount,
    qrisImageUrl: meta.qrUrl || null,
    paymentUrl: meta.paymentLink || null,
    expiresAt: meta.expiresAt || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

export const handleCreateTopUp = async (req, res) => {
  const amount = toNumber(req.body?.amount);
  if (!Number.isInteger(amount)) return res.status(400).json({ error: "Amount must be an integer" });
  if (amount < MIN_TOPUP_AMOUNT) return res.status(400).json({ error: "Amount must be at least 1000" });
  if (amount > MAX_QRIS_AMOUNT) return res.status(400).json({ error: "Amount exceeds QRIS limit" });

  const customerName = req.body?.customer_name;
  const redirectUrl = `${process.env.FRONTEND_URL || ""}/topup`;
  const expiresAt = buildExpiresAt();

  const order = await prisma.$transaction(async (tx) => {
    const publicId = await generatePublicId(tx, "TOP", "IDR");
    return tx.topUpOrder.create({
      data: {
        publicId,
        userId: req.user.id,
        provider: MUSTIKA_PROVIDER,
        externalId: null,
        amountRupiah: amount,
        finalAmount: null,
        status: "PENDING",
        metadata: { expiresAt },
      },
    });
  });

  try {
    const payment = await createQris({
      amount,
      productName: `Top up Rp ${amount.toLocaleString("id-ID")}`,
      customerName,
      expiry: MUSTIKA_EXPIRY_MIN,
      redirectUrl,
    });

    const metadata = {
      ...(order.metadata || {}),
      qrUrl: payment.qrUrl,
      paymentLink: payment.paymentLink,
      expiresAt,
      createRaw: payment.raw,
    };

    const updated = await prisma.topUpOrder.update({
      where: { id: order.id },
      data: { externalId: payment.refNo, metadata },
    });

    return res.status(201).json({
      ok: true,
      orderId: updated.id,
      publicId: updated.publicId,
      invoiceId: payment.refNo,
      amount,
      paymentUrl: payment.paymentLink,
      qrisImageUrl: payment.qrUrl,
      expiresAt,
    });
  } catch (err) {
    await prisma.topUpOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "FAILED", metadata: { ...(order.metadata || {}), createError: err.message } },
    });
    throw err;
  }
};

export const handleGetTopUpStatus = async (req, res) => {
  const { reference } = req.params;
  if (!reference) return res.status(400).json({ error: "Reference is required" });

  const order = await prisma.topUpOrder.findFirst({
    where: { userId: req.user.id, OR: [{ id: reference }, { externalId: reference }] },
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

  if (!order) return res.status(404).json({ error: "Order not found" });
  return res.status(200).json(buildStatusResponse(order));
};

export const handleManualCheckTopUp = async (req, res) => {
  const { reference } = req.params;
  if (!reference) return res.status(400).json({ error: "Reference is required" });

  const result = await manualCheckTopUp({ userId: req.user.id, reference });
  if (!result.ok) return res.status(result.statusCode).json({ error: result.error });
  return res.status(200).json(result);
};

export const handleMustikaWebhook = async (req, res) => {
  res.status(200).json({ status: "received" });
  processMustikaWebhook(req.body).catch((err) => {
    console.error("[mustika webhook] processing failed:", err);
  });
};
```

- [ ] **Step 4: Update `server.js` routes and startup**

In `backend/src/server.js`, import:

```js
import { handleCreateTopUp, handleGetTopUpStatus, handleManualCheckTopUp, handleMustikaWebhook } from "./controllers/topupController.js";
import { startAutoCanceler } from "./services/mustika/reconcile.js";
```

Top-up routes:

```js
app.post("/topup/create", requireAuth, topupLimiter, validate(createTopUpSchema), asyncHandler(handleCreateTopUp));
app.get("/topup/status/:reference", requireAuth, topupStatusLimiter, asyncHandler(handleGetTopUpStatus));
app.post("/topup/check/:reference", requireAuth, topupStatusLimiter, asyncHandler(handleManualCheckTopUp));
app.post("/webhooks/mustika", handleMustikaWebhook);
```

Startup:

```js
app.listen(port, () => {
  console.log(`Upload API listening on http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  startAutoCanceler();
});
```

- [ ] **Step 5: Run route tests and verify they pass**

Run:

```bash
cd backend && bun test tests/routes/topup.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/topupController.js backend/src/server.js backend/tests/routes/topup.test.js
git commit -m "feat(topup): switch routes to Mustika webhook flow"
```

---

### Task 7: Update Frontend Manual Check API and UI

**Files:**
- Modify: `frontend/lib/api/topup.ts`
- Modify: `frontend/app/topup/page.tsx`

**Interfaces:**
- Consumes backend route `POST /topup/check/:reference`.
- Produces frontend helper:
  - `checkTopUpNow(reference: string): Promise<TopUpStatusResponse & { cooldownRemainingMs?: number }>`

- [ ] **Step 1: Add API helper**

In `frontend/lib/api/topup.ts`, add or update:

```ts
export interface TopUpStatusResponse {
  ok: boolean;
  publicId?: string;
  paid: boolean;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELED';
  amount?: number;
  finalAmount?: number | null;
  qrisImageUrl?: string | null;
  paymentUrl?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  cooldownRemainingMs?: number;
}

export async function checkTopUpNow(reference: string): Promise<TopUpStatusResponse> {
  const res = await fetch(`${API_BASE_URL}/topup/check/${encodeURIComponent(reference)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to check payment status');
  }
  return data;
}
```

Match the existing API helper style in this file: if it already uses a shared `apiFetch`, use that instead of raw `fetch`.

- [ ] **Step 2: Add manual check button behavior in top-up page**

In `frontend/app/topup/page.tsx`:

1. Import `checkTopUpNow`.
2. Add state:

```tsx
const [manualCheckLoading, setManualCheckLoading] = useState(false);
const [manualCheckCooldownUntil, setManualCheckCooldownUntil] = useState<number>(0);
const [manualCheckMessage, setManualCheckMessage] = useState<string | null>(null);
```

3. Add handler:

```tsx
const handleManualCheck = async () => {
  if (!currentOrderId || manualCheckLoading) return;
  const now = Date.now();
  if (manualCheckCooldownUntil > now) {
    const seconds = Math.ceil((manualCheckCooldownUntil - now) / 1000);
    setManualCheckMessage(`Tunggu ${seconds} detik sebelum cek ulang.`);
    return;
  }

  setManualCheckLoading(true);
  setManualCheckMessage(null);
  try {
    const status = await checkTopUpNow(currentOrderId);
    if (status.cooldownRemainingMs) {
      setManualCheckCooldownUntil(Date.now() + status.cooldownRemainingMs);
      setManualCheckMessage('Cek status terlalu cepat. Coba lagi sebentar lagi.');
      return;
    }
    if (status.paid || status.status === 'COMPLETED') {
      setStep('success');
      clearPolling();
      return;
    }
    if (status.status === 'CANCELED' || status.status === 'FAILED') {
      setStep('failed');
      clearPolling();
      return;
    }
    setManualCheckCooldownUntil(Date.now() + 30_000);
    setManualCheckMessage('Pembayaran belum terkonfirmasi. Kami akan update otomatis jika webhook diterima.');
  } catch (err) {
    setManualCheckMessage(err instanceof Error ? err.message : 'Gagal cek status pembayaran.');
  } finally {
    setManualCheckLoading(false);
  }
};
```

Use the page's actual state names for current order/reference and success/failed transitions; do not introduce duplicate order state if existing names differ.

4. Render button in QRIS/polling state:

```tsx
<button
  type="button"
  onClick={handleManualCheck}
  disabled={manualCheckLoading || Date.now() < manualCheckCooldownUntil}
  className="..."
>
  {manualCheckLoading ? 'Mengecek...' : 'Saya sudah bayar / Cek status sekarang'}
</button>
{manualCheckMessage && <p className="text-sm text-slate-500">{manualCheckMessage}</p>}
```

- [ ] **Step 3: Run frontend lint/build check available for project**

Run the existing frontend validation command from `frontend/package.json`. If the project has no lint script, run TypeScript/build command.

Common commands to try:

```bash
cd frontend && npm run lint
cd frontend && npm run build
```

Expected: pass. If build is too slow for local iteration, at least run the command already used by this repo's tests/CI.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api/topup.ts frontend/app/topup/page.tsx
git commit -m "feat(topup): add manual Mustika status check"
```

---

### Task 8: Update Configuration, Docs, and Remove Old Mustika Service

**Files:**
- Delete: `backend/src/services/mustikaService.js`
- Modify: `backend/.env.example`
- Modify: `backend/openapi.yaml`
- Modify: `backend/README.md`
- Modify: `docs/dokumentasi-teknis.md`
- Modify: any tests still importing `mustikaService.js`

**Interfaces:**
- Consumes final route/API design from earlier tasks.
- Produces docs that state MustikaPay-only webhook-first architecture.

- [ ] **Step 1: Search for old provider references**

Run:

```bash
rg "bayar|Bayar|TOPUP_PROVIDER|topupPoller|mustikaService|/webhooks/bayar|checkMustikaStatus|createMustikaQris" backend docs frontend
```

Expected before cleanup: matches exist.

- [ ] **Step 2: Remove old `mustikaService.js` after references are gone**

If `rg "mustikaService" backend/src backend/tests` only returns the file itself, delete:

```bash
git rm backend/src/services/mustikaService.js
```

If references remain, update them to:

```js
import { createQris, checkQrisStatus } from "./mustika/client.js";
```

or the correct relative path for the file.

- [ ] **Step 3: Update `.env.example`**

In `backend/.env.example`, replace the payment section with:

```env
# Payment Gateway — MustikaPay QRIS (webhook-first)
MUSTIKAPAY_API_KEY=
MUSTIKAPAY_BASE_URL=https://mustikapayment.com
# Configure this URL in the MustikaPay dashboard:
# https://api-rbx.muhwldns.me/webhooks/mustika
```

Remove:

```env
BAYARGG_API_KEY=
BAYARGG_BASE_URL=
BAYARGG_WEBHOOK_SECRET=
BAYARGG_WEBHOOK_URL=
TOPUP_PROVIDER=
```

- [ ] **Step 4: Update backend README and OpenAPI**

`backend/README.md` should state:

```md
Payment top-up uses MustikaPay QRIS only. Payment confirmation is webhook-first: MustikaPay posts to `/webhooks/mustika`, the backend acknowledges immediately, then verifies the `ref_no` with `/api/v1/check/qris` before crediting wallet balance. `/topup/status/:reference` is DB-only; `/topup/check/:reference` is a user-triggered fallback with cooldown.
```

`backend/openapi.yaml` must include:

```yaml
  /webhooks/mustika:
    post:
      summary: MustikaPay QRIS webhook
      description: Acknowledges MustikaPay webhook immediately and processes verification asynchronously.
```

Also remove `/webhooks/bayar` documentation and any `TOPUP_PROVIDER` text.

- [ ] **Step 5: Update `docs/dokumentasi-teknis.md` payment sections**

Replace statements that MustikaPay is polling-based with:

```md
MustikaPay QRIS confirmation is webhook-first. The webhook has no documented HMAC signature, so the backend treats it as an untrusted trigger: it responds 200 immediately, then verifies the `ref_no` using MustikaPay Check Status before crediting the wallet. The status endpoint is DB-only. Manual check is available for webhook-miss recovery and is cooldown-limited.
```

Remove references to Bayar.gg as active provider.

- [ ] **Step 6: Run search again to verify cleanup**

Run:

```bash
rg "bayar|Bayar|TOPUP_PROVIDER|topupPoller|mustikaService|/webhooks/bayar|checkMustikaStatus|createMustikaQris" backend docs frontend
```

Expected: no active code references. Historical mentions inside the new spec/plan are acceptable only if they describe removed legacy behavior.

- [ ] **Step 7: Commit**

```bash
git add backend/.env.example backend/openapi.yaml backend/README.md docs/dokumentasi-teknis.md
git rm backend/src/services/mustikaService.js
git commit -m "docs(topup): document Mustika webhook-only flow"
```

---

### Task 9: Final Verification and Cleanup

**Files:**
- Modify only files needed to fix verification failures.

**Interfaces:**
- Consumes all previous tasks.
- Produces a fully tested Mustika-only top-up implementation.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
cd backend && bun test tests/services/mustika/client.test.js tests/services/mustika/credit.test.js tests/services/mustika/webhook.test.js tests/services/mustika/reconcile.test.js tests/routes/topup.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full backend test suite**

Run:

```bash
cd backend && bun test
```

Expected: PASS. If unrelated pre-existing tests fail, record the exact failures and confirm they are unrelated before proceeding.

- [ ] **Step 3: Verify no backend route calls Mustika from status polling**

Run:

```bash
rg "checkQrisStatus|checkMustikaStatus" backend/src/controllers backend/src/server.js
```

Expected: `checkQrisStatus` appears only in service/orchestration modules, not in `handleGetTopUpStatus`.

- [ ] **Step 4: Verify old poller and Bayar are gone**

Run:

```bash
rg "startTopUpPoller|topupPoller|bayarService|handleBayarWebhook|/webhooks/bayar|TOPUP_PROVIDER" backend/src backend/tests backend/.env.example backend/README.md backend/openapi.yaml
```

Expected: no matches.

- [ ] **Step 5: Manual smoke test with mocked provider or staging credentials**

If safe staging MustikaPay credentials are available:

1. Start backend in development.
2. Create top-up from frontend.
3. Confirm DB `TopUpOrder.externalId` contains a `QR...` Mustika ref_no.
4. Hit `GET /topup/status/:refNo` repeatedly and confirm backend logs show no Mustika API calls.
5. Simulate webhook with sample payload:

```bash
curl -X POST http://localhost:3001/webhooks/mustika \
  -H "Content-Type: application/json" \
  -d '{"status":"success","service":"QRIS","amount":50000,"reference":"QR123","order_id":null,"timestamp":"2026-06-19 13:00:00","data":{"ref_no":"QR123","status":"SUCCESS","type":"QRIS"}}'
```

Expected response:

```json
{"status":"received"}
```

Use mocked/staging ref_no only; do not send fake webhook for a real paid order unless the provider check-status will verify it.

- [ ] **Step 6: Review git diff**

Run:

```bash
git diff --stat
git diff -- backend/src/controllers/topupController.js backend/src/services/mustika backend/src/server.js
```

Check for:

- no Bayar imports,
- no poller imports,
- no provider branching,
- no CUID/order_id sent to MustikaPay,
- status endpoint DB-only,
- webhook immediate 200.

- [ ] **Step 7: Commit verification fixes if any**

If Step 1-6 required fixes:

```bash
git add backend/src backend/tests backend/.env.example backend/README.md backend/openapi.yaml docs/dokumentasi-teknis.md frontend/app/topup/page.tsx frontend/lib/api/topup.ts
git commit -m "fix(topup): complete Mustika webhook verification flow"
```

If no fixes were needed, skip this commit.

## Self-Review Checklist

- [ ] Spec requirement: Bayar.gg removed — covered by Tasks 1 and 8.
- [ ] Spec requirement: no polling to Mustika — covered by Tasks 1, 5, and 9.
- [ ] Spec requirement: no CUID/order_id sent to Mustika — covered by Task 2 client test.
- [ ] Spec requirement: webhook immediate 200 then async processing — covered by Task 6 route test.
- [ ] Spec requirement: webhook verified by check-status — covered by Task 4.
- [ ] Spec requirement: atomic credit rewrite — covered by Task 3.
- [ ] Spec requirement: manual check cooldown — covered by Task 5.
- [ ] Spec requirement: local auto-cancel — covered by Task 5.
- [ ] Spec requirement: PM2 fork assumption documented — covered by Task 8.
- [ ] Placeholder scan complete: no `TBD`, `TODO`, or vague "handle edge cases" steps should remain.
- [ ] Type consistency complete: `createQris`, `checkQrisStatus`, `creditVerifiedTopUp`, `processMustikaWebhook`, `manualCheckTopUp`, and `startAutoCanceler` names match across tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-mustikapay-webhook-rewrite.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?

If choosing Subagent-Driven, use `superpowers:subagent-driven-development` before implementation.
If choosing Inline Execution, use `superpowers:executing-plans` before implementation.
