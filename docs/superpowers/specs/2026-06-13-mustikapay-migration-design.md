# MustikaPay Provider Migration — Design

**Date:** 2026-06-13
**Status:** Approved design, pending implementation plan
**Scope:** Add MustikaPay as a top-up payment provider (QRIS only) alongside the existing Bayar.gg provider, using polling instead of webhooks for payment confirmation.

---

## 1. Background

The top-up subsystem currently integrates a single payment gateway, **Bayar.gg** (QRIS). Payment confirmation relies on a **signed webhook** (`POST /webhooks/bayar`) that verifies an HMAC SHA256 signature before crediting the user's wallet.

We are adding a second gateway, **MustikaPay** (`https://mustikapayment.com`), and switching its confirmation model to **polling** because MustikaPay webhooks carry **no signature** and cannot be trusted as a source of truth.

A pre-existing bug also surfaced: `handleCreateTopUp` is an async Express handler with no error wrapper, so a rejected promise (e.g. gateway 400) crashes the process with `unhandledRejection`. This is fixed as part of this work.

---

## 2. Decisions (agreed)

| Decision | Choice |
|---|---|
| Payment methods | **QRIS only** |
| Migration strategy | **Both providers side by side** — Bayar.gg untouched, MustikaPay added |
| Provider selection | **Env flag `TOPUP_PROVIDER`** (`bayar.gg` \| `mustika`), default applies to all new orders |
| MustikaPay confirmation | **Polling** (server poller every 3 min + on-demand "Saya sudah bayar" button). No webhook trust. |
| QR rendering | **Option A** — `qrisImageUrl` = MustikaPay `qr_url` as-is (PNG image URL), rendered directly by web/mobile as a network image |
| Routes | **Reuse existing routes** — no new endpoints |
| Auto-cancel | **20 minutes.** `expiry=20` sent on create (QR dies on MustikaPay's side); our poller/status-check marks the order `CANCELED` once past 20 min or when check returns `expired`. MustikaPay has **no cancel endpoint** — expiry is the only cancellation mechanism. |

---

## 3. Critical security finding

MustikaPay's webhook payload contains **no signature/HMAC**. The current architecture treats webhook signature verification as the source of truth for crediting wallets. If we only swapped URLs, anyone could POST a forged `{status:"success", reference:"QR123"}` to our endpoint and receive free balance.

MustikaPay's own docs state: *"Verifikasi setiap callback dengan endpoint Cek Status."*

**Therefore:** MustikaPay payment confirmation never trusts an inbound notification. The backend always confirms by calling `GET /api/v1/check/qris?ref_no=X` and requires `status === "success"` (plus an amount match) before crediting. This is why MustikaPay uses polling, not a webhook.

---

## 4. API comparison: Bayar.gg vs MustikaPay

| Aspect | Bayar.gg (existing) | MustikaPay (new) |
|---|---|---|
| Create | `POST /api/create-payment.php` (JSON body) | `POST /api/v1/create/qris` (**form-urlencoded**) |
| Auth header | `X-API-Key` | `X-Api-Key` |
| Transaction id | `invoice_id` | `ref_no` (e.g. `QR1776...`) |
| QR / payment fields | `qris_static_image_url`, `payment_url` | `qr_url`, `payment_link` |
| Check status | `GET /check-payment.php?invoice=` | `GET /api/v1/check/qris?ref_no=` |
| Status values | (provider-specific) | `pending` / `success` / `expired` |
| Confirmation | Signed webhook (HMAC) | **Polling** (no signature) |
| `order_id` support | n/a | **Not accepted on create; `null` in webhook** — match only by `ref_no` |

MustikaPay create response:
```json
{
  "status": "success",
  "ref_no": "QR1776670534209",
  "qr_url": "https://mustikapayment.com/api/qr?data=00020101...&ref_no=QR...&username=...",
  "payment_link": "https://mustikapayment.com/pay/QR1776670534209",
  "amount": 10000
}
```

MustikaPay check response (when paid):
```json
{ "ref_no": "QR123", "status": "success", "type": "QRIS", "amount": 10000, "net_amount": 9930, "receipt_url": "..." }
```

---

## 5. Architecture

### 5.1 New service: `services/mustikaService.js`
Parallel to `bayarService.js`. Two functions:

- **`createMustikaQris({ amount, productName, customerName, expiry, redirectUrl })`**
  - `POST {baseUrl}/api/v1/create/qris`
  - `Content-Type: application/x-www-form-urlencoded` (differs from Bayar.gg's JSON)
  - Header `X-Api-Key`
  - Body params: `amount` (required), `product_name`, `customer_name`, `expiry` (minutes), `redirect_url`
  - Returns `{ refNo, qrUrl, paymentLink, amount }`
  - Throws on non-OK response or `status !== "success"`

- **`checkMustikaStatus(refNo)`**
  - `GET {baseUrl}/api/v1/check/qris?ref_no=...`, header `X-Api-Key`
  - Returns `{ status, amount, raw }` where `status ∈ {pending, success, expired}`
  - **This is the source of truth** for crediting, not the webhook.

Config: `getMustikaConfig()` reads `MUSTIKAPAY_API_KEY`, `MUSTIKAPAY_BASE_URL` (default `https://mustikapayment.com`). No webhook secret.

### 5.2 Shared credit logic: `creditTopUpOrder()`
Wallet-credit logic currently lives inside `handleBayarWebhook` (atomic transaction, idempotent via `status === "COMPLETED"` lock). Extract it into a shared, transaction-based function so it can be called by **three** triggers:
1. Bayar.gg webhook (existing)
2. MustikaPay background poller (new)
3. `GET /topup/status/:reference` when a MustikaPay order is confirmed on demand (new)

Idempotency is preserved exactly: find order → if already `COMPLETED` return early → lock to `COMPLETED` → credit wallet + ledger + activity log, all in one `prisma.$transaction`.

**Safety check:** before crediting, compare the provider-confirmed `amount` against `order.amountRupiah`. Reject (do not credit) on mismatch.

### 5.3 Create flow (`handleCreateTopUp`)
```
provider = process.env.TOPUP_PROVIDER || "bayar.gg"

if provider === "mustika":
    createMustikaQris({ amount, productName, customerName,
                        expiry: 20,
                        redirectUrl: `${FRONTEND_URL}/topup?order=...` })
    save order: provider="mustika", externalId=refNo,
                metadata={ qrUrl, paymentLink, expiresAt }
else:  # "bayar.gg"
    existing path, unchanged
```

API response shape is **unchanged** so the frontend needs no rework:
- `qrisImageUrl` ← `qr_url` (Option A: PNG URL rendered directly)
- `paymentUrl` ← `payment_link`
- `expiresAt` ← computed as `now + 20 minutes` (MustikaPay returns no explicit expiry; `expiry=20` sent on create so the QR physically dies on MustikaPay's side after 20 min)

Matching is purely by `externalId = ref_no` (unique in schema); MustikaPay does not accept or echo our `order_id`.

### 5.4 Status endpoint (`handleGetTopUpStatus`)
Currently DB-read only. New behavior:

```
GET /topup/status/:reference   (existing internal route, used by frontend + "Saya sudah bayar")
   ├─ order COMPLETED          → return from DB (unchanged)
   ├─ order PENDING & provider="bayar.gg" → return from DB (unchanged; webhook credits it)
   └─ order PENDING & provider="mustika"
          → if order older than 20 min → mark CANCELED → return CANCELED
          → else checkMustikaStatus(ref_no)
              ├─ "success" → verify amount → creditTopUpOrder() → return COMPLETED
              ├─ "expired" → mark CANCELED → return CANCELED
              └─ "pending" → return PENDING
```

This makes the **"Saya sudah bayar" button** and the **background poller** share the exact same `checkMustikaStatus` → `creditTopUpOrder` path — no duplicated logic, idempotency intact.

**Response enrichment (for frontend restore).** The endpoint now also returns the QRIS render fields when the order is still PENDING, sourced from `order.metadata`:
- `qrisImageUrl` ← `metadata.qrUrl`
- `paymentUrl` ← `metadata.paymentLink`
- `expiresAt` ← `metadata.expiresAt`

These let the browser fully re-render the QRIS step after a reload/app-reopen (see §6). For Bayar.gg PENDING orders the same fields are populated from their existing metadata keys (`paymentUrl`, `qrisImageUrl`, `expiresAt`). The existing fields (`status`, `paid`, `amount`, `finalAmount`, timestamps) are unchanged, so this is purely additive.

> Note: `GET /topup/status/:reference` is the **internal status endpoint** used by the browser. It is NOT the Bayar.gg webhook. The Bayar.gg webhook is the separate route `POST /webhooks/bayar`, which remains untouched.

### 5.5 Background poller: `services/topupPoller.js`
In-process `setInterval`, started from `server.js`. Safe to run in-process because PM2 runs a single API instance (`instances: 1`).

```
every 3 minutes:
  orders = PENDING where provider="mustika"
  if orders is empty → return immediately (no work, no provider calls)
  for each order:
      if order older than 20 min:
          checkMustikaStatus(ref_no) one last time
            ├─ "success" → verify amount → creditTopUpOrder()
            └─ otherwise  → mark order CANCELED   # 20-min auto-cancel; QR already expired via expiry=20
      else:
          checkMustikaStatus(ref_no)
            ├─ "success"  → verify amount → creditTopUpOrder()
            ├─ "expired"  → mark order CANCELED
            └─ "pending"  → leave as is
```

- **Only works when there are pending orders.** Each tick first counts PENDING `mustika` orders; if zero, it returns before making any MustikaPay call. So when nothing is pending the poller costs one cheap indexed DB query and makes **no** outbound requests. (The `setInterval` itself keeps ticking every 3 min — that is just a timer, not a provider call.)
- **Auto-cancel after 20 minutes.** MustikaPay has **no cancel/void endpoint** (verified against the full API docs — only create/check/nota/validate-bank/balance/payment-links/snap exist). The "cancel request to MustikaPay" is made implicitly at create time by sending `expiry=20`, which expires the QR on their side after 20 minutes. After that, our poller/status-check marks the order `CANCELED` locally. There is no separate cancel call because the provider exposes none.
- Bayar.gg orders are **not** touched by the poller (they use the webhook).
- Guard: if `MUSTIKAPAY_API_KEY` is empty, the poller skips its run.
- Errors per-order are caught and logged so one bad order doesn't abort the batch.

### 5.6 Bug fix: `unhandledRejection`
Root cause: async Express handlers (e.g. `handleCreateTopUp`) have no catch wrapper. In Express 4, a rejected promise from an async handler is not caught and crashes the process.

Fix: add an `asyncHandler(fn)` wrapper — `(req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)` — and apply it to the async top-up routes so errors flow to the existing error-handling middleware instead of crashing.

---

## 6. Frontend changes

Client-side polling already exists (`topup/page.tsx`, 3s interval, 5min timeout, with a `timeout` step + "Cek Lagi" button). Two additions:

### 6.1 "Saya sudah bayar" button
Add a **"Saya sudah bayar"** button to the `qris`/`polling` step that calls the existing `getTopUpStatus(reference)` on demand (forces an immediate status check rather than waiting for the next poll tick).

### 6.2 Persist pending order across app close/reopen
**Problem:** all QRIS state (`qrisImageUrl`, `paymentUrl`, `expiresAt`, `amount`) lives in in-memory React state (`topup/page.tsx:23-27`), so it is lost when the app is closed/reloaded. The existing `?order=xxx` restore (`topup/page.tsx:173-181`) only restores `orderId` and starts polling — the QR image and amount are never re-rendered.

**Solution (chosen): localStorage + enriched status endpoint.** Backend remains the source of truth.

```
on createTopUp success → localStorage.setItem("pendingTopUpOrder", orderId)
on order COMPLETED / CANCELED / FAILED / timeout → localStorage.removeItem(...)

on page mount:
  orderId = ?order= param  ||  localStorage.getItem("pendingTopUpOrder")
  if orderId:
     GET /topup/status/:orderId
        ├─ PENDING → restore full QRIS step from response
        │             (qrisImageUrl, paymentUrl, expiresAt, amount) → setStep('qris') + startPolling
        └─ COMPLETED/CANCELED/FAILED → show that terminal state, clear localStorage
```

This relies on §5.4 response enrichment (the status endpoint now returns the QRIS render fields for PENDING orders), so the browser can fully reconstruct the QRIS step without holding any persisted secrets — only the `orderId` is stored client-side.

No QR-rendering changes (Option A reuses the existing `<img src={qrisImageUrl}>` pattern).

### 6.3 `lib/api/topup.ts`
Extend `TopUpStatusResponse` type with the new optional fields (`qrisImageUrl?`, `paymentUrl?`, `expiresAt?`) returned by the enriched status endpoint.

---

## 7. Environment variables (new)

```
TOPUP_PROVIDER=bayar.gg            # "bayar.gg" | "mustika"
MUSTIKAPAY_API_KEY=
MUSTIKAPAY_BASE_URL=https://mustikapayment.com
```

Bayar.gg variables remain unchanged.

---

## 8. Files touched

**Backend**
- `services/mustikaService.js` — **new** (createMustikaQris, checkMustikaStatus, getMustikaConfig)
- `services/databaseService.js` — `creditTopUpOrder()` extracted from webhook
- `controllers/topupController.js` — provider switch in create; `handleGetTopUpStatus` actively confirms MustikaPay when PENDING + enriched response (QRIS fields); webhook refactored to call shared credit fn
- `services/topupPoller.js` — **new** (3-minute poller, skips when no pending orders)
- `services/index.js` — export new services
- `server.js` — start poller; apply `asyncHandler` to async top-up routes
- `.env.example` — new env vars
- `openapi.yaml` — update `/topup/status/:reference` response schema (new QRIS fields + `CANCELED` status); note MustikaPay provider in `/topup/create`

**Frontend**
- `app/topup/page.tsx` — "Saya sudah bayar" button on QRIS step; localStorage persistence + restore-on-mount of pending order
- `lib/api/topup.ts` — extend `TopUpStatusResponse` with optional `qrisImageUrl`/`paymentUrl`/`expiresAt`

**Documentation** (update to reflect MustikaPay + polling, keep Bayar.gg as the still-supported alternate provider)
- `docs/dokumentasi-teknis.md` — overview line (gateway list), tech-stack table, sequence/flow blocks, section 5.3 (Top-Up & Payment) endpoint table, section 6.2 (Alur Top-Up) full flow rewrite for polling, env-vars table (add `TOPUP_PROVIDER`, `MUSTIKAPAY_*`). Frame webhook vs polling per provider.
- `backend/README.md` — payment line (`Bayar.gg (QRIS)` → both providers), setup steps, services tree (`mustikaService.js`, `topupPoller.js`), env section.
- `backend/API_ROUTES.md` — `/topup/*` table + payloads: note provider switch, MustikaPay response field mapping, status-endpoint active-confirm behavior for MustikaPay, `TOP_UP` trigger row.
- `.env.example` — already listed under Backend above; mirrored here as the documented env contract.

> Principle: documentation describes **both** providers and makes explicit that Bayar.gg uses a signed webhook while MustikaPay uses polling (no signature). Do not delete Bayar.gg docs — it remains a selectable provider.

---

## 9. Testing

- **Unit:** `mustikaService` create (form-encoding, header, return mapping) and check (status mapping) with mocked `fetch`.
- **Unit:** `creditTopUpOrder` idempotency (double-credit prevention) and amount-mismatch rejection.
- **Integration:** `handleGetTopUpStatus` for a PENDING MustikaPay order → mocked `success` → wallet credited once; second call is a no-op.
- **Integration:** create flow with `TOPUP_PROVIDER=mustika` returns `qrisImageUrl`/`paymentUrl`/`expiresAt`.
- **Integration:** PENDING MustikaPay order older than 20 min → status-check/poller marks it `CANCELED` (auto-cancel) and does not credit.
- **Regression:** Bayar.gg webhook path still credits correctly (shared fn).
- **Bug fix:** create with a gateway 400 returns a JSON error response and does **not** crash the process.

---

## 10. Out of scope

- VA / E-Money / Retail methods (QRIS only).
- Removing Bayar.gg.
- Migrating existing pending Bayar.gg orders to MustikaPay.
- Payout / balance / bank-validation MustikaPay endpoints.
