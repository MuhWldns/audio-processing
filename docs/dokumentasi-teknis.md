# Dokumentasi Teknis - RBX Royale Platform

## 1. Pendahuluan

### 1.1 Deskripsi Sistem

RBX Royale adalah platform komersial berbasis web yang menyediakan dua layanan utama untuk komunitas pengembang game Roblox:

1. **Script Store** - Marketplace untuk pembelian script Roblox berlisensi dengan sistem verifikasi real-time
2. **Audio Processing** - Tools pemrosesan audio berbasis browser untuk kebutuhan game development

Platform ini menggunakan arsitektur client-server dengan frontend Next.js dan backend Express.js, terintegrasi dengan payment gateway QRIS (Bayar.gg), object storage (Backblaze B2), dan email transaksional (Resend).

### 1.2 Tujuan Sistem

- Menyediakan marketplace script Roblox dengan sistem lisensi dan verifikasi
- Menyediakan tools audio processing berbasis browser
- Mengelola wallet digital dengan top-up via QRIS
- Menyediakan dashboard admin untuk manajemen produk dan lisensi
- Menyediakan API verifikasi lisensi yang dapat dipanggil dari game Roblox

---

## 2. Tech Stack dan Tools

### 2.1 Frontend

| Tool/Library | Versi | Fungsi |
|---|---|---|
| Next.js | 14.2.x | Framework React dengan App Router, SSR, SSG |
| React | 18.3.x | UI library |
| TypeScript | 5.4.x | Type safety |
| Tailwind CSS | 3.4.x | Utility-first CSS framework |
| @ffmpeg/ffmpeg | 0.12.x | Audio transcoding di browser (WASM) |

### 2.2 Backend

| Tool/Library | Versi | Fungsi |
|---|---|---|
| Bun | 1.3.x | JavaScript runtime (pengganti Node.js) |
| Express.js | 4.19.x | HTTP framework |
| Prisma | 6.19.x | ORM untuk MySQL |
| Passport.js | 0.7.x | OAuth authentication (Google, Discord) |
| Zod | 3.25.x | Schema validation |
| Multer | 1.4.x | File upload handling |
| express-session | 1.18.x | Session management |
| express-rate-limit | 7.4.x | Rate limiting |
| Helmet | 8.x | Security headers |

### 2.3 Database

| Tool | Versi | Fungsi |
|---|---|---|
| MySQL | 8.x (Docker) | Relational database |
| Prisma Migrate | 6.19.x | Database migration management |

### 2.4 External Services

| Service | Fungsi |
|---|---|
| Bayar.gg | Payment gateway QRIS (top-up wallet) |
| Backblaze B2 | Object storage untuk file script (S3-compatible) |
| Resend | Email transaksional (notifikasi top-up dan pembelian) |
| Google OAuth 2.0 | Autentikasi pengguna via Google |
| Discord OAuth 2.0 | Autentikasi pengguna via Discord |
| Cloudflare Tunnel | Expose local services ke internet (reverse proxy) |

### 2.5 Development Tools

| Tool | Fungsi |
|---|---|
| PM2 | Process manager untuk production |
| Vitest | Unit testing framework |
| Supertest | HTTP assertion testing |
| AWS CLI | Upload backup ke Backblaze B2 |

---

## 3. Arsitektur Sistem

### 3.1 Overview

Sistem terdiri dari 3 layer utama:

**Client Layer (Browser)**
- Next.js frontend yang di-serve sebagai standalone server
- Audio processing menggunakan Web Audio API + FFmpeg WASM (client-side)
- Komunikasi ke backend via REST API dengan session cookie

**Application Layer (Backend)**
- Express.js server yang menangani business logic
- Session-based authentication via Passport.js
- Semua operasi wallet dan transaksi bersifat atomic (database transaction)

**Data Layer**
- MySQL database sebagai single source of truth
- Backblaze B2 untuk file storage (script files)
- In-memory session store (express-session default)

### 3.2 Komunikasi Antar Komponen

`
Browser (audio.muhwldns.me:5174)
    |
    | HTTPS (Cloudflare Tunnel)
    v
Backend API (api-rbx.muhwldns.me:3001)
    |
    |--- MySQL (127.0.0.1:3306) - Docker container
    |--- Backblaze B2 (S3 API) - File storage
    |--- Bayar.gg API - Payment gateway
    |--- Resend API - Email sending
    |
    | Webhook (inbound)
    |<-- Bayar.gg (payment confirmation)
`

### 3.3 Port Mapping

| Service | Port | Domain |
|---|---|---|
| Backend API | 3001 | api-rbx.muhwldns.me |
| Frontend Next.js | 5174 | audio.muhwldns.me |
| MySQL (Docker) | 3306 | localhost only |


---

## 4. Database Schema

### 4.1 Daftar Tabel

Sistem menggunakan 18 tabel yang terbagi dalam 4 domain:

**Domain Autentikasi & User:**
- User, OAuthAccount, Session

**Domain Wallet & Transaksi:**
- WalletTransaction, TopUpOrder

**Domain Audio Processing:**
- UsageEvent, ActivityLog, UploadRecord

**Domain Script Store:**
- ProductCategory, Product, ProductFile, ProductImage, License, GameWhitelist, LicenseVerification, Purchase, Cart, CartItem

### 4.2 Detail Tabel

#### User

Tabel utama yang menyimpan data pengguna. Wallet balance disimpan langsung di tabel ini sebagai single source of truth.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| username | VARCHAR(191) | Ya | - | Username unik (opsional) |
| fullName | VARCHAR(191) | Ya | - | Nama lengkap |
| email | VARCHAR(191) | Ya | - | Email (unik) |
| displayName | VARCHAR(191) | Ya | - | Nama tampilan |
| avatarUrl | VARCHAR(512) | Ya | - | URL foto profil |
| role | ENUM(USER, ADMIN) | Tidak | USER | Role pengguna |
| isEmailVerified | BOOLEAN | Tidak | false | Status verifikasi email |
| lastLoginAt | DATETIME | Ya | - | Waktu login terakhir |
| lastLoginProvider | ENUM(GOOGLE, DISCORD) | Ya | - | Provider login terakhir |
| freeAudioDateKey | VARCHAR(10) | Ya | - | Tanggal untuk tracking quota harian |
| freeAudioUsedToday | INTEGER | Tidak | 0 | Jumlah audio gratis yang sudah dipakai hari ini |
| freeAudioDailyLimit | INTEGER | Tidak | 3 | Batas audio gratis per hari |
| paidAudioCost | INTEGER | Tidak | 2000 | Biaya per audio berbayar (Rupiah) |
| walletBalance | INTEGER | Tidak | 0 | Saldo wallet (Rupiah) |
| totalTopUp | INTEGER | Tidak | 0 | Total top-up sepanjang waktu |
| totalSpent | INTEGER | Tidak | 0 | Total pengeluaran sepanjang waktu |
| createdAt | DATETIME | Tidak | now() | Waktu pembuatan akun |
| updatedAt | DATETIME | Tidak | auto | Waktu update terakhir |

Index: email, username, lastLoginAt, walletBalance, totalSpent

---

#### OAuthAccount

Menyimpan data akun OAuth yang terhubung ke user. Satu user bisa punya multiple OAuth accounts (Google + Discord).

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| userId | VARCHAR(191) | Tidak | - | FK ke User |
| provider | ENUM(GOOGLE, DISCORD) | Tidak | - | Provider OAuth |
| providerAccountId | VARCHAR(191) | Tidak | - | ID dari provider |
| accessToken | TEXT | Ya | - | Access token |
| refreshToken | TEXT | Ya | - | Refresh token |
| expiresAt | DATETIME | Ya | - | Waktu expired token |
| scope | VARCHAR(512) | Ya | - | OAuth scopes |
| tokenType | VARCHAR(64) | Ya | - | Tipe token |
| idToken | TEXT | Ya | - | ID token |
| createdAt | DATETIME | Tidak | now() | Waktu dibuat |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Unique constraint: (provider, providerAccountId)
Relasi: userId → User.id (CASCADE)

---

#### Session

Menyimpan data session untuk tracking login (model Prisma, bukan session store express-session).

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| userId | VARCHAR(191) | Tidak | - | FK ke User |
| sessionToken | VARCHAR(191) | Tidak | - | Token session (unik) |
| expiresAt | DATETIME | Tidak | - | Waktu expired |
| ipAddress | VARCHAR(64) | Ya | - | IP address |
| userAgent | VARCHAR(512) | Ya | - | Browser user agent |
| createdAt | DATETIME | Tidak | now() | Waktu dibuat |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Relasi: userId → User.id (CASCADE)

---

#### WalletTransaction

Ledger terpadu untuk semua mutasi saldo wallet. Setiap perubahan balance tercatat di sini dengan snapshot saldo setelah transaksi.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| userId | VARCHAR(191) | Tidak | - | FK ke User |
| type | ENUM(TOP_UP, PURCHASE, AUDIO_CHARGE, REFUND, ADJUSTMENT) | Tidak | - | Tipe transaksi |
| amount | INTEGER | Tidak | - | Jumlah (positif = kredit, negatif = debit) |
| balanceAfter | INTEGER | Tidak | - | Snapshot saldo setelah transaksi |
| referenceType | VARCHAR(64) | Ya | - | Tipe referensi (TOP_UP_ORDER, PURCHASE, UPLOAD_RECORD) |
| referenceId | VARCHAR(191) | Ya | - | ID record terkait |
| description | VARCHAR(512) | Ya | - | Deskripsi transaksi |
| metadata | JSON | Ya | - | Data tambahan |
| createdAt | DATETIME | Tidak | now() | Waktu transaksi |

Index: userId, type, (referenceType + referenceId), createdAt
Relasi: userId → User.id (CASCADE)

---

#### TopUpOrder

Menyimpan order top-up yang dibuat via payment gateway. Status berubah dari PENDING ke COMPLETED saat webhook konfirmasi pembayaran diterima.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| userId | VARCHAR(191) | Tidak | - | FK ke User |
| provider | VARCHAR(64) | Tidak | - | Payment provider (bayar.gg) |
| externalId | VARCHAR(191) | Ya | - | Invoice ID dari provider (unik) |
| amountRupiah | INTEGER | Tidak | - | Jumlah yang diminta |
| finalAmount | INTEGER | Ya | - | Jumlah yang dibayar (termasuk unique code) |
| status | ENUM(PENDING, COMPLETED, FAILED, CANCELED) | Tidak | PENDING | Status order |
| activityLogId | VARCHAR(191) | Ya | - | FK ke ActivityLog |
| metadata | JSON | Ya | - | Data dari payment gateway |
| createdAt | DATETIME | Tidak | now() | Waktu dibuat |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Unique: externalId, activityLogId
Relasi: userId → User.id (CASCADE), activityLogId → ActivityLog.id (SET NULL)

---

#### UsageEvent

Mencatat event penggunaan audio processing (untuk tracking dan billing).

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| userId | VARCHAR(191) | Tidak | - | FK ke User |
| status | ENUM(PENDING, COMPLETED, FAILED, CANCELED) | Tidak | PENDING | Status event |
| audioDurationSec | INTEGER | Tidak | - | Durasi audio dalam detik |
| exportFormat | VARCHAR(32) | Tidak | - | Format export (wav, mp3, ogg) |
| costRupiah | INTEGER | Tidak | - | Biaya dalam Rupiah |
| metadata | JSON | Ya | - | Data tambahan |
| createdAt | DATETIME | Tidak | now() | Waktu dibuat |
| updatedAt | DATETIME | Tidak | auto | Waktu update |
| completedAt | DATETIME | Ya | - | Waktu selesai |

Relasi: userId → User.id (CASCADE)

---

#### ActivityLog

Log aktivitas pengguna untuk audit trail dan history.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| userId | VARCHAR(191) | Tidak | - | FK ke User |
| type | ENUM(LOGIN, LOGOUT, TOP_UP, TOKEN_USAGE, AUDIO_EXPORT, AUDIO_UPLOAD, FAILED_ACTION, REFUND, ROLLBACK) | Tidak | - | Tipe aktivitas |
| status | ENUM(INFO, SUCCESS, PENDING, FAILED) | Tidak | INFO | Status aktivitas |
| title | VARCHAR(191) | Tidak | - | Judul aktivitas |
| description | VARCHAR(512) | Ya | - | Deskripsi detail |
| amountRupiah | INTEGER | Ya | - | Jumlah Rupiah terkait |
| fileName | VARCHAR(255) | Ya | - | Nama file terkait |
| fileFormat | VARCHAR(32) | Ya | - | Format file |
| metadata | JSON | Ya | - | Data tambahan |
| createdAt | DATETIME | Tidak | now() | Waktu aktivitas |

Relasi: userId → User.id (CASCADE)

---

#### UploadRecord

Menyimpan record file audio yang di-upload pengguna dari studio.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| userId | VARCHAR(191) | Tidak | - | FK ke User |
| fileName | VARCHAR(255) | Tidak | - | Nama file asli |
| source | VARCHAR(64) | Ya | - | Sumber upload (studio) |
| fileFormat | VARCHAR(32) | Tidak | - | Format file (wav, mp3, ogg) |
| durationSec | INTEGER | Ya | - | Durasi audio dalam detik |
| speedFactor | DECIMAL(6,2) | Ya | - | Faktor kecepatan |
| amplification | DECIMAL(6,2) | Ya | - | Faktor amplifikasi |
| status | ENUM(PENDING, COMPLETED, FAILED, CANCELED) | Tidak | PENDING | Status upload |
| activityLogId | VARCHAR(191) | Ya | - | FK ke ActivityLog (unik) |
| metadata | JSON | Ya | - | Data tambahan (storedFileName, size, dll) |
| createdAt | DATETIME | Tidak | now() | Waktu upload |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Relasi: userId → User.id (CASCADE), activityLogId → ActivityLog.id (SET NULL)


---

#### ProductCategory

Kategori produk script di store.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| name | VARCHAR(100) | Tidak | - | Nama kategori |
| slug | VARCHAR(100) | Tidak | - | URL slug (unik) |
| description | TEXT | Ya | - | Deskripsi kategori |
| icon | VARCHAR(64) | Ya | - | Nama icon |
| sortOrder | INTEGER | Tidak | 0 | Urutan tampilan |
| active | BOOLEAN | Tidak | true | Status aktif |
| createdAt | DATETIME | Tidak | now() | Waktu dibuat |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Unique: slug

---

#### Product

Produk script yang dijual di store. Memiliki 3 tier harga (Personal, Commercial, Enterprise).

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| categoryId | VARCHAR(191) | Ya | - | FK ke ProductCategory |
| name | VARCHAR(191) | Tidak | - | Nama produk |
| slug | VARCHAR(191) | Tidak | - | URL slug (unik) |
| description | TEXT | Tidak | - | Deskripsi lengkap |
| shortDesc | VARCHAR(255) | Ya | - | Deskripsi singkat |
| thumbnail | VARCHAR(512) | Ya | - | URL thumbnail |
| pricePersonal | INTEGER | Tidak | 0 | Harga tier Personal (Rupiah) |
| priceCommercial | INTEGER | Tidak | 0 | Harga tier Commercial (Rupiah) |
| priceEnterprise | INTEGER | Tidak | 0 | Harga tier Enterprise (Rupiah) |
| featured | BOOLEAN | Tidak | false | Produk unggulan |
| active | BOOLEAN | Tidak | true | Status aktif |
| version | VARCHAR(32) | Tidak | 1.0.0 | Versi produk |
| tags | VARCHAR(512) | Ya | - | Tags (comma-separated) |
| createdAt | DATETIME | Tidak | now() | Waktu dibuat |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Unique: slug
Relasi: categoryId → ProductCategory.id (SET NULL)

---

#### ProductFile

File yang terkait dengan produk (script, dokumentasi, asset). Disimpan di Backblaze B2.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| productId | VARCHAR(191) | Tidak | - | FK ke Product |
| fileName | VARCHAR(255) | Tidak | - | Nama file asli |
| fileType | VARCHAR(32) | Tidak | - | Tipe: script, documentation, asset |
| filePath | VARCHAR(512) | Tidak | - | Key di B2 storage |
| fileSize | INTEGER | Ya | - | Ukuran file (bytes) |
| version | VARCHAR(32) | Tidak | 1.0.0 | Versi file |
| createdAt | DATETIME | Tidak | now() | Waktu upload |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Relasi: productId → Product.id (CASCADE)

---

#### ProductImage

Gambar/screenshot produk untuk tampilan di store.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| productId | VARCHAR(191) | Tidak | - | FK ke Product |
| url | VARCHAR(512) | Tidak | - | URL gambar |
| alt | VARCHAR(191) | Ya | - | Alt text |
| sortOrder | INTEGER | Tidak | 0 | Urutan tampilan |
| createdAt | DATETIME | Tidak | now() | Waktu dibuat |

Relasi: productId → Product.id (CASCADE)

---

#### License

Lisensi yang dimiliki user setelah pembelian. Berisi license key untuk verifikasi dari game Roblox.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| userId | VARCHAR(191) | Tidak | - | FK ke User (pemilik) |
| productId | VARCHAR(191) | Tidak | - | FK ke Product |
| purchaseId | VARCHAR(191) | Tidak | - | FK ke Purchase |
| licenseKey | VARCHAR(191) | Tidak | - | Key unik (format: RBXR-XXXX-XXXX-XXXX-XXXX) |
| licenseType | ENUM(PERSONAL, COMMERCIAL, ENTERPRISE) | Tidak | - | Tier lisensi |
| status | ENUM(ACTIVE, SUSPENDED, REVOKED, EXPIRED) | Tidak | ACTIVE | Status lisensi |
| maxGames | INTEGER | Ya | - | Maks game yang bisa di-whitelist (null = unlimited) |
| expiresAt | DATETIME | Ya | - | Waktu expired (null = lifetime) |
| lastVerifiedAt | DATETIME | Ya | - | Waktu verifikasi terakhir |
| metadata | JSON | Ya | - | Data tambahan |
| createdAt | DATETIME | Tidak | now() | Waktu dibuat |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Unique: licenseKey
Relasi: userId → User.id (CASCADE), productId → Product.id (CASCADE), purchaseId → Purchase.id (CASCADE)

Batas game per tier:
- PERSONAL: 3 game
- COMMERCIAL: 10 game
- ENTERPRISE: unlimited (null)

---

#### GameWhitelist

Daftar game Roblox yang di-whitelist untuk suatu lisensi. Game harus terdaftar di sini agar verifikasi berhasil.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| licenseId | VARCHAR(191) | Tidak | - | FK ke License |
| gameId | VARCHAR(64) | Tidak | - | Roblox placeId atau universeId |
| gameName | VARCHAR(191) | Ya | - | Nama game (opsional, auto-update saat verify) |
| active | BOOLEAN | Tidak | true | Status aktif |
| addedAt | DATETIME | Tidak | now() | Waktu ditambahkan |

Unique constraint: (licenseId, gameId)
Relasi: licenseId → License.id (CASCADE)

---

#### LicenseVerification

Log setiap percobaan verifikasi lisensi dari game Roblox. Digunakan untuk audit dan deteksi abuse.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| licenseId | VARCHAR(191) | Tidak | - | FK ke License |
| gameId | VARCHAR(64) | Tidak | - | Game ID yang melakukan verifikasi |
| ipAddress | VARCHAR(64) | Ya | - | IP address server game |
| userAgent | VARCHAR(512) | Ya | - | User agent |
| success | BOOLEAN | Tidak | - | Hasil verifikasi (berhasil/gagal) |
| reason | VARCHAR(255) | Ya | - | Alasan (OK, not whitelisted, expired, dll) |
| verifiedAt | DATETIME | Tidak | now() | Waktu verifikasi |

Relasi: licenseId → License.id (CASCADE)

---

#### Purchase

Record pembelian produk. Satu purchase menghasilkan satu license.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| userId | VARCHAR(191) | Tidak | - | FK ke User (pembeli) |
| productId | VARCHAR(191) | Tidak | - | FK ke Product |
| licenseType | ENUM(PERSONAL, COMMERCIAL, ENTERPRISE) | Tidak | - | Tier yang dibeli |
| amountRupiah | INTEGER | Tidak | - | Harga yang dibayar |
| status | ENUM(PENDING, COMPLETED, REFUNDED, FAILED) | Tidak | PENDING | Status pembelian |
| metadata | JSON | Ya | - | Data tambahan |
| purchasedAt | DATETIME | Tidak | now() | Waktu pembelian |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Relasi: userId → User.id (CASCADE), productId → Product.id (CASCADE)

---

#### Cart

Shopping cart per user. Satu user hanya punya satu cart.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| userId | VARCHAR(191) | Tidak | - | FK ke User (unik) |
| createdAt | DATETIME | Tidak | now() | Waktu dibuat |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Unique: userId
Relasi: userId → User.id (CASCADE)

---

#### CartItem

Item dalam shopping cart. Satu produk hanya bisa ada sekali dalam cart.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| cartId | VARCHAR(191) | Tidak | - | FK ke Cart |
| productId | VARCHAR(191) | Tidak | - | FK ke Product |
| licenseType | ENUM(PERSONAL, COMMERCIAL, ENTERPRISE) | Tidak | - | Tier yang dipilih |
| priceRupiah | INTEGER | Tidak | - | Snapshot harga saat ditambahkan |
| addedAt | DATETIME | Tidak | now() | Waktu ditambahkan |

Unique constraint: (cartId, productId)
Relasi: cartId → Cart.id (CASCADE), productId → Product.id (CASCADE)

---

### 4.3 Relasi Antar Tabel

**User sebagai pusat:**
- User 1:N OAuthAccount (satu user bisa login via Google + Discord)
- User 1:N Session
- User 1:N WalletTransaction
- User 1:N TopUpOrder
- User 1:N UsageEvent
- User 1:N ActivityLog
- User 1:N UploadRecord
- User 1:N License
- User 1:N Purchase
- User 1:1 Cart

**Product sebagai pusat store:**
- ProductCategory 1:N Product
- Product 1:N ProductFile
- Product 1:N ProductImage
- Product 1:N License
- Product 1:N Purchase
- Product 1:N CartItem

**License chain:**
- Purchase 1:N License (satu purchase = satu license)
- License 1:N GameWhitelist
- License 1:N LicenseVerification

**Activity tracking:**
- ActivityLog 1:1 UploadRecord (opsional)
- ActivityLog 1:1 TopUpOrder (opsional)


---

## 5. API Endpoints

### 5.1 Autentikasi

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | /auth/google | Publik | Mulai login via Google OAuth |
| GET | /auth/google/callback | Publik | Callback dari Google |
| GET | /auth/discord | Publik | Mulai login via Discord OAuth |
| GET | /auth/discord/callback | Publik | Callback dari Discord |
| POST | /auth/logout | Login | Logout dan hapus session |
| GET | /auth/me | Publik | Ambil data user yang sedang login |

### 5.2 Audio Processing

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| POST | /upload | Login + API Key | Upload file audio yang sudah diproses |
| GET | /history | Login | Daftar history upload (paginated) |
| GET | /history/:id/download | Login | Download file dari history |

### 5.3 Top-Up & Payment

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| POST | /topup/create | Login | Buat pembayaran QRIS via Bayar.gg |
| GET | /topup/status/:reference | Login | Cek status pembayaran (polling) |
| POST | /webhooks/bayar | Publik (signature) | Webhook dari Bayar.gg saat pembayaran berhasil |

### 5.4 Store - Produk

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | /products | Publik | Daftar produk (filter, search, sort, pagination) |
| GET | /products/categories | Publik | Daftar kategori produk |
| GET | /products/:idOrSlug | Publik | Detail produk |

### 5.5 Store - Cart & Checkout

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | /cart | Login | Ambil isi cart |
| POST | /cart/add | Login | Tambah produk ke cart |
| DELETE | /cart/:itemId | Login | Hapus item dari cart |
| DELETE | /cart | Login | Kosongkan cart |
| POST | /checkout | Login | Beli semua item di cart |

### 5.6 License Management

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | /licenses | Login | Daftar lisensi milik user |
| GET | /licenses/:id | Login | Detail lisensi |
| POST | /licenses/:id/whitelist | Login | Tambah game ke whitelist |
| DELETE | /licenses/:id/whitelist/:gid | Login | Hapus game dari whitelist |
| GET | /licenses/:id/download | Login | Download file script (redirect ke B2 presigned URL) |

### 5.7 License Verification (Roblox)

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| POST | /api/verify-license | Publik (rate limited) | Verifikasi license key dari game Roblox |

### 5.8 Admin

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | /admin/products | Admin | Daftar semua produk (termasuk non-aktif) |
| POST | /admin/products | Admin | Buat produk baru |
| PUT | /admin/products/:id | Admin | Update produk |
| DELETE | /admin/products/:id | Admin | Nonaktifkan produk (soft delete) |
| POST | /admin/products/:id/files | Admin | Upload file ke produk (B2) |
| DELETE | /admin/products/:pid/files/:fid | Admin | Hapus file produk |
| POST | /admin/categories | Admin | Buat kategori |
| PUT | /admin/categories/:id | Admin | Update kategori |
| DELETE | /admin/categories/:id | Admin | Nonaktifkan kategori |
| GET | /admin/licenses | Admin | Daftar semua lisensi (filter) |
| PUT | /admin/licenses/:id/status | Admin | Ubah status lisensi (suspend/revoke/activate) |
| GET | /admin/analytics | Admin | Overview penjualan |

### 5.9 Health Check

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | /health | Publik | Status server |
| GET | /db-health | Publik | Status koneksi database |

---

## 6. Alur Sistem

### 6.1 Alur Autentikasi (OAuth)

Sistem menggunakan autentikasi berbasis session dengan OAuth 2.0. User tidak perlu membuat password — cukup login via Google atau Discord.

1. User mengakses halaman login di frontend dan memilih provider (Google atau Discord)
2. Browser diarahkan ke endpoint backend /auth/google atau /auth/discord
3. Backend redirect ke halaman consent provider (Google/Discord)
4. User menyetujui akses di halaman provider
5. Provider redirect kembali ke callback URL backend (/auth/google/callback atau /auth/discord/callback)
6. Backend menerima profile dari provider (email, nama, avatar)
7. Backend mencari atau membuat record User dan OAuthAccount di database
8. Backend membuat session dan set cookie connect.sid dengan domain .muhwldns.me
9. Backend redirect user ke halaman utama frontend dengan parameter ?login=success
10. Frontend memanggil /auth/me untuk mendapatkan data user yang sudah login
11. AuthContext di frontend menyimpan data user dan menampilkan UI yang sesuai

Cookie session dikonfigurasi dengan: httpOnly (tidak bisa diakses JavaScript), secure (hanya HTTPS), sameSite=none (untuk cross-subdomain), dan domain=.muhwldns.me (shared antar subdomain).

### 6.2 Alur Top-Up (QRIS)

Sistem top-up menggunakan payment gateway Bayar.gg dengan metode QRIS. Konfirmasi pembayaran dilakukan via webhook (server-to-server), bukan polling dari client.

1. User memasukkan nominal top-up di halaman /topup (minimum Rp 1.000, maksimum Rp 500.000)
2. Frontend mengirim POST /topup/create ke backend dengan amount dan data customer
3. Backend memvalidasi input menggunakan Zod schema
4. Backend memanggil API Bayar.gg (create-payment.php) untuk membuat invoice QRIS
5. Bayar.gg mengembalikan data pembayaran: invoice_id, qris_static_image_url, payment_url, expires_at
6. Backend menyimpan TopUpOrder dengan status PENDING di database
7. Backend mengembalikan response ke frontend: orderId, invoiceId, qrisImageUrl, paymentUrl, expiresAt
8. Frontend menampilkan QR code dan memulai polling status setiap 3 detik
9. User scan QR code menggunakan e-wallet atau mobile banking
10. Setelah pembayaran berhasil, Bayar.gg mengirim webhook POST ke /webhooks/bayar
11. Backend memverifikasi signature webhook menggunakan HMAC SHA256
12. Backend menjalankan atomic transaction: mark order COMPLETED, credit wallet (walletBalance += amount), catat di WalletTransaction ledger, buat ActivityLog
13. Backend mengirim email notifikasi ke user (fire-and-forget via Resend)
14. Frontend polling mendeteksi status COMPLETED, menampilkan halaman sukses, dan refresh data user

Keamanan: webhook dilindungi HMAC signature, operasi wallet bersifat atomic (dalam satu database transaction), dan idempotent (webhook duplikat tidak menyebabkan double-credit).

### 6.3 Alur Pembelian Script

Pembelian script menggunakan saldo wallet (Rupiah). User harus top-up terlebih dahulu jika saldo tidak mencukupi.

1. User browse produk di halaman /store/products
2. User memilih produk dan tier lisensi (Personal/Commercial/Enterprise)
3. User klik "Add to Cart" — frontend POST /cart/add dengan productId dan licenseType
4. Backend memvalidasi: produk aktif, user belum punya lisensi aktif untuk produk tersebut
5. Backend menyimpan CartItem dengan snapshot harga saat itu
6. User membuka halaman /store/cart untuk review
7. User klik "Checkout" — frontend POST /checkout
8. Backend menjalankan atomic transaction:
   a. Validasi cart tidak kosong dan semua produk masih aktif
   b. Cek saldo wallet >= total harga (di dalam transaction untuk prevent race condition)
   c. Deduct walletBalance dan increment totalSpent
   d. Untuk setiap item: buat Purchase record, generate license key unik (RBXR-XXXX-XXXX-XXXX-XXXX), buat License record dengan maxGames sesuai tier
   e. Catat setiap deduction di WalletTransaction ledger
   f. Buat ActivityLog
   g. Kosongkan cart
9. Backend mengembalikan response: daftar purchases, licenses (dengan key), totalCharged, newBalance
10. Backend mengirim email notifikasi pembelian ke user (berisi license key)
11. Frontend redirect ke halaman sukses dan menampilkan license key
12. User dapat mengelola lisensi di halaman /dashboard/licenses

### 6.4 Alur Verifikasi License (Roblox)

Verifikasi dilakukan dari dalam game Roblox saat game startup. Script Lua memanggil API backend untuk memvalidasi license key.

1. Developer memasukkan license key di konfigurasi script Roblox (di Roblox Studio)
2. Developer menambahkan game ID ke whitelist via dashboard (/dashboard/licenses/:id)
3. Saat game dimulai, script Lua mengirim HTTP POST ke /api/verify-license dengan licenseKey dan gameId
4. Backend menerima request dan melakukan validasi bertahap:
   a. Cek license key ada di database
   b. Cek status lisensi = ACTIVE
   c. Cek lisensi belum expired (jika ada expiresAt)
   d. Cek produk masih aktif
   e. Cek gameId terdaftar di GameWhitelist untuk lisensi tersebut
5. Jika semua validasi lolos: update lastVerifiedAt, catat di LicenseVerification (success), return { valid: true, product: { name, version } }
6. Jika ada yang gagal: catat di LicenseVerification (failed + reason), return { valid: false, message: "..." }
7. Script Lua menerima response dan memutuskan apakah melanjutkan eksekusi atau menghentikan game

Rate limit: 30 request per menit per IP untuk mencegah abuse.

### 6.5 Alur Audio Processing

Audio processing dilakukan sepenuhnya di browser (client-side) menggunakan Web Audio API. Backend hanya menyimpan hasil akhir.

1. User membuka halaman /audio/studio (protected, harus login)
2. User upload file audio (WAV, MP3, OGG) via drag-and-drop atau file picker
3. File di-decode menggunakan Web Audio API (AudioContext.decodeAudioData)
4. User mengatur parameter: gain, EQ (low/mid/high), reverb
5. User preview audio secara real-time di browser
6. User memilih format export (WAV, MP3, OGG) dan klik Export
7. Frontend melakukan offline rendering dengan parameter yang dipilih (OfflineAudioContext)
8. Jika format bukan WAV: transcode menggunakan FFmpeg WASM (loaded dari CDN)
9. File hasil di-download ke komputer user
10. Secara background (fire-and-forget): file di-upload ke backend POST /upload
11. Backend cek quota harian: jika masih ada free quota (3/hari), tidak charge. Jika sudah habis, deduct dari wallet (Rp 2.000 per audio)
12. Backend simpan file di disk lokal dan buat UploadRecord + ActivityLog
13. User dapat mengakses file yang sudah di-upload di halaman /audio/history

---

## 7. Deployment

### 7.1 Infrastructure

| Komponen | Lokasi | Keterangan |
|---|---|---|
| VPS | Anomali (provider lokal) | Single server, NAT-based |
| Reverse Proxy | Cloudflare Tunnel | Expose local ports ke internet via HTTPS |
| Process Manager | PM2 | Auto-restart, logging |
| Database | Docker container (mysql:latest) | Port 3306 exposed ke host |
| Backend Runtime | Bun | Port 3001 |
| Frontend Runtime | Node.js (Next.js standalone) | Port 5174 |

### 7.2 Domain Mapping

| Domain | Service | Port |
|---|---|---|
| api-rbx.muhwldns.me | Backend Express.js | 3001 |
| audio.muhwldns.me | Frontend Next.js | 5174 |

### 7.3 Backup Strategy

- Metode: Full database dump (mysqldump) harian
- Penyimpanan lokal: 7 hari terakhir
- Penyimpanan offsite: Backblaze B2, retain 90 hari
- Schedule: Setiap hari jam 03:00 WIB (cron job)
- Notifikasi: Email alert jika backup gagal

---

## 8. Keamanan

### 8.1 Autentikasi & Otorisasi

- Session-based authentication via cookie (httpOnly, secure, sameSite=none)
- OAuth 2.0 (Google, Discord) — tidak ada password yang disimpan
- Role-based access control: USER dan ADMIN
- Middleware requireAuth untuk endpoint protected
- Middleware requireAdmin untuk endpoint admin

### 8.2 Input Validation

- Zod schema validation pada semua endpoint state-changing
- File upload: validasi ekstensi (.lua, .rbxm, .rbxmx, .md, .txt) dan ukuran (max 10MB)
- Path traversal protection pada file download (resolve + validate path)

### 8.3 Rate Limiting

| Endpoint | Limit |
|---|---|
| POST /upload | 30 req / 15 menit |
| POST /topup/create | 5 req / menit |
| POST /checkout | 5 req / menit |
| POST /api/verify-license | 30 req / menit |

### 8.4 Payment Security

- Webhook signature verification (HMAC SHA256)
- Atomic database transactions untuk semua operasi wallet
- Idempotent webhook processing (duplikat tidak menyebabkan double-credit)
- Balance check di dalam transaction (prevent race condition)

### 8.5 CORS & Cookie

- CORS origin: explicit domain (tidak wildcard)
- Cookie domain: .muhwldns.me (shared antar subdomain)
- Credentials: true (cookie dikirim cross-origin)

### 8.6 Error Handling

- Production: error message generic ("Internal server error")
- Development: error message detail untuk debugging
- Tidak ada stack trace atau informasi internal yang di-expose ke client

---

## 9. Lampiran

### 9.1 Environment Variables

**Backend (.env):**

| Variable | Keterangan |
|---|---|
| NODE_ENV | Environment (production/development) |
| PORT | Port server (3001) |
| DATABASE_URL | Connection string MySQL |
| SESSION_SECRET | Secret untuk signing session cookie |
| FRONTEND_URL | URL frontend untuk redirect |
| CORS_ORIGIN | Allowed origin untuk CORS |
| COOKIE_DOMAIN | Domain cookie (.muhwldns.me) |
| UPLOAD_API_KEY | API key untuk upload endpoint |
| GOOGLE_CLIENT_ID | Google OAuth client ID |
| GOOGLE_CLIENT_SECRET | Google OAuth client secret |
| GOOGLE_CALLBACK_URL | Google OAuth callback URL |
| DISCORD_CLIENT_ID | Discord OAuth client ID |
| DISCORD_CLIENT_SECRET | Discord OAuth client secret |
| DISCORD_CALLBACK_URL | Discord OAuth callback URL |
| BAYARGG_API_KEY | Bayar.gg API key |
| BAYARGG_WEBHOOK_SECRET | Bayar.gg webhook HMAC secret |
| BAYARGG_WEBHOOK_URL | URL webhook yang didaftarkan ke Bayar.gg |
| S3_ENDPOINT | Backblaze B2 endpoint |
| S3_ACCESS_KEY_ID | B2 access key |
| S3_SECRET_ACCESS_KEY | B2 secret key |
| S3_BUCKET_NAME | Nama bucket B2 |
| S3_REGION | Region B2 |
| RESEND_API_KEY | Resend API key untuk email |
| EMAIL_FROM | Alamat pengirim email |

**Frontend (.env.local):**

| Variable | Keterangan |
|---|---|
| NEXT_PUBLIC_API_URL | Base URL backend API |
| NEXT_PUBLIC_UPLOAD_URL | URL endpoint upload |
| NEXT_PUBLIC_UPLOAD_API_KEY | API key untuk upload |

---

*Dokumen ini merupakan gambaran besar teknis sistem RBX Royale. Detail implementasi dapat dilihat langsung di source code repository.*

*Terakhir diperbarui: 17 Mei 2026*
