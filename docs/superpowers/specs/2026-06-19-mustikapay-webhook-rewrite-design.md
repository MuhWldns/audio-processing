# MustikaPay Webhook-Only Top-Up Rewrite Design

Date: 2026-06-19

## Context

The current top-up implementation supports two providers: Bayar.gg and MustikaPay. Bayar.gg uses a signed webhook, while MustikaPay was implemented with aggressive polling. Production logs showed the backend kept polling MustikaPay every 3 minutes even after MustikaPay returned HTTP 403 with `Akses Ditolak: Akun Anda telah ditangguhkan.` This amplified the provider suspension and created unnecessary API pressure.

MustikaPay documentation confirms that QRIS supports webhook callbacks:

- MustikaPay sends a `POST` JSON webhook when a QRIS payment succeeds.
- The receiver should return `HTTP 200 OK` quickly with a body like `{ "status": "received" }`.
- The receiver should verify each callback with the Check Status endpoint.
- MustikaPay retries up to 5 times when the endpoint does not return 200.

The rewrite removes Bayar.gg entirely and makes MustikaPay the only top-up provider.

## Decisions

1. Full rewrite of the top-up payment integration.
2. Remove Bayar.gg code, routes, env vars, and tests.
3. Remove the MustikaPay poller entirely.
4. Use MustikaPay webhook as the primary confirmation path.
5. Acknowledge webhooks immediately, then process them asynchronously in-process.
6. Treat webhook payloads as untrusted and verify them with MustikaPay Check Status before crediting.
7. Link webhook payloads to internal orders using MustikaPay `ref_no`, stored in `TopUpOrder.externalId`.
8. Do not send internal CUID/order IDs to MustikaPay QRIS. The QRIS create endpoint does not document `order_id` support; webhook `order_id` is expected to be null for QRIS.
9. Keep frontend status polling, but make it DB-only. It must never call MustikaPay.
10. Add a manual "check status now" path for webhook-miss recovery, with a 30-second per-order cooldown.
11. Add local auto-cancel for old pending orders after 25 minutes. This is DB-only and does not call MustikaPay.
12. Production will run PM2 in fork mode, not cluster mode, so in-memory cooldown and a single in-process auto-cancel interval are acceptable.
13. Database may be dropped and re-initialized, so legacy migration/cleanup for existing Bayar.gg orders is out of scope.

## MustikaPay API Facts

### Create QRIS

Endpoint:

```http
POST https://mustikapayment.com/api/v1/create/qris
X-Api-Key: <api-key>
Content-Type: application/x-www-form-urlencoded
```

Supported documented parameters:

- `amount` required
- `product_name` optional
- `customer_name` optional
- `expiry` optional, minutes
- `redirect_url` optional
- `user` optional

Expected response shape:

```json
{
  "status": "success",
  "ref_no": "QR1776670534209",
  "qr_url": "https://mustikapayment.com/api/qr?...",
  "payment_link": "https://mustikapayment.com/pay/QR1776670534209",
  "amount": 10000
}
```

### Check QRIS Status

Endpoint:

```http
GET https://mustikapayment.com/api/v1/check/qris?ref_no=QR1776670534209
X-Api-Key: <api-key>
```

Success response example:

```json
{
  "ref_no": "QR1776670534209",
  "status": "success",
  "type": "QRIS",
  "amount": 10000,
  "net_amount": 9930,
  "issuer": "GOPAY",
  "payor": "Budi Santoso",
  "settle_at": "2026-04-21 13:00:00",
  "timestamp": "2026-04-20 14:35:34",
  "receipt_url": "https://mustikapayment.com/nota/QR1776670534209.png"
}
```

Known status values:

- `pending`
- `success`
- `expired`

### Webhook Payload

QRIS webhook payload example:

```json
{
  "status": "success",
  "service": "QRIS",
  "amount": 22500,
  "reference": "QR1776670534209",
  "order_id": null,
  "timestamp": "2026-04-20 14:36:26",
  "data": {
    "amount": 22500,
    "net_amount": 22342,
    "issuer": "DANA",
    "payor": "00***********",
    "product_name": "Pembayaran",
    "provider_ref": "QRA177667053434072901481024",
    "ref_no": "QR1776670534209",
    "rrn": "1nqcobu22660",
    "settle_at": "2026-04-21 13:00:00",
    "status": "SUCCESS",
    "type": "QRIS",
    "username": "Nauval"
  }
}
```

The webhook does not document a signature. It must not be trusted as the source of truth.

## Architecture

### New modules

```text
backend/src/services/mustika/
  client.js      Raw HTTP client for MustikaPay: createQris, checkQrisStatus.
  webhook.js     Webhook extraction and async verification orchestration.
  reconcile.js   Manual status check, cooldown, and local auto-cancel.
  credit.js      Atomic wallet credit transaction.

backend/src/controllers/topupController.js
  Thin controller for top-up routes.
```

### Removed modules

```text
backend/src/services/bayarService.js
backend/src/services/topupPoller.js
```

The old `creditTopUpOrder` function in `backend/src/services/databaseService.js` will be removed and replaced by `backend/src/services/mustika/credit.js`.

## Routes

### Create top-up

```http
POST /topup/create
Auth required
```

Creates a MustikaPay QRIS order and stores the returned `ref_no` in `TopUpOrder.externalId`.

### Read top-up status

```http
GET /topup/status/:reference
Auth required
```

Pure DB read. It must never call MustikaPay.

`reference` may be the internal order id or MustikaPay `ref_no`.

### Manual check status

```http
POST /topup/check/:reference
Auth required
```

User-triggered recovery path for missed/late webhooks. It calls MustikaPay Check Status only when:

- the order belongs to the authenticated user,
- the order is still `PENDING`, and
- the per-order cooldown has expired.

Cooldown: 30 seconds per order/ref_no, in memory.

### MustikaPay webhook

```http
POST /webhooks/mustika
Public
```

Immediately responds:

```json
{ "status": "received" }
```

Then processes asynchronously in the same process.

## Data Flow

### Create QRIS

1. User calls `POST /topup/create`.
2. Backend validates amount.
3. Backend creates `TopUpOrder` as `PENDING` with `provider = "mustika"` and `externalId = null`.
4. Backend calls MustikaPay `create/qris`.
5. Backend verifies the create response has `status = "success"` and a non-empty `ref_no`.
6. Backend updates `TopUpOrder.externalId = ref_no` and stores QR/payment metadata.
7. Backend returns QRIS URL/payment link to the frontend.

If MustikaPay creation fails after the order row was created, backend marks the order `FAILED` and returns an error. This avoids orphan pending orders with no provider reference.

### Webhook success path

1. MustikaPay sends `POST /webhooks/mustika`.
2. Backend responds `200 { "status": "received" }` immediately.
3. Background processing extracts `refNo` from `payload.reference || payload.data?.ref_no`.
4. Backend finds `TopUpOrder` by `externalId = refNo`.
5. If no order exists, log warning and stop.
6. If the order is already `COMPLETED`, stop idempotently.
7. Backend calls MustikaPay Check Status for `refNo`.
8. Backend only credits when all checks pass:
   - check response status is `success`,
   - check response `ref_no` equals `order.externalId`,
   - check response `amount` equals `order.amountRupiah`.
9. Backend runs atomic credit transaction.
10. Backend sends top-up success email as fire-and-forget after the transaction.

### Manual check path

1. User clicks manual check button.
2. Frontend calls `POST /topup/check/:reference`.
3. Backend verifies ownership.
4. If status is `COMPLETED` or `CANCELED`, return current status with no provider call.
5. If status is `PENDING` and cooldown is active, return current status with `cooldownRemainingMs`.
6. If cooldown has expired, call MustikaPay Check Status.
7. If verified success, run atomic credit transaction.
8. If provider returns `expired`, mark order `CANCELED`.
9. Return latest status.

### Status polling path

Frontend may continue polling `GET /topup/status/:reference` every 3 seconds. This endpoint only reads the DB and returns the latest stored status.

### Auto-cancel path

An in-process interval runs every 5 minutes in PM2 fork mode.

It marks old pending MustikaPay orders as canceled:

```text
provider = "mustika"
status = "PENDING"
createdAt < now - 25 minutes
```

It does not call MustikaPay.

Webhook or manual check can still revive a canceled order if MustikaPay later verifies it as paid.

## Atomic Credit Transaction

The new credit module must implement the following behavior from scratch:

1. Load the order and verify it exists.
2. If order status is `COMPLETED`, return idempotent already-processed result.
3. Verify the provider amount is finite and exactly equals `order.amountRupiah`.
4. Claim the order using compare-and-swap:

```text
UPDATE TopUpOrder
SET status = "COMPLETED"
WHERE id = <order.id>
  AND status IN ("PENDING", "CANCELED")
```

5. If claim count is zero, return idempotent already-processed result.
6. Increment `User.walletBalance` and `User.totalTopUp` by `order.amountRupiah`.
7. Insert a `WalletTransaction` ledger row with:
   - `type = TOP_UP`,
   - `amount = order.amountRupiah`,
   - `balanceAfter = updated wallet balance`,
   - `referenceType = TOP_UP_ORDER`,
   - `referenceId = order.id`,
   - provider metadata.
8. Insert an `ActivityLog` success row.
9. Update `TopUpOrder.finalAmount` and merge metadata.
10. Commit all changes as one DB transaction.

This transaction must be safe under duplicate webhooks and concurrent manual checks.

## Error Handling

### MustikaPay HTTP errors

The HTTP client should throw structured errors containing:

- `statusCode`
- response body text/JSON
- endpoint/action name

Handling rules:

- `401` or `403`: log as provider auth/suspension error. Do not retry in a loop.
- `429`: log rate limit. Manual check should return a friendly retry-later response.
- `5xx` or network errors: log transient provider error. Do not auto-loop. User can try manual check later.

### Webhook processing errors

Because the endpoint returns 200 immediately, async processing failures must be logged with enough context:

- webhook `reference`
- provider payload status/service
- order id if found
- structured provider error if verification fails

### Mismatch cases

Do not credit when:

- webhook status is not `success`,
- service is not `QRIS`,
- `ref_no` is missing,
- order cannot be found,
- check-status is not `success`,
- check-status `ref_no` differs from order externalId,
- check-status amount differs from order amount.

All mismatch cases should log warnings, not throw unhandled errors.

## Frontend Behavior

The existing status polling UI can remain. It should now poll a DB-only status endpoint.

Add or keep a manual recovery button:

- Label: `Saya sudah bayar / Cek status sekarang`.
- Calls `POST /topup/check/:reference`.
- Disable for 30 seconds after click based on backend response.
- If backend returns paid/completed, transition to success.
- If backend returns pending, show a calm message: payment is not confirmed yet.
- If backend returns provider unavailable/rate-limited, show retry-later message.

## Deployment Notes

1. Change PM2 from cluster mode to fork mode.
2. Configure MustikaPay Dashboard webhook URL:

```text
https://api-rbx.muhwldns.me/webhooks/mustika
```

3. Remove Bayar.gg env vars from production.
4. Required env vars:

```text
MUSTIKAPAY_API_KEY
MUSTIKAPAY_BASE_URL=https://mustikapayment.com
```

5. Since DB will be dropped and re-initialized, no legacy Bayar.gg order cleanup is required.

## Test Plan

### Unit tests

`client.js`:

- create QRIS posts form-urlencoded body with `X-Api-Key`.
- create QRIS maps `ref_no`, `qr_url`, `payment_link`, `amount`.
- check status GETs correct URL and maps provider fields.
- non-2xx responses throw structured errors.

`webhook.js`:

- extracts ref_no from `reference`.
- falls back to `data.ref_no`.
- ignores non-QRIS service.
- ignores non-success webhook status.
- verifies by calling check-status before crediting.
- does not credit on amount mismatch.
- does not credit when order not found.

`credit.js`:

- credits pending order exactly once.
- duplicate credit attempt does not double-credit.
- amount mismatch throws/fails closed.
- canceled order can be revived when provider verifies payment.
- concurrent credit attempts only create one ledger row.

`reconcile.js`:

- manual check respects cooldown.
- manual check does not call provider for completed/canceled orders.
- provider `expired` cancels pending order.
- auto-cancel only touches pending orders older than 25 minutes.

### Route tests

- `POST /topup/create` creates MustikaPay order and returns QR data.
- `GET /topup/status/:reference` is DB-only.
- `POST /topup/check/:reference` requires auth and ownership.
- `POST /webhooks/mustika` returns `{ status: "received" }` immediately.
- Bayar.gg webhook route no longer exists.

## Out of Scope

- Supporting Bayar.gg.
- Supporting MustikaPay VA/E-Money/Retail flows.
- Redis/BullMQ queue for webhook processing.
- Multi-instance PM2 cluster support.
- Migrating existing production payment rows.
