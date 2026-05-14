# Backend API Routes Documentation

## Base URL

```
http://localhost:3001
```

---

## Authentication

All protected routes require an active session cookie (`connect.sid`). Session is established via OAuth login flow.

---

## Auth Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/auth/google` | No | Initiate Google OAuth login |
| GET | `/auth/google/callback` | No | Google OAuth callback |
| GET | `/auth/discord` | No | Initiate Discord OAuth login |
| GET | `/auth/discord/callback` | No | Discord OAuth callback |
| POST | `/auth/logout` | Yes | Logout current session |
| GET | `/auth/me` | No | Get current user data (returns null if not logged in) |

### GET /auth/me

**Response (authenticated):**
```json
{
  "user": {
    "id": "cuid",
    "email": "user@example.com",
    "username": null,
    "fullName": "John Doe",
    "displayName": "John",
    "avatarUrl": "https://...",
    "lastLoginAt": "2026-05-14T00:00:00.000Z",
    "lastLoginProvider": "GOOGLE",
    "wallet": {
      "balanceTokens": 50000,
      "reservedTokens": 0,
      "lifetimeTopUp": 100000,
      "lifetimeSpent": 50000,
      "availableTokens": 50000
    },
    "freeAudio": {
      "dateKey": "2026-05-14",
      "usedToday": 1,
      "dailyLimit": 3,
      "paidAudioTokenCost": 1
    },
    "providers": ["GOOGLE"]
  }
}
```

---

## Upload Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/upload` | Yes | Upload processed audio file |

### POST /upload

**Headers:**
- `x-api-key` (optional, if configured)

**Body:** `multipart/form-data`
- `file` - Audio file (WAV, MP3, OGG, FLAC, M4A)

**Response (201):**
```json
{
  "ok": true,
  "upload": {
    "id": "cuid",
    "fileName": "track-processed.wav",
    "fileFormat": "wav",
    "createdAt": "2026-05-14T00:00:00.000Z",
    "tokenCost": 0,
    "freeCovered": 1,
    "paidUnits": 0
  }
}
```

**Error (402 - Insufficient tokens):**
```json
{
  "error": "Not enough tokens",
  "requiredTokens": 1,
  "balanceTokens": 0,
  "freeRemaining": 0
}
```

---

## History Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/history` | Yes | Get upload history |
| GET | `/history/:id/download` | Yes | Download a previous upload |

### GET /history

**Response:**
```json
{
  "uploads": [
    {
      "id": "cuid",
      "fileName": "track.wav",
      "fileFormat": "wav",
      "status": "COMPLETED",
      "source": "studio",
      "durationSec": null,
      "createdAt": "2026-05-14T00:00:00.000Z",
      "updatedAt": "2026-05-14T00:00:00.000Z",
      "metadata": { "storedFileName": "1715...-track.wav" },
      "activity": {
        "id": "cuid",
        "title": "Audio uploaded",
        "description": "Saved track.wav",
        "amountTokens": 0,
        "createdAt": "2026-05-14T00:00:00.000Z"
      }
    }
  ]
}
```

### GET /history/:id/download

**Response:** File stream (audio file)

---

## Top-Up Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/topup/create` | Yes | Create QRIS payment via Bayar.gg |
| GET | `/topup/status/:reference` | Yes | Poll payment status |
| POST | `/webhooks/bayar` | No | Bayar.gg webhook (signature verified) |

### POST /topup/create

**Body:**
```json
{
  "amount": 50000,
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "customer_phone": "08123456789"
}
```

**Validation:**
- `amount` must be integer
- Minimum: Rp 1,000
- Maximum: Rp 500,000

**Response (201):**
```json
{
  "ok": true,
  "orderId": "cuid",
  "invoiceId": "INV-xxx",
  "amount": 50000,
  "tokensBought": 50000,
  "paymentUrl": "https://bayar.gg/pay/...",
  "expiresAt": "2026-05-14T00:15:00.000Z"
}
```

### GET /topup/status/:reference

**Params:** `reference` - Order ID or external invoice ID

**Response:**
```json
{
  "ok": true,
  "paid": false,
  "status": "PENDING",
  "amount": 50000,
  "tokensBought": 50000,
  "createdAt": "2026-05-14T00:00:00.000Z",
  "updatedAt": "2026-05-14T00:00:00.000Z"
}
```

### POST /webhooks/bayar

**Headers:**
- `x-webhook-signature` - HMAC SHA256 signature
- `x-webhook-timestamp` - Timestamp

**Body (from Bayar.gg):**
```json
{
  "invoice_id": "INV-xxx",
  "status": "paid",
  "amount": 50000,
  "final_amount": 50000,
  "unique_code": "123",
  "paid_at": "2026-05-14T00:05:00.000Z",
  "paid_reff_num": "REF123"
}
```

**Behavior on `status: "paid"`:**
1. Verify HMAC signature
2. Find order by invoice ID
3. Skip if already COMPLETED
4. Atomic transaction: create activity log → create TopUpTransaction → update token wallet → update Rupiah wallet → create TokenTransaction → update order status

---

## Product Routes (Store)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/products` | No | List products (with filters) |
| GET | `/products/categories` | No | List product categories |
| GET | `/products/:idOrSlug` | No | Get product detail |

### GET /products

**Query params:**
- `category` - Filter by category slug
- `search` - Search in name, description, tags
- `featured` - `"true"` to show only featured
- `sort` - `newest` (default), `price-asc`, `price-desc`, `name`
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Response:**
```json
{
  "products": [
    {
      "id": "cuid",
      "name": "Advanced UI System",
      "slug": "advanced-ui-system",
      "shortDesc": "Complete UI framework for Roblox games",
      "thumbnail": "https://...",
      "pricePersonal": 25000,
      "priceCommercial": 75000,
      "priceEnterprise": 200000,
      "featured": true,
      "version": "1.2.0",
      "tags": ["ui", "framework", "menu"],
      "category": { "id": "cuid", "name": "UI Systems", "slug": "ui-systems" },
      "image": "https://...",
      "soldCount": 42,
      "createdAt": "2026-05-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "totalPages": 1
  }
}
```

### GET /products/categories

**Response:**
```json
{
  "categories": [
    {
      "id": "cuid",
      "name": "UI Systems",
      "slug": "ui-systems",
      "description": "Interface frameworks and HUDs",
      "icon": "layout",
      "productCount": 5
    }
  ]
}
```

### GET /products/:idOrSlug

**Response:**
```json
{
  "id": "cuid",
  "name": "Advanced UI System",
  "slug": "advanced-ui-system",
  "description": "Full markdown description...",
  "shortDesc": "Complete UI framework",
  "thumbnail": "https://...",
  "pricePersonal": 25000,
  "priceCommercial": 75000,
  "priceEnterprise": 200000,
  "featured": true,
  "version": "1.2.0",
  "tags": ["ui", "framework"],
  "category": { "id": "cuid", "name": "UI Systems", "slug": "ui-systems" },
  "images": [
    { "id": "cuid", "url": "https://...", "alt": "Screenshot 1", "sortOrder": 0 }
  ],
  "docs": [
    { "id": "cuid", "fileName": "README.md", "fileType": "documentation", "version": "1.2.0" }
  ],
  "soldCount": 42,
  "createdAt": "2026-05-01T00:00:00.000Z",
  "updatedAt": "2026-05-10T00:00:00.000Z"
}
```

---

## Cart Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/cart` | Yes | Get cart contents |
| POST | `/cart/add` | Yes | Add product to cart |
| DELETE | `/cart/:itemId` | Yes | Remove item from cart |
| DELETE | `/cart` | Yes | Clear entire cart |

### GET /cart

**Response:**
```json
{
  "items": [
    {
      "id": "cuid",
      "productId": "cuid",
      "product": {
        "id": "cuid",
        "name": "Advanced UI System",
        "slug": "advanced-ui-system",
        "thumbnail": "https://...",
        "pricePersonal": 25000,
        "priceCommercial": 75000,
        "priceEnterprise": 200000,
        "active": true
      },
      "licenseType": "PERSONAL",
      "priceRupiah": 25000,
      "addedAt": "2026-05-14T00:00:00.000Z"
    }
  ],
  "total": 25000
}
```

### POST /cart/add

**Body:**
```json
{
  "productId": "cuid",
  "licenseType": "PERSONAL"
}
```

`licenseType` options: `PERSONAL`, `COMMERCIAL`, `ENTERPRISE`

**Response (201):**
```json
{
  "ok": true,
  "item": { "id": "cuid", "cartId": "cuid", "productId": "cuid", "licenseType": "PERSONAL", "priceRupiah": 25000 },
  "updated": false
}
```

**Error (409):**
```json
{ "error": "You already own a license for this product" }
```

---

## Checkout Route

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/checkout` | Yes | Purchase all cart items |

### POST /checkout

No body required. Purchases all items currently in cart.

**Flow:**
1. Validate cart has items
2. Filter out inactive products
3. Check wallet balance >= total
4. Check no duplicate licenses
5. Atomic: deduct balance → create purchases → generate license keys → create licenses → log activity → clear cart

**Response (201):**
```json
{
  "ok": true,
  "purchases": [
    {
      "id": "cuid",
      "productId": "cuid",
      "licenseType": "PERSONAL",
      "amountRupiah": 25000
    }
  ],
  "licenses": [
    {
      "id": "cuid",
      "productId": "cuid",
      "licenseKey": "RBXR-A1B2-C3D4-E5F6-G7H8",
      "licenseType": "PERSONAL",
      "maxGames": 3
    }
  ],
  "totalCharged": 25000,
  "newBalance": 75000
}
```

**Error (402):**
```json
{
  "error": "Insufficient balance",
  "required": 25000,
  "balance": 10000,
  "shortfall": 15000
}
```

---

## License Management Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/licenses` | Yes | List user's licenses |
| GET | `/licenses/:id` | Yes | Get license detail |
| POST | `/licenses/:id/whitelist` | Yes | Add game to whitelist |
| DELETE | `/licenses/:id/whitelist/:gameWhitelistId` | Yes | Remove game from whitelist |
| GET | `/licenses/:id/download` | Yes | Download script files |

### GET /licenses

**Response:**
```json
{
  "licenses": [
    {
      "id": "cuid",
      "licenseKey": "RBXR-A1B2-C3D4-E5F6-G7H8",
      "licenseType": "PERSONAL",
      "status": "ACTIVE",
      "maxGames": 3,
      "expiresAt": null,
      "lastVerifiedAt": "2026-05-14T00:00:00.000Z",
      "product": {
        "id": "cuid",
        "name": "Advanced UI System",
        "slug": "advanced-ui-system",
        "thumbnail": "https://...",
        "version": "1.2.0"
      },
      "games": [
        { "id": "cuid", "gameId": "123456789", "gameName": "My Game", "addedAt": "..." }
      ],
      "verificationCount": 15,
      "createdAt": "2026-05-01T00:00:00.000Z"
    }
  ]
}
```

### POST /licenses/:id/whitelist

**Body:**
```json
{
  "gameId": "123456789",
  "gameName": "My Roblox Game"
}
```

`gameId` is the Roblox placeId or universeId.

**Response (201):**
```json
{
  "ok": true,
  "game": {
    "id": "cuid",
    "licenseId": "cuid",
    "gameId": "123456789",
    "gameName": "My Roblox Game",
    "active": true,
    "addedAt": "2026-05-14T00:00:00.000Z"
  }
}
```

**Error (403 - max games reached):**
```json
{
  "error": "Maximum games reached for this license tier",
  "maxGames": 3,
  "currentGames": 3
}
```

### GET /licenses/:id/download

**Response:** File stream (script file)

---

## License Verification (Roblox Integration)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/verify-license` | No | Verify license key from Roblox game |

### POST /api/verify-license

This endpoint is called from Roblox game servers. No session auth required - uses license key for authentication.

**Body:**
```json
{
  "licenseKey": "RBXR-A1B2-C3D4-E5F6-G7H8",
  "gameId": "123456789",
  "gameName": "My Roblox Game"
}
```

**Response (valid):**
```json
{
  "valid": true,
  "message": "License verified successfully",
  "product": {
    "name": "Advanced UI System",
    "version": "1.2.0"
  },
  "license": {
    "type": "PERSONAL",
    "expiresAt": null
  }
}
```

**Response (invalid - various reasons):**
```json
{ "valid": false, "message": "Invalid license key" }
{ "valid": false, "message": "License is suspended" }
{ "valid": false, "message": "License has expired" }
{ "valid": false, "message": "Product is no longer available" }
{ "valid": false, "message": "Game is not whitelisted for this license. Add it in your dashboard.", "licenseType": "PERSONAL" }
```

**Roblox Lua Integration Example:**
```lua
local HttpService = game:GetService("HttpService")

local LICENSE_KEY = "RBXR-A1B2-C3D4-E5F6-G7H8"
local VERIFY_URL = "https://yourdomain.com/api/verify-license"

local function verifyLicense()
    local success, response = pcall(function()
        return HttpService:PostAsync(VERIFY_URL, HttpService:JSONEncode({
            licenseKey = LICENSE_KEY,
            gameId = tostring(game.PlaceId),
            gameName = game.Name
        }), Enum.HttpContentType.ApplicationJson)
    end)

    if success then
        local data = HttpService:JSONDecode(response)
        if data.valid then
            print("[License] Verified:", data.product.name, "v" .. data.product.version)
            return true
        else
            warn("[License] Failed:", data.message)
            return false
        end
    else
        warn("[License] Network error:", response)
        return false
    end
end

if not verifyLicense() then
    error("Invalid license. Purchase at https://yourdomain.com/store")
end
```

---

## Health Check Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Server health check |
| GET | `/db-health` | No | Database connection check |

---

## License Tier Comparison

| Feature | Personal | Commercial | Enterprise |
|---------|----------|------------|------------|
| Max Games | 3 | 10 | Unlimited |
| Expiry | Lifetime | Lifetime | Lifetime |
| Use Case | Own games | Client work | Studios |

---

## Error Codes

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation error |
| 401 | Not authenticated / invalid signature |
| 402 | Insufficient balance / tokens |
| 403 | Forbidden (max games, etc.) |
| 404 | Resource not found |
| 409 | Conflict (duplicate license, already in cart) |
| 429 | Rate limited |
| 500 | Internal server error |
| 502 | Payment gateway error |
