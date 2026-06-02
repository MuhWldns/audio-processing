# RBX Royale — Backend API

Backend API untuk platform RBX Royale. Menyediakan layanan audio processing, script store, license management, dan wallet/top-up.

## Tech Stack

- **Runtime:** Bun
- **Framework:** Express.js
- **Database:** MySQL via Prisma ORM
- **Auth:** Session-based OAuth (Google, Discord)
- **Payment:** Bayar.gg (QRIS)
- **Testing:** Vitest + Supertest

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [MySQL](https://www.mysql.com/) (v8.0+)
- Node.js (untuk Prisma CLI)

## Setup

### 1. Install dependencies

```bash
cd backend
bun install
```

### 2. Konfigurasi environment

```bash
cp .env.example .env
```

Edit `.env` dan isi semua values yang diperlukan. Lihat `.env.example` untuk daftar lengkap.

### 3. Setup database

```bash
# Generate Prisma client
npx prisma generate

# Jalankan migration
npx prisma migrate dev

# (Optional) Reset database
npx prisma db push --force-reset
```

### 4. Setup OAuth

1. Buat project di [Google Cloud Console](https://console.cloud.google.com/)
2. Buat app di [Discord Developer Portal](https://discord.com/developers/applications)
3. Set redirect URLs:
   - Google: `http://localhost:3001/auth/google/callback`
   - Discord: `http://localhost:3001/auth/discord/callback`
4. Copy Client ID dan Secret ke `.env`

### 5. Setup Payment Gateway

1. Daftar di [Bayar.gg](https://www.bayar.gg/)
2. Dapatkan API Key dan Webhook Secret
3. Set webhook URL (untuk production) atau gunakan webhook test URL untuk development
4. Copy credentials ke `.env`

## Menjalankan Server

```bash
# Development
bun run src/server.js

# Server berjalan di http://localhost:3001
```

## API Documentation

Dokumentasi API lengkap tersedia di file `openapi.yaml` (OpenAPI 3.0.3 format).

Preview dengan:
```bash
npx @redocly/cli preview-docs openapi.yaml
```

Atau import ke Postman/Swagger UI.

### Endpoint Overview

| Group | Endpoints | Auth |
|-------|-----------|------|
| Health | `GET /health`, `GET /db-health` | Public |
| Auth | OAuth login, logout, session | Public/Session |
| Upload | `POST /upload` | Session + API Key |
| History | `GET /history`, download | Session |
| Top-Up | Create, status, webhook | Session/Webhook |
| Products | List, detail, categories | Public |
| Cart | Add, remove, clear | Session |
| Checkout | Purchase items | Session |
| Licenses | List, detail, whitelist, download | Session |
| Verification | Verify license key | Public (from Roblox) |
| Admin | Products, categories, licenses, analytics | Admin |

## Struktur Folder

```
backend/
├── src/
│   ├── server.js              # Entry point, route registration
│   ├── prisma.js              # Prisma client instance
│   ├── config/                # Configuration constants
│   ├── controllers/           # Route handlers
│   │   ├── authController.js
│   │   ├── topupController.js
│   │   ├── uploadController.js
│   │   ├── checkoutController.js
│   │   ├── productController.js
│   │   ├── cartController.js
│   │   ├── licenseController.js
│   │   ├── verifyLicenseController.js
│   │   ├── adminController.js
│   │   ├── devController.js
│   │   └── healthController.js
│   ├── services/              # Business logic
│   │   ├── authService.js     # OAuth, session, quota
│   │   ├── databaseService.js # Wallet operations (creditWallet, debitWallet)
│   │   ├── bayarService.js    # Bayar.gg payment gateway
│   │   ├── walletService.js   # Audio charge utilities
│   │   ├── pricingService.js  # Duration-based pricing
│   │   └── uploadService.js   # File upload handling
│   ├── middlewares/           # Express middlewares
│   │   ├── auth.js            # requireAuth
│   │   ├── admin.js           # requireAdmin
│   │   ├── upload.js          # File validation
│   │   └── rateLimit.js       # Rate limiting
│   └── utils/                 # Helper functions
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Migration history
├── tests/                     # Test files (Vitest)
├── uploads/                   # Uploaded files (gitignored)
├── openapi.yaml               # API documentation
├── .env.example               # Environment template
└── package.json
```

## Database Schema

### Model Utama

| Model | Deskripsi |
|-------|-----------|
| `User` | User account + wallet balance (single source of truth) |
| `WalletTransaction` | Unified ledger (TOP_UP, PURCHASE, AUDIO_CHARGE, REFUND, ADJUSTMENT) |
| `TopUpOrder` | Payment gateway order tracking |
| `UsageEvent` | Audio processing detail (durasi, format, cost) |
| `Product` | Script store products |
| `License` | User licenses (per purchase) |
| `GameWhitelist` | Roblox game IDs per license |
| `Purchase` | Purchase records |
| `Cart` / `CartItem` | Shopping cart |

### Public IDs

Business records keep internal CUID `id` values for database relations and also expose nullable unique `publicId` values for UI, invoice, admin, and support references.

| Model | Format |
|-------|--------|
| `User` | `ACC-IDN-YYMM-000001` |
| `TopUpOrder` | `TOP-IDR-YYMM-000001` |
| `WalletTransaction` | `TXN-TOP/PUR/AUD/REF/ADJ-YYMM-000001` |
| `Purchase` | `PUR-PER/COM/ENT-YYMM-000001` |
| `License` | `LIC-PER/COM/ENT-YYMM-000001` |
| `Product` | `PRD-AUD/RBX/SCR-YYMM-000001` |
| `UploadRecord` | `UPL-WAV/MP3/OGG-YYMM-000001` |
| `UsageEvent` | `USE-FREE/PAID-YYMM-000001` |

`PublicIdCounter` stores per-scope counters such as `PUR-COM-2606`. Existing rows can be filled with:

```bash
bun run backfill:public-ids
```

`publicId` remains nullable during staged rollout; run the backfill before any future `NOT NULL` migration.

### Wallet System

- **Single source of truth:** `User.walletBalance` (Rupiah)
- **Unified ledger:** `WalletTransaction` tracks semua mutasi
- **Operations:** `creditWallet()` dan `debitWallet()` di `databaseService.js`
- **Atomic:** Semua balance mutations pakai Prisma `$transaction`

## Testing

```bash
# Jalankan semua tests
bun run test

# Jalankan test tertentu
bun run test -- --filter topup
```

## Development Notes

### Dev Login (tanpa OAuth)

Untuk testing tanpa setup OAuth:
```bash
POST http://localhost:3001/auth/dev-login
Content-Type: application/json

{"email": "test@example.com", "displayName": "Test User"}
```

Endpoint ini hanya tersedia saat `NODE_ENV !== "production"`.

### Pricing (Audio Processing)

Harga berdasarkan durasi audio:
- 0-2 menit: Rp 2.000
- 2-3 menit: Rp 2.500
- 3-4 menit: Rp 3.000
- 4-5 menit: Rp 3.500
- 5-6 menit: Rp 4.000
- 6-7 menit: Rp 4.500
- 7+ menit: Rp 5.000 (max)

Free quota: 3 audio/hari.

### License Verification (dari Roblox)

```lua
-- Contoh di Roblox game
local HttpService = game:GetService("HttpService")
local response = HttpService:PostAsync(
  "https://yourdomain.com/api/verify-license",
  HttpService:JSONEncode({
    licenseKey = "RBXR-XXXX-XXXX-XXXX-XXXX",
    gameId = tostring(game.PlaceId),
    gameName = game.Name
  }),
  Enum.HttpContentType.ApplicationJson
)
```
