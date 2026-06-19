# Backend API Routes (Source of Truth)

> Generated from `server.js` + controllers — 2026-05-15

## Base URL

```
http://localhost:3001
```

## Authentication

Two parallel auth paths converge at the same `requireAuth` middleware:

- **Web (cookie):** `connect.sid` cookie, established through OAuth login (Google/Discord) and stored in express-session MemoryStore.
- **Mobile (Bearer JWT):** `Authorization: Bearer <jwt>` header, issued after OAuth callback when the request was initiated with `?platform=mobile`. Refresh tokens are stored hashed in the existing `Session` table.

`requireAuth` checks the `Authorization: Bearer` header first; if present and valid the JWT wins. Otherwise it falls back to the cookie. `requireAdmin` reads `req.user.role` either way.

See `docs/superpowers/specs/2026-06-14-mobile-oauth-token-auth-design.md` for the full design.

---

## Auth Routes

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/auth/google` | Public | Initiate Google OAuth (add `?platform=mobile` for Flutter flow) |
| GET | `/auth/google/callback` | Public | Google OAuth callback (branches to deep link when `state.platform === "mobile"`) |
| GET | `/auth/discord` | Public | Initiate Discord OAuth (add `?platform=mobile` for Flutter flow) |
| GET | `/auth/discord/callback` | Public | Discord OAuth callback (branches to deep link when `state.platform === "mobile"`) |
| POST | `/auth/logout` | Protected | Logout web session (cookie) |
| POST | `/auth/refresh` | Public + Rate Limited (30/min) | Exchange a mobile refresh token for a fresh `{access, refresh}` pair (rotation + reuse detection) |
| POST | `/auth/logout-mobile` | Bearer + Rate Limited (10/min/user) | Revoke a mobile refresh token (idempotent) |
| GET | `/auth/me` | Public | Get current user (returns `{ user: null }` if unauthenticated). Accepts cookie or Bearer. |
| POST | `/auth/dev-login` | Dev only | Create session without OAuth (non-production) |

### GET /auth/me — Response

```json
{
  "user": {
    "id": "cuid",
    "email": "user@example.com",
    "username": null,
    "fullName": "John Doe",
    "displayName": "John",
    "avatarUrl": "https://...",
    "lastLoginAt": "2026-05-15T00:00:00.000Z",
    "lastLoginProvider": "GOOGLE",
    "role": "USER",
    "walletBalance": 50000,
    "totalTopUp": 100000,
    "totalSpent": 50000,
    "freeAudio": {
      "dateKey": "2026-05-15",
      "usedToday": 1,
      "dailyLimit": 3,
      "paidAudioCost": 2000
    },
    "providers": ["GOOGLE"]
  }
}
```

### POST /auth/dev-login — Body

```json
{ "email": "test@example.com", "displayName": "Test User" }
```

### GET /auth/google?platform=mobile and /auth/discord?platform=mobile

When `platform=mobile` is present, the entry handler signs a `state` HMAC carrying `{platform: "mobile", nonce}` with `JWT_SECRET` and passes it through Passport. The callback verifies the HMAC and branches:

- **Mobile branch (`state.platform === "mobile"`):** issues an access JWT (HS256, TTL `ACCESS_TOKEN_TTL_DAYS`, default 7d) plus an opaque refresh token (32 random bytes, stored as SHA-256 hash in `Session`, TTL `REFRESH_TOKEN_TTL_DAYS`, default 30d), then redirects to `${MOBILE_DEEP_LINK_REDIRECT}?access=<jwt>&refresh=<token>`.
- **OAuth failure:** redirects to `${MOBILE_DEEP_LINK_REDIRECT}?error=oauth_failed`.
- **Forged state (HMAC mismatch):** redirects to `${FRONTEND_URL}/?login=failed` (refuses to redirect to a deep link).
- **Web branch (no `platform`):** existing behavior unchanged — redirects to `${FRONTEND_URL}/?login=success`.

### POST /auth/refresh

**Body:**
```json
{ "refresh": "<token>" }
```

**Response 200:**
```json
{
  "access": "<new JWT>",
  "refresh": "<new opaque token>",
  "expiresIn": 604800
}
```

**Errors:**
- `400 { "error": "refresh required" }` — body missing the field
- `401 { "error": "refresh_invalid" }` — token not found, expired, or already rotated
- `429` — rate limit hit (30/min)

**Behavior:** validates the incoming refresh (lookup by SHA-256 hash, check `expiresAt > NOW()`), then atomically deletes the old `Session` row and inserts a new one with a freshly generated refresh token. Issues a new access JWT bound to the same user. Reuse of an already-rotated token deletes **all** of that user's `Session` rows (RFC 6819 §5.2.2.3 reuse detection) and returns `refresh_invalid`.

### POST /auth/logout-mobile

**Headers:** `Authorization: Bearer <access JWT>` required (so we can identify the caller even if their refresh has already been wiped).

**Body:**
```json
{ "refresh": "<token>" }
```

**Response 200:**
```json
{ "ok": true }
```

Idempotent — succeeds whether or not the matching `Session` row exists. Rate limit: 10/min per user. The access JWT remains technically valid until its `exp`, but the app is expected to wipe local storage.

---

## Upload Routes

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/upload` | Protected + API Key + Rate Limited | Upload processed audio |

### POST /upload

**Headers:** `x-api-key` (required if `UPLOAD_API_KEY` is set)  
**Body:** `multipart/form-data` with field `file` (audio: WAV, MP3, OGG)

**Response (201):**
```json
{
  "ok": true,
  "upload": {
    "id": "cuid",
    "fileName": "track.wav",
    "fileFormat": "wav",
    "createdAt": "2026-05-15T00:00:00.000Z",
    "costRupiah": 0,
    "freeCovered": 1,
    "paidUnits": 0
  }
}
```

**Error (402):**
```json
{
  "error": "Insufficient balance",
  "required": 2000,
  "balance": 0,
  "freeRemaining": 0
}
```

---

## History Routes

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/history` | Protected | List upload history |
| GET | `/history/:id/download` | Protected | Download previous upload |

### GET /history — Response

```json
{
  "uploads": [
    {
      "id": "cuid",
      "publicId": "UPL-WAV-2606-000001",
      "fileName": "track.wav",
      "fileFormat": "wav",
      "status": "COMPLETED",
      "source": "studio",
      "durationSec": null,
      "createdAt": "2026-05-15T00:00:00.000Z",
      "updatedAt": "2026-05-15T00:00:00.000Z",
      "metadata": {},
      "activity": {
        "id": "cuid",
        "title": "Audio uploaded",
        "description": "Saved track.wav",
        "amountRupiah": 0,
        "createdAt": "2026-05-15T00:00:00.000Z"
      }
    }
  ]
}
```

---

## Top-Up Routes

| Method | Path | Access | Validation | Description |
|--------|------|--------|------------|-------------|
| POST | `/topup/create` | Protected | Zod: `createTopUpSchema` | Create QRIS payment via MustikaPay |
| GET | `/topup/status/:reference` | Protected | — | DB-only status check (no provider calls) |
| POST | `/webhooks/mustika` | Public | — | MustikaPay webhook: acknowledge immediately, verify async |
| POST | `/topup/check/:reference` | Protected | — | Manual check with 30s cooldown |

### POST /topup/create — Body

```json
{
  "amount": 50000,
  "customer_name": "John",
  "customer_email": "john@example.com",
  "customer_phone": "08123456789"
}
```

**Validation:** `amount` integer, min 1000, max 500000.

**Response (201):**
```json
{
  "ok": true,
  "orderId": "cuid",
  "publicId": "TOP-IDR-2606-000001",
  "invoiceId": "QR1776670534209",
  "amount": 50000,
  "paymentUrl": "https://mustikapayment.com/pay/QR1776670534209",
  "qrisImageUrl": "https://mustikapayment.com/qris/QR1776670534209.png",
  "expiresAt": "2026-05-15T00:20:00.000Z"
}
```

### GET /topup/status/:reference — Response

```json
{
  "ok": true,
  "publicId": "TOP-IDR-2606-000001",
  "paid": false,
  "status": "PENDING",
  "amount": 50000,
  "finalAmount": null,
  "qrisImageUrl": "https://mustikapayment.com/qris/QR1776670534209.png",
  "paymentUrl": "https://mustikapayment.com/pay/QR1776670534209",
  "expiresAt": "2026-05-15T00:20:00.000Z",
  "createdAt": "2026-05-15T00:00:00.000Z",
  "updatedAt": "2026-05-15T00:00:00.000Z"
}
```

The status endpoint is **DB-only** — it does not call the MustikaPay API. Use `POST /topup/check/:reference` for manual confirmation with provider verification.

### POST /webhooks/mustika

**Headers:** `none required (untrusted webhook)`, `verified via Check Status`  
**Behavior:** Returns 200 immediately, then asynchronously verifies ref_no via GET /api/v1/check/qris before crediting wallet. Idempotent (duplicate webhooks are safely ignored).

---

## Product Routes (Store)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/products` | Public | List products (filter, search, sort, paginate) |
| GET | `/products/categories` | Public | List categories |
| GET | `/products/:idOrSlug` | Public | Product detail |

### GET /products — Query Params

| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category slug |
| `search` | string | Search name/description/tags |
| `featured` | `"true"` | Featured only |
| `sort` | string | `newest`, `price-asc`, `price-desc`, `name` |
| `page` | number | Page (default: 1) |
| `limit` | number | Per page (default: 20) |

### GET /products — Response

```json
{
  "products": [
    {
      "id": "cuid",
      "publicId": "PRD-SCR-2606-000001",
      "name": "Advanced UI System",
      "slug": "advanced-ui-system",
      "shortDesc": "Complete UI framework",
      "thumbnail": "https://...",
      "pricePersonal": 25000,
      "priceCommercial": 75000,
      "priceEnterprise": 200000,
      "featured": true,
      "version": "1.2.0",
      "tags": ["ui", "framework"],
      "category": { "id": "cuid", "name": "UI Systems", "slug": "ui-systems" },
      "image": "https://...",
      "soldCount": 42,
      "createdAt": "2026-05-01T00:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 15, "totalPages": 1 }
}
```

---

## Cart Routes

| Method | Path | Access | Validation | Description |
|--------|------|--------|------------|-------------|
| GET | `/cart` | Protected | — | Get cart |
| POST | `/cart/add` | Protected | Zod: `addToCartSchema` | Add to cart |
| DELETE | `/cart/:itemId` | Protected | — | Remove item |
| DELETE | `/cart` | Protected | — | Clear cart |

### POST /cart/add — Body

```json
{ "productId": "cuid", "licenseType": "PERSONAL" }
```

`licenseType`: `PERSONAL` | `COMMERCIAL` | `ENTERPRISE`

---

## Checkout Route

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/checkout` | Protected | Purchase all cart items |

### POST /checkout — Response (201)

```json
{
  "ok": true,
  "purchases": [
    { "id": "cuid", "publicId": "PUR-PER-2606-000001", "productId": "cuid", "licenseType": "PERSONAL", "amountRupiah": 25000 }
  ],
  "licenses": [
    { "id": "cuid", "publicId": "LIC-PER-2606-000001", "productId": "cuid", "licenseKey": "RBXR-A1B2-C3D4-E5F6-G7H8", "licenseType": "PERSONAL", "maxGames": 3 }
  ],
  "totalCharged": 25000,
  "newBalance": 75000
}
```

---

## License Management Routes

| Method | Path | Access | Validation | Description |
|--------|------|--------|------------|-------------|
| GET | `/licenses` | Protected | — | List user's licenses |
| GET | `/licenses/:id` | Protected | — | License detail |
| POST | `/licenses/:id/whitelist` | Protected | Zod: `addGameWhitelistSchema` | Add game |
| DELETE | `/licenses/:id/whitelist/:gameWhitelistId` | Protected | — | Remove game |
| GET | `/licenses/:id/download` | Protected | — | Download script file |

### POST /licenses/:id/whitelist — Body

```json
{ "gameId": "123456789", "gameName": "My Roblox Game" }
```

**License tier limits:** Personal = 3 games, Commercial = 10, Enterprise = unlimited.

---

## License Verification (Roblox Integration)

| Method | Path | Access | Validation | Description |
|--------|------|--------|------------|-------------|
| POST | `/api/verify-license` | Public (rate limited: 30/min) | Zod: `verifyLicenseSchema` | Verify license from Roblox |

### POST /api/verify-license — Body

```json
{ "licenseKey": "RBXR-A1B2-C3D4-E5F6-G7H8", "gameId": "123456789", "gameName": "My Game" }
```

### Response (valid)

```json
{
  "valid": true,
  "message": "License verified successfully",
  "product": { "name": "Advanced UI System", "version": "1.2.0" },
  "license": { "type": "PERSONAL", "expiresAt": null }
}
```

### Response (invalid)

```json
{ "valid": false, "message": "Game is not whitelisted for this license. Add it in your dashboard." }
```

**Verification checks (in order):** key exists → status ACTIVE → not expired → product active → game whitelisted.

### Roblox Lua Example

```lua
local HttpService = game:GetService("HttpService")
local LICENSE_KEY = "RBXR-A1B2-C3D4-E5F6-G7H8"
local VERIFY_URL = "https://yourdomain.com/api/verify-license"

local function verifyLicense()
    local ok, res = pcall(function()
        return HttpService:PostAsync(VERIFY_URL, HttpService:JSONEncode({
            licenseKey = LICENSE_KEY,
            gameId = tostring(game.PlaceId),
            gameName = game.Name
        }), Enum.HttpContentType.ApplicationJson)
    end)
    if ok then
        local data = HttpService:JSONDecode(res)
        if data.valid then
            print("[License] OK:", data.product.name, "v" .. data.product.version)
            return true
        end
        warn("[License]", data.message)
    else
        warn("[License] Network error:", res)
    end
    return false
end

if not verifyLicense() then
    error("Invalid license. Purchase at https://yourdomain.com/store")
end
```

---

## Admin Routes

All admin routes require `requireAuth` + `requireAdmin` (user.role === "ADMIN").

| Method | Path | Validation | Description |
|--------|------|------------|-------------|
| GET | `/admin/products` | — | List all products (incl. inactive) |
| POST | `/admin/products` | Zod: `createProductSchema` | Create product |
| PUT | `/admin/products/:id` | Zod: `updateProductSchema` | Update product |
| DELETE | `/admin/products/:id` | — | Deactivate product |
| POST | `/admin/products/:id/files` | Zod: `addProductFileSchema` | Add file record |
| DELETE | `/admin/products/:productId/files/:fileId` | — | Remove file |
| POST | `/admin/categories` | Zod: `createCategorySchema` | Create category |
| PUT | `/admin/categories/:id` | Zod: `updateCategorySchema` | Update category |
| DELETE | `/admin/categories/:id` | — | Deactivate category |
| GET | `/admin/licenses` | — | List all licenses (filterable) |
| PUT | `/admin/licenses/:id/status` | Zod: `updateLicenseStatusSchema` | Suspend/revoke/activate |
| GET | `/admin/analytics` | — | Sales overview |

---

## Health Routes

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/health` | Public | Server health |
| GET | `/db-health` | Public | Database connection check |

---

## Security Notes

- **CORS:** Explicit origin from `CORS_ORIGIN` env (no wildcard with credentials)
- **Session:** `SESSION_SECRET` required in production (server exits if missing)
- **JWT:** `JWT_SECRET` required in production (server exits if missing). HS256 algorithm pinned at verify (`alg: none` rejected). Access JWT payload is `{ sub, role, iat, exp }` — no PII, no provider tokens.
- **Refresh tokens:** Stored as SHA-256 hashes in `Session.sessionToken`; rotation on every `/auth/refresh`; reuse of a rotated token revokes all of that user's sessions.
- **OAuth state:** HMAC-signed with `JWT_SECRET` to prevent callback hijack into a malicious deep link.
- **Rate limiting:** Upload endpoint, verify-license (30/min), `/auth/refresh` (30/min), `/auth/logout-mobile` (10/min/user)
- **Webhook:** HMAC SHA256 signature verification + atomic idempotent processing
- **Admin files:** Path traversal blocked (no `..`, must be relative)
- **Validation:** Zod schemas on all state-changing endpoints

---

## Error Format

```json
{
  "error": "Human-readable message",
  "details": [
    { "field": "amount", "message": "Minimum Rp 1,000" }
  ]
}
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error |
| 401 | Not authenticated |
| 402 | Insufficient balance |
| 403 | Forbidden (not admin, max games) |
| 404 | Not found |
| 409 | Conflict (duplicate) |
| 429 | Rate limited |
| 500 | Server error |
| 502 | Payment gateway error |

---

## Wallet Model

Single source of truth: `User.walletBalance` (Rupiah).  
All mutations recorded in `WalletTransaction` ledger with `balanceAfter` snapshot.

| Transaction Type | Trigger |
|-----------------|---------|
| `TOP_UP` | MustikaPay webhook (verified via Check Status) or manual check confirms payment |
| `PURCHASE` | Script checkout |
| `AUDIO_CHARGE` | Paid audio upload (after free quota) |
| `REFUND` | Admin refund |
| `ADJUSTMENT` | Admin correction |

---

## Pricing

**Audio processing (per upload after free quota):**  
`User.paidAudioCost` (default: Rp 2,000)

**Free quota:** 3 uploads/day, resets at midnight (date key comparison).

**Script store:** Per-product pricing with 3 tiers (Personal/Commercial/Enterprise).
