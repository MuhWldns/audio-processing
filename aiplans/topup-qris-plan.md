# QRIS Top-Up Plan (Bayar.gg)

## 1) Goals

- Enable token top-ups using Bayar.gg QRIS with a server-side flow.
- Credit tokens only after payment is confirmed paid.
- Keep the backend as the source of truth for balances and ledgers.

---

## 2) Key Decisions

- Payment method: qris
- Currency: Rupiah only
- Token mapping: 1 Rupiah = 1 token (amount equals tokens)
- No refunds
- Pricing for usage is duration-based (handled outside top-up)
- Webhook is the source of truth for payment success

---

## 3) Pricing Rules (Usage Cost)

- Duration is taken from export metadata and rounded up in seconds.
- 0-180 seconds: Rp 1.200
- 181-300 seconds: Rp 1.800
- 301-600 seconds: Rp 2.700
- > 600 seconds: Rp 3.500 (max)

---

## 4) Gateway Summary (Bayar.gg)

### Auth

- Send API key via header: X-API-Key

### Create Payment

- Endpoint: POST /api/create-payment.php
- Payload fields used:
  - amount (required)
  - payment_method: qris
  - description (optional)
  - customer_name/email/phone (optional)
  - callback_url (required for webhook)

### Check Payment

- Endpoint: GET /api/check-payment.php?invoice=...

### Webhook

- Event: payment.paid
- Verify signature using HMAC SHA256
- Signature data: invoice_id|status|final_amount|timestamp
- Secret: BAYAR_WEBHOOK_SECRET (from Bayar.gg settings)

---

## 5) Internal API (Backend)

### POST /topup/create

Request:
- amount (int)
- customer_name (optional)
- customer_email (optional)
- customer_phone (optional)

Rules:
- amount >= 1000
- amount <= 500000 for qris
- tokensBought = amount

Flow:
1) Validate amount and user session.
2) Create TopUpOrder with status PENDING.
3) Call Bayar.gg create-payment.
4) Store invoice_id, payment_url, expires_at, payment_method.

Response:
- invoice_id
- payment_url
- expires_at
- amount
- tokensBought

### POST /webhooks/bayar

Headers:
- X-Webhook-Signature
- X-Webhook-Timestamp
- X-Webhook-Event

Flow:
1) Verify HMAC signature.
2) If status != paid, ignore.
3) Find TopUpOrder by invoice_id.
4) If already COMPLETED, return 200.
5) Mark order COMPLETED.
6) Update wallet balanceTokens += tokensBought.
7) Insert TokenTransaction type TOP_UP.
8) Insert ActivityLog type TOP_UP.

Response:
- 200 OK on success, 401 if signature invalid.

### Optional: GET /topup/status/:invoiceId

- Returns local order status for UI polling.

---

## 6) Data Model Usage

TopUpOrder
- userId
- walletId
- provider (bayar.gg)
- externalId (internal)
- currency (IDR)
- amountPaid (amount)
- tokensBought (amount)
- status (PENDING/COMPLETED/FAILED)
- activityLogId
- metadata (invoice_id, payment_url, expires_at, payment_method)

TopUpTransaction
- userId
- amountRupiah
- paymentGateway = bayar.gg
- paymentId = invoice_id
- status = completed
- metadata = webhook payload

TokenTransaction
- type = TOP_UP
- amountTokens = tokensBought
- referenceType = TOP_UP_ORDER
- referenceId = topUpOrderId

---

## 7) Environment Variables

Backend:
- BAYAR_API_KEY
- BAYAR_BASE_URL
- BAYAR_WEBHOOK_SECRET
- BAYAR_WEBHOOK_URL (optional default callback)

---

## 8) Security Notes

- Webhook signature is mandatory.
- Do not trust client-side payment status.
- Use database transactions when updating wallet + ledger.

---

## 9) Open Items

- Decide if we need polling endpoint in addition to webhook.
- Finalize UI flow: redirect to payment_url or show QR inside page.
