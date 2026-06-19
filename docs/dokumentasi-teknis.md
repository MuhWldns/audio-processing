# Dokumentasi Teknis - RBX Royale Platform

## 1. Pendahuluan

### 1.1 Deskripsi Sistem

RBX Royale adalah platform komersial berbasis web yang menyediakan dua layanan utama untuk komunitas pengembang game Roblox:

1. **Script Store** - Marketplace untuk pembelian script Roblox berlisensi dengan sistem verifikasi real-time
2. **Audio Processing** - Tools pemrosesan audio berbasis browser untuk kebutuhan game development

Platform ini menggunakan arsitektur client-server dengan frontend Next.js dan backend Express.js, terintegrasi dengan payment gateway QRIS MustikaPay (webhook-first, diverifikasi via Check Status), object storage (Backblaze B2), dan email transaksional (Resend). Selain klien web, backend juga melayani klien mobile (Flutter) yang berautentikasi via Bearer JWT — kedua jalur (cookie untuk web, Bearer untuk mobile) berjalan paralel di endpoint yang sama.

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
| MustikaPay | Payment gateway QRIS — webhook-first (callback diverifikasi via Check Status) |
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
- Dual authentication: cookie session (web, via Passport.js + express-session) DAN Bearer JWT (mobile/Flutter). Kedua jalur diterima oleh middleware `requireAuth` yang sama
- Semua operasi wallet dan transaksi bersifat atomic (database transaction)

**Data Layer**
- MySQL database sebagai single source of truth
- Backblaze B2 untuk file storage (script files)
- In-memory session store (express-session default) untuk cookie web
- Tabel `Session` di MySQL dipakai untuk menyimpan refresh token mobile (hashed SHA-256)

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
    |--- MustikaPay API - Payment gateway
    |--- Resend API - Email sending
    |
    | Webhook (inbound)
    |<-- MustikaPay (webhook callback)
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

Sistem menggunakan 19 tabel yang terbagi dalam 4 domain utama + 1 tabel counter internal:

**Domain Autentikasi & User:**
- User, OAuthAccount, Session

**Domain Wallet & Transaksi:**
- WalletTransaction, TopUpOrder

**Domain Audio Processing:**
- UsageEvent, ActivityLog, UploadRecord

**Domain Script Store:**
- ProductCategory, Product, ProductFile, ProductImage, License, GameWhitelist, LicenseVerification, Purchase, Cart, CartItem

**Internal Counter:**
- PublicIdCounter

PlantUML ERD tersedia di `docs/erd/audio-processing-erd.puml`.

### 4.2 Detail Tabel

#### PublicIdCounter

Counter internal untuk menghasilkan `publicId` yang pendek, bermakna, dan unik per scope/bulan. Primary key CUID (`id`) tetap dipakai untuk relasi database; `publicId` dipakai untuk UI, invoice, admin, dan support.

Format umum:

```text
PREFIX-CODE-YYMM-SEQUENCE
```

Contoh format:

| Table | Format | Contoh |
|---|---|---|
| User | ACC-IDN-YYMM-000001 | ACC-IDN-2606-000001 |
| TopUpOrder | TOP-IDR-YYMM-000001 | TOP-IDR-2606-000001 |
| WalletTransaction | TXN-TOP/PUR/AUD/REF/ADJ-YYMM-000001 | TXN-PUR-2606-000001 |
| Purchase | PUR-PER/COM/ENT-YYMM-000001 | PUR-COM-2606-000001 |
| License | LIC-PER/COM/ENT-YYMM-000001 | LIC-COM-2606-000001 |
| Product | PRD-AUD/RBX/SCR-YYMM-000001 | PRD-SCR-2606-000001 |
| UploadRecord | UPL-WAV/MP3/OGG-YYMM-000001 | UPL-WAV-2606-000001 |
| UsageEvent | USE-FREE/PAID-YYMM-000001 | USE-PAID-2606-000001 |

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| scope | VARCHAR(32) | Tidak | - | Prefix counter, contoh PUR-COM-2606 |
| nextNumber | INTEGER | Tidak | 1 | Nomor berikutnya untuk scope tersebut |
| updatedAt | DATETIME | Tidak | auto | Waktu update counter |

Unique: scope

---

#### User

Tabel utama yang menyimpan data pengguna. Wallet balance disimpan langsung di tabel ini sebagai single source of truth.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| publicId | VARCHAR(32) | Ya | - | ID publik unik untuk display/support (format: ACC-IDN-YYMM-000001) |
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

Unique: publicId, email, username
Index: email, username, lastLoginAt, walletBalance, totalSpent

Catatan: `id` tetap dipakai untuk relasi internal. `publicId` dipakai untuk UI, invoice, admin/support, dan bisa null pada data lama sebelum backfill.

---

#### OAuthAccount

Menyimpan data akun OAuth yang terhubung ke user. Satu user bisa punya multiple OAuth accounts (Google + Discord).

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| publicId | VARCHAR(32) | Ya | - | ID publik unik (format: TXN-TOP/PUR/AUD/REF/ADJ-YYMM-000001) |
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

Menyimpan data session untuk autentikasi mobile (refresh token). Sebelum fitur mobile auth (Juni 2026), tabel ini ada di skema tapi tidak terpakai karena web memakai express-session MemoryStore. Setelah Juni 2026, tabel ini menjadi penyimpanan refresh token Bearer JWT untuk klien Flutter — `sessionToken` berisi hash SHA-256 dari refresh token (raw token tidak pernah disimpan), dan rotasi refresh token akan menghapus row lama lalu insert row baru.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| userId | VARCHAR(191) | Tidak | - | FK ke User |
| sessionToken | VARCHAR(191) | Tidak | - | SHA-256 hash dari refresh token (unik) |
| expiresAt | DATETIME | Tidak | - | Waktu expired (default 30 hari, ikut REFRESH_TOKEN_TTL_DAYS) |
| ipAddress | VARCHAR(64) | Ya | - | IP saat issue (forensic, tidak divalidasi saat use) |
| userAgent | VARCHAR(512) | Ya | - | User agent saat issue (forensic) |
| createdAt | DATETIME | Tidak | now() | Waktu dibuat |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Relasi: userId → User.id (CASCADE)

Catatan: cookie session web (`connect.sid`) tetap memakai express-session MemoryStore, tidak menyentuh tabel ini.

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

Unique: publicId
Index: userId, type, (referenceType + referenceId), createdAt
Relasi: userId → User.id (CASCADE)

---

#### TopUpOrder

Menyimpan order top-up yang dibuat via payment gateway. Status berubah dari PENDING ke COMPLETED saat webhook konfirmasi pembayaran diterima.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| publicId | VARCHAR(32) | Ya | - | ID publik unik (format: TOP-IDR-YYMM-000001) |
| userId | VARCHAR(191) | Tidak | - | FK ke User |
| provider | VARCHAR(64) | Tidak | - | Payment provider (mustika) |
| externalId | VARCHAR(191) | Ya | - | Invoice ID dari provider (unik) |
| amountRupiah | INTEGER | Tidak | - | Jumlah yang diminta |
| finalAmount | INTEGER | Ya | - | Jumlah yang dibayar (termasuk unique code) |
| status | ENUM(PENDING, COMPLETED, FAILED, CANCELED) | Tidak | PENDING | Status order |
| activityLogId | VARCHAR(191) | Ya | - | FK ke ActivityLog |
| metadata | JSON | Ya | - | Data dari payment gateway |
| createdAt | DATETIME | Tidak | now() | Waktu dibuat |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Unique: publicId, externalId, activityLogId
Relasi: userId → User.id (CASCADE), activityLogId → ActivityLog.id (SET NULL)

---

#### UsageEvent

Mencatat event penggunaan audio processing (untuk tracking dan billing).

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| publicId | VARCHAR(32) | Ya | - | ID publik unik (format: USE-FREE/PAID-YYMM-000001) |
| userId | VARCHAR(191) | Tidak | - | FK ke User |
| status | ENUM(PENDING, COMPLETED, FAILED, CANCELED) | Tidak | PENDING | Status event |
| audioDurationSec | INTEGER | Tidak | - | Durasi audio dalam detik |
| exportFormat | VARCHAR(32) | Tidak | - | Format export (wav, mp3, ogg) |
| costRupiah | INTEGER | Tidak | - | Biaya dalam Rupiah |
| metadata | JSON | Ya | - | Data tambahan |
| createdAt | DATETIME | Tidak | now() | Waktu dibuat |
| updatedAt | DATETIME | Tidak | auto | Waktu update |
| completedAt | DATETIME | Ya | - | Waktu selesai |

Unique: publicId
Relasi: userId → User.id (CASCADE)

---

#### ActivityLog

Log aktivitas pengguna untuk audit trail dan history.

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| id | VARCHAR(191) | Tidak | cuid() | Primary key |
| publicId | VARCHAR(32) | Ya | - | ID publik unik (format: UPL-WAV/MP3/OGG-YYMM-000001) |
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

Unique: publicId
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
| publicId | VARCHAR(32) | Ya | - | ID publik unik (format: PRD-AUD/RBX/SCR-YYMM-000001) |
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

Unique: publicId, slug
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
| publicId | VARCHAR(32) | Ya | - | ID publik unik untuk record lisensi (format: LIC-PER/COM/ENT-YYMM-000001) |
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

Unique: publicId, licenseKey
Relasi: userId → User.id (CASCADE), productId → Product.id (CASCADE), purchaseId → Purchase.id (CASCADE)

Catatan: `publicId` berbeda dari `licenseKey`. `publicId` untuk UI/admin/support; `licenseKey` (RBXR-...) tetap dipakai runtime Roblox.

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
| publicId | VARCHAR(32) | Ya | - | ID publik unik (format: PUR-PER/COM/ENT-YYMM-000001) |
| userId | VARCHAR(191) | Tidak | - | FK ke User (pembeli) |
| productId | VARCHAR(191) | Tidak | - | FK ke Product |
| licenseType | ENUM(PERSONAL, COMMERCIAL, ENTERPRISE) | Tidak | - | Tier yang dibeli |
| amountRupiah | INTEGER | Tidak | - | Harga yang dibayar |
| status | ENUM(PENDING, COMPLETED, REFUNDED, FAILED) | Tidak | PENDING | Status pembelian |
| metadata | JSON | Ya | - | Data tambahan |
| purchasedAt | DATETIME | Tidak | now() | Waktu pembelian |
| updatedAt | DATETIME | Tidak | auto | Waktu update |

Unique: publicId
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
| GET | /auth/google | Publik | Mulai login via Google OAuth (tambah `?platform=mobile` untuk alur Flutter) |
| GET | /auth/google/callback | Publik | Callback dari Google (cabang ke deep link bila `state.platform === "mobile"`) |
| GET | /auth/discord | Publik | Mulai login via Discord OAuth (tambah `?platform=mobile` untuk alur Flutter) |
| GET | /auth/discord/callback | Publik | Callback dari Discord (cabang ke deep link bila `state.platform === "mobile"`) |
| POST | /auth/logout | Login | Logout dan hapus session (cookie web) |
| POST | /auth/refresh | Publik (rate limit) | Tukar refresh token mobile dengan pasangan access JWT + refresh baru (rotation + reuse detection) |
| POST | /auth/logout-mobile | Bearer | Hapus refresh token mobile (idempotent) |
| GET | /auth/me | Publik | Ambil data user yang sedang login (cookie atau Bearer) |

Detail desain Bearer JWT, rotasi refresh token, dan deep link `rbxroyale://auth?access=…&refresh=…` ada di `docs/superpowers/specs/2026-06-14-mobile-oauth-token-auth-design.md`.

### 5.2 Audio Processing

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| POST | /upload | Login + API Key | Upload file audio yang sudah diproses |
| GET | /history | Login | Daftar history upload (paginated) |
| GET | /history/:id/download | Login | Download file dari history |

### 5.3 Top-Up & Payment

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| POST | /topup/create | Login | Buat pembayaran QRIS via MustikaPay |
| GET | /topup/status/:reference | Login | Cek status (DB-only, tidak panggil provider) |
| POST | /webhooks/mustika | Publik | Webhook MustikaPay: acknowledge 200, verify async, credit wallet |
| POST | /topup/check/:reference | Login | Manual check dengan provider (cooldown 30 detik) |
| POST | /webhooks/mustika | Publik | Webhook MustikaPay: acknowledge 200, verify async, credit wallet |
| POST | /topup/check/:reference | Login | Manual check dengan provider (cooldown 30 detik) |

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

Sistem menggunakan dua jalur autentikasi yang berjalan paralel di endpoint OAuth yang sama:
- **Web (cookie session)** — default, untuk frontend Next.js. Cookie `connect.sid` di-set di domain `.muhwldns.me`.
- **Mobile (Bearer JWT)** — untuk klien Flutter. Aktif bila request masuk membawa `?platform=mobile` pada `/auth/google` atau `/auth/discord`. Backend menyimpan flag ini di `state` OAuth (HMAC-signed dengan `JWT_SECRET`) sehingga callback bisa mengenali jenis klien tanpa mengubah redirect URI.

Alur web (default):
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

Alur mobile (Flutter, sejak Juni 2026):
1. App membuka system browser (Chrome/Safari) ke `/auth/google?platform=mobile` atau `/auth/discord?platform=mobile`
2. Backend menandatangani `state = HMAC{platform:"mobile", nonce}` dengan `JWT_SECRET` lalu meneruskan ke passport
3. User consent di halaman provider, provider redirect ke callback yang sama
4. Callback memverifikasi HMAC `state`, mengenali `platform === "mobile"`, kemudian:
   - Issue access JWT (HS256, payload `{ sub, role, iat, exp }`, TTL `ACCESS_TOKEN_TTL_DAYS` = 7 hari default)
   - Issue refresh token (32 random bytes, base64url) dan simpan SHA-256 hash-nya di tabel `Session` (TTL `REFRESH_TOKEN_TTL_DAYS` = 30 hari default)
   - Redirect ke `${MOBILE_DEEP_LINK_REDIRECT}?access=<jwt>&refresh=<token>` (custom scheme `rbxroyale://auth`)
5. OS Flutter menangkap deep link, app menyimpan kedua token ke `flutter_secure_storage`
6. Setiap request berikutnya membawa `Authorization: Bearer <access JWT>`. Middleware `requireAuth` mengecek Bearer dulu (precedence) sebelum fallback ke cookie

Refresh & rotation: app memanggil `POST /auth/refresh` saat access JWT expired. Backend memvalidasi refresh, menghapus row `Session` lama, lalu insert row baru dengan refresh token baru (rotation). Bila refresh yang sudah dirotasi dipakai lagi → reuse detection: seluruh `Session` user dihapus dan klien dipaksa login ulang (RFC 6819 §5.2.2.3).

Logout mobile: `POST /auth/logout-mobile` (memerlukan Bearer) menghapus row `Session` yang cocok dengan hash refresh token. Idempotent.

### 6.2 Alur Top-Up (QRIS)

Top-up menggunakan **MustikaPay** sebagai satu-satunya payment gateway QRIS dengan arsitektur **webhook-first**:
MustikaPay mengirim callback ke /webhooks/mustika, backend langsung mengakui (200), lalu memverifikasi
ref_no via GET /api/v1/check/qris sebelum mengkredit wallet.

Alur:
1. User memasukkan nominal di /topup (min Rp 1.000, maks Rp 500.000).
2. Frontend POST /topup/create; backend memvalidasi via Zod.
3. Backend memanggil createQris() ke MustikaPay, menyimpan TopUpOrder PENDING
   (provider, externalId=ref_no, metadata berisi qrUrl/paymentLink/expiresAt).
4. Backend mengembalikan orderId, invoiceId, qrisImageUrl, paymentUrl, expiresAt.
5. Frontend menampilkan QR, menyimpan orderId ke localStorage, dan polling /topup/status tiap 3 detik
   (DB-only, tidak memanggil MustikaPay API). Saat app ditutup lalu dibuka lagi, order PENDING
   dipulihkan dari localStorage + status endpoint.

Konfirmasi pembayaran (webhook-first):
- MustikaPay mengirim POST /webhooks/mustika saat pembayaran terdeteksi.
- Backend langsung return 200 {"status":"received"}, lalu memproses secara async:
  (a) cari order berdasarkan ref_no, (b) verifikasi via GET /api/v1/check/qris,
  (c) bila status="success" dan nominal cocok → kredit wallet via creditVerifiedTopUp
  (atomic, idempotent, CAS-based).
- Bila webhook tidak terkirim (network issue), user bisa trigger manual check via
  tombol "Saya sudah bayar" → POST /topup/check/:reference (cooldown 30 detik).
- Auto-cancel: order PENDING yang belum terbayar setelah 25 menit otomatis di-CANCEL
  oleh background auto-canceler (interval 5 menit, local DB-only).

Keamanan: kredit wallet selalu lewat creditVerifiedTopUp — atomic (satu Prisma transaction),
idempotent (CAS-based, tidak double-credit), dan fail-closed (nominal provider wajib cocok dengan order).

> **Catatan — RBX Credit non-refundable.** Saldo wallet adalah **RBX Credit**, bukan Rupiah
> dalam arti uang yang bisa dicairkan. Nominal Rupiah saat top-up hanya menentukan jumlah RBX
> Credit yang diterima; setelah masuk, RBX Credit **tidak dapat di-refund, ditarik, atau
> ditukar kembali ke Rupiah**. Credit hanya bisa dipakai untuk pembelian di dalam platform.
> Pastikan UI top-up dan checkout menyatakan ini dengan jelas agar user paham sebelum membayar.

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

- Web: session-based authentication via cookie (httpOnly, secure, sameSite=none) dengan Passport.js + express-session
- Mobile: Bearer JWT (HS256, signed dengan `JWT_SECRET`, alg dipin pada verify untuk menolak `alg: none`)
- Refresh token mobile: opaque 32 bytes, disimpan di tabel `Session` sebagai SHA-256 hash, di-rotate setiap refresh, reuse detection menghapus seluruh session user
- OAuth state HMAC-signed (mencegah callback hijack ke deep link milik attacker)
- OAuth 2.0 (Google, Discord) — tidak ada password yang disimpan
- Role-based access control: USER dan ADMIN
- Middleware `requireAuth` (cek Bearer dulu, fallback cookie) untuk endpoint protected
- Middleware requireAdmin untuk endpoint admin (membaca `req.user.role` yang berasal dari payload JWT atau session cookie)

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
| POST /auth/refresh | 30 req / menit (per Bearer/IP) |
| POST /auth/logout-mobile | 10 req / menit (per user) |

### 8.4 Payment Security

- Webhook verification via MustikaPay Check Status (GET /api/v1/check/qris)
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
| MUSTIKAPAY_API_KEY | MustikaPay API key (header X-Api-Key) |
| MUSTIKAPAY_BASE_URL | Base URL MustikaPay (default https://mustikapayment.com) |
| S3_ENDPOINT | Backblaze B2 endpoint |
| S3_ACCESS_KEY_ID | B2 access key |
| S3_SECRET_ACCESS_KEY | B2 secret key |
| S3_BUCKET_NAME | Nama bucket B2 |
| S3_REGION | Region B2 |
| RESEND_API_KEY | Resend API key untuk email |
| EMAIL_FROM | Alamat pengirim email |
| JWT_SECRET | Secret HS256 untuk access JWT mobile + HMAC OAuth state (wajib di production, fail-closed) |
| MOBILE_DEEP_LINK_REDIRECT | Deep link tujuan callback mobile, mis. `rbxroyale://auth` |
| ACCESS_TOKEN_TTL_DAYS | TTL access JWT mobile (default 7) |
| REFRESH_TOKEN_TTL_DAYS | TTL refresh token mobile, ikut `Session.expiresAt` (default 30) |

**Frontend (.env.local):**

| Variable | Keterangan |
|---|---|
| NEXT_PUBLIC_API_URL | Base URL backend API |
| NEXT_PUBLIC_UPLOAD_URL | URL endpoint upload |
| NEXT_PUBLIC_UPLOAD_API_KEY | API key untuk upload |

---

*Dokumen ini merupakan gambaran besar teknis sistem RBX Royale. Detail implementasi dapat dilihat langsung di source code repository.*

*Terakhir diperbarui: 17 Mei 2026*

---

## 10. License Enforcement System

### 10.1 Overview

Sistem enforcement lisensi menggunakan arsitektur multi-layer untuk melindungi script yang dijual di store. Buyer mendapat file .rbxm yang berisi loader script (obfuscated) yang melakukan handshake ke server. Server mengembalikan signKey dan runtime config yang dibutuhkan core module untuk berfungsi. Jika lisensi tidak valid, server mengirim encrypted breaking code yang di-execute di runtime.

### 10.2 Endpoints

| Method | Path | Rate Limit | Fungsi |
|---|---|---|---|
| POST | /api/license/handshake | 10 req/menit | Verifikasi awal + return signKey + session token |
| POST | /api/license/heartbeat | 15 req/menit | Periodic recheck + rotasi signKey (setiap 5 menit) |
| POST | /api/license/enforce | 5 req/menit | Return encrypted breaking code per phase |

### 10.3 Handshake Flow

1. Game start, loader script di .rbxm melakukan require(assetId) ke Roblox asset milik developer
2. Asset module mengambil license key dari config
3. Asset module HTTP POST ke /api/license/handshake dengan licenseKey + gameId
4. Server validasi: key ada, status ACTIVE, belum expired, product active, game whitelisted
5. Jika valid: server return signKey (HMAC-based, rotate tiap 5 menit) + sessionToken
6. Jika invalid: server return { valid: false, reason: "..." }
7. Asset module menyimpan signKey dan sessionToken untuk heartbeat

### 10.4 Heartbeat Flow

1. Setiap 5 menit, asset module POST ke /api/license/heartbeat dengan licenseKey + gameId + sessionToken
2. Server re-validasi license status (bisa saja admin revoke di antara heartbeats)
3. Server validasi sessionToken cocok dengan yang tersimpan
4. Jika valid: return signKey baru (rotated)
5. Jika invalid: return { valid: false } — trigger enforcement

### 10.5 Enforcement Flow

Jika handshake atau heartbeat gagal, asset module memanggil /api/license/enforce untuk mendapatkan breaking code.

1. Asset module POST ke /api/license/enforce dengan licenseKey + gameId + phase
2. Server generate Lua code sesuai phase
3. Server encrypt code menggunakan derived key: HMAC(signKey + licenseKey + gameId)
4. Server return encrypted payload (base64)
5. Asset module decrypt menggunakan derived key yang sama (computed dari komponen yang sudah dimiliki)
6. Asset module execute code via loadstring (tersembunyi di balik obfuscation)
7. Setelah delay, request phase berikutnya (escalation)

### 10.6 Encryption

Payload enforcement di-encrypt menggunakan XOR cipher dengan derived key:

- Server: derivedKey = HMAC-SHA256(signKey + licenseKey + gameId, serverSecret).slice(0, 32)
- Server: encryptedPayload = base64(XOR(luaCode, derivedKey))
- Client: derivedKey = compute dari signKey (dari handshake) + licenseKey (dari config) + gameId
- Client: luaCode = XOR(base64decode(payload), derivedKey)

Derived key tidak pernah dikirim secara eksplisit. Client harus compute sendiri dari komponen yang sudah dimiliki.

### 10.7 Enforcement Phases

| Phase | Delay | Behavior |
|---|---|---|
| 1 | Menit 0-5 | Silent: spawn invisible parts setiap detik (gradual memory leak) |
| 2 | Menit 5-10 | Subtle: random GUI notification muncul sesekali ("Unlicensed software detected") |
| 3 | Menit 10-15 | Obvious: game makin berat + notification lebih sering + pesan "pirated scripts" |
| 4 | Menit 15-20 | Aggressive: full screen overlay merah + looping annoying sound + pesan beli license |
| 5 | Menit 20+ | Fatal: mass spawn parts (50/frame) + kick semua player setelah 10 detik |

### 10.8 SignKey Generation

SignKey di-generate menggunakan HMAC-SHA256 dengan time-bucketing:

- Input: licenseKey + gameId + timeBucket + serverSecret
- timeBucket = Math.floor(Date.now() / (300 * 1000)) — berubah setiap 5 menit
- Output: 32 karakter hex string
- Deterministic: input yang sama dalam window 5 menit yang sama menghasilkan signKey yang sama

### 10.9 Security Layers

| Layer | Lokasi | Fungsi |
|---|---|---|
| AssetId obfuscation | .rbxm file (buyer) | Sembunyikan asset ID dari inspection |
| Roblox Asset | Roblox CDN (developer) | Logic handshake + heartbeat + enforce call |
| Server verification | Backend API | Validasi license, generate signKey, serve enforce code |
| Derived encryption | Both sides | Encrypt payload, key tidak pernah transit langsung |
| Obfuscated loader | .rbxm file (buyer) | Sembunyikan loadstring + decrypt logic |
| Gradual enforcement | Runtime (game) | Breaking behavior yang escalate, sulit di-trace |

### 10.10 Anti-Bypass Measures

| Attack Vector | Mitigation |
|---|---|
| Hapus loader script | Core module depend pada helpers dari asset — crash |
| Replace require(assetId) dengan dummy | Tidak tahu expected return shape — mechanic broken |
| Hardcode signKey | Rotate setiap 5 menit — expired |
| Intercept network response | Payload encrypted, key derived (tidak di-send) |
| Deobfuscate loader | Effort tinggi, dan logic tersebar di banyak titik |
| Block HTTP requests | Handshake gagal — enforcement trigger |
| Hapus enforcement code | Code di-fetch dari server, tidak ada di file lokal |

### 10.11 Admin Control

Admin dapat melalui dashboard:
- Melihat semua license yang aktif (last verified < 5 menit)
- Melihat game ID dan game name per license
- Revoke/suspend license (heartbeat berikutnya akan trigger enforcement)
- Melihat history verification attempts (IP, timestamp, success/fail)

---

*Bagian ini merupakan tambahan dari dokumentasi teknis utama.*
*Terakhir diperbarui: 17 Mei 2026*

---

## 11. Halaman Tambahan (Update Mei 2026)

### 11.1 Dashboard - Wallet (/dashboard/wallet)

Halaman manajemen saldo wallet pengguna. Menampilkan:
- Saldo saat ini (prominent)
- Statistik: total top-up, total pengeluaran, free audio hari ini
- 5 transaksi terakhir
- Quick link ke top-up dan store

### 11.2 Dashboard - Transaction History (/dashboard/transactions)

Riwayat lengkap semua transaksi wallet pengguna. Fitur:
- Filter berdasarkan tipe: TOP_UP, PURCHASE, AUDIO_CHARGE, REFUND, ADJUSTMENT
- Pagination (20 per halaman)
- Setiap entry menampilkan: tipe, deskripsi, jumlah (+/-), saldo setelah transaksi, tanggal

### 11.3 Admin - User Management (/admin/users)

Halaman admin untuk mengelola semua pengguna platform. Fitur:
- Daftar semua users (paginated, max 50 per halaman)
- Search berdasarkan nama atau email
- Filter berdasarkan role (ALL, USER, ADMIN)
- Statistik: total users, jumlah admin, total saldo platform
- Actions per user:
  - Promote/Demote role (dengan confirm dialog, tidak bisa demote diri sendiri)
  - Adjust balance (tambah/kurangi saldo dengan reason wajib)

### 11.4 Admin - License Enforcement (/admin/enforcement)

Dashboard real-time untuk monitoring dan enforcement lisensi. Fitur:
- Active sessions (license yang verified dalam 5 menit terakhir, auto-refresh 30 detik)
- Statistik: active count, unique games, unique users
- Kill switch per license (suspend + trigger enforcement pada heartbeat berikutnya)
- Verification logs modal per license (history attempts dengan IP, timestamp, result)

### 11.5 Invoice (Checkout Success)

Komponen invoice yang muncul setelah pembelian berhasil. Fitur:
- Modal overlay dengan tema putih (formal, printable)
- Data: invoice ID, tanggal, buyer info, items, license keys, total, payment method
- Instruksi instalasi
- Tombol Print / Save PDF (via window.print())

---

## 12. API Endpoints Tambahan (Update Mei 2026)

### 12.1 User Endpoints

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | /user/transactions | Login | Riwayat transaksi wallet (paginated, filterable by type) |

### 12.2 Admin Endpoints Tambahan

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | /admin/users | Admin | Daftar semua users (search, filter role, paginated) |
| PUT | /admin/users/:id/role | Admin | Ubah role user (USER/ADMIN, tidak bisa demote diri sendiri) |
| POST | /admin/users/:id/adjust-balance | Admin | Adjust saldo wallet (amount + reason wajib) |
| GET | /admin/licenses/active | Admin | License yang aktif saat ini (verified < 5 menit) |
| GET | /admin/licenses/:id/logs | Admin | Verification logs per license (paginated) |
| POST | /admin/licenses/:id/kill | Admin | Kill switch (suspend license, trigger enforcement) |

### 12.3 License Enforcement Endpoints

| Method | Path | Rate Limit | Deskripsi |
|---|---|---|---|
| POST | /api/license/handshake | 10 req/menit | Verifikasi awal + return signKey + session token |
| POST | /api/license/heartbeat | 15 req/menit | Periodic recheck + rotasi signKey (setiap 5 menit) |
| POST | /api/license/enforce | 5 req/menit | Return encrypted breaking code per phase |

---

*Terakhir diperbarui: 18 Mei 2026*

---

## 13. Roblox Owner Verification

### 13.1 Overview

Sistem verifikasi kepemilikan game Roblox memastikan bahwa hanya pemilik game yang sah yang dapat menggunakan license. Buyer wajib mendaftarkan Roblox User ID di profile, dan saat whitelist game, server memvalidasi kepemilikan via Roblox API.

### 13.2 Roblox User ID Binding

Setiap user platform wajib mendaftarkan Roblox User ID mereka sebelum dapat melakukan whitelist game. Field User.robloxUserId menyimpan ID ini.

Endpoint: PUT /user/roblox-id
- Validasi format (numeric)
- Validasi user exists via Roblox API (GET https://users.roblox.com/v1/users/{id})
- Simpan ke database

### 13.3 Ownership Validation saat Whitelist

Saat buyer whitelist game (POST /licenses/:id/whitelist), server melakukan:

1. Resolve placeId ke universeId:
   GET https://apis.roblox.com/universes/v1/places/{placeId}/universe

2. Resolve universe ke creator:
   GET https://games.roblox.com/v1/games?universeIds={universeId}
   Mendapat: creator.id, creator.type (User/Group)

3. Validasi ownership:
   - Jika creatorType = User: creatorId harus sama dengan uyer.robloxUserId
   - Jika creatorType = Group: resolve group owner via GET https://groups.roblox.com/v1/groups/{groupId}, cek owner.userId == buyer.robloxUserId

4. Jika valid: simpan metadata (universeId, creatorId, creatorType, verifiedAt) ke GameWhitelist record

### 13.4 Runtime Creator Consistency Check

Saat game running, asset module (CameraServiceCore) mengirim creatorId dan creatorType (diambil dari game.CreatorId dan game.CreatorType di Roblox engine) ke server di setiap handshake dan heartbeat.

Server membandingkan creatorId dari game dengan yang tersimpan di whitelist record. Jika mismatch, return { valid: false, reason: "creator_mismatch" }.

Karena game.CreatorId diambil dari dalam asset module (yang di-host di Roblox CDN milik developer), buyer tidak dapat memodifikasi nilai ini.

### 13.5 Heartbeat Policy

- Interval: 10 menit
- Grace fail: 3 kali berturut-turut sebelum license dianggap invalid
- Setiap heartbeat sukses: reset counter fail ke 0
- Setiap heartbeat gagal: counter +1
- Jika counter > 3: set runtime inactive

Timeline toleransi: 30 menit (3 x 10 menit) sebelum enforcement trigger.

### 13.6 Roblox API Caching

Semua response dari Roblox API di-cache in-memory dengan TTL 10 menit:
- universe:{placeId} -> universeId
- creator:{universeId} -> { creatorId, creatorType, creatorName }
- groupOwner:{groupId} -> ownerUserId

Tujuan: mengurangi jumlah request ke Roblox API dan menghindari rate limit.

### 13.7 GameWhitelist Schema (Updated)

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | VARCHAR(191) | Primary key |
| licenseId | VARCHAR(191) | FK ke License |
| gameId | VARCHAR(64) | Roblox Place ID |
| universeId | VARCHAR(64) | Resolved dari Roblox API |
| creatorId | VARCHAR(64) | Creator ID (User atau Group) |
| creatorType | VARCHAR(16) | "User" atau "Group" |
| gameName | VARCHAR(191) | Nama game (dari Roblox API) |
| active | BOOLEAN | Status aktif |
| verifiedAt | DATETIME | Kapan ownership terakhir diverifikasi |
| addedAt | DATETIME | Kapan ditambahkan |

---

## 14. Security Threat Model

### 14.1 Mitigasi yang Sudah Aktif

| Threat | Mitigasi | Status |
|---|---|---|
| License key sharing | Owner check (creatorId binding) + game whitelist | Mitigated |
| Fake gameId di request | creatorId diambil dari asset module (tidak bisa di-edit buyer) | Mitigated |
| Game milik orang lain di-whitelist | Roblox API ownership validation saat whitelist | Mitigated |
| Group game bukan milik buyer | Group owner check via Roblox API | Mitigated |
| Bypass license check di script | Obfuscation + runtime gates (4 titik) + dependency pada runtime object | Partially mitigated |
| Heartbeat false-positive (network issue) | Grace fail 3x (30 menit toleransi) | Mitigated |
| Webhook payment duplikat | Atomic idempotent transaction | Mitigated |
| Spam API endpoints | Rate limiting per endpoint | Mitigated |
| Admin abuse | Audit log + activity tracking | Mitigated |
| License revocation | Admin kill switch + heartbeat detect | Mitigated |
| SignKey interception | Derived key (tidak dikirim langsung) + rotate tiap 5 menit | Mitigated |

### 14.2 Residual Risk (Diterima)

| Risk | Alasan Diterima |
|---|---|
| Client-side patching oleh advanced attacker | Fundamental limitation Roblox architecture. Effort tinggi, kurang worth it untuk harga 200-500k |
| Roblox API downtime | Cache 10 menit + validasi hanya saat whitelist (bukan setiap runtime) |
| In-memory session store | Restart = session hilang. Acceptable untuk skala saat ini |
| Collab access (tim di game yang sama) | By design allowed, bukan bug |

### 14.3 Operational Response

| Situasi | Response |
|---|---|
| Suspicious multi-IP pada 1 license | Review di admin enforcement dashboard, revoke jika abuse |
| Buyer claim tidak bisa whitelist | Cek robloxUserId match, cek ownership via admin override |
| License perlu di-revoke | Admin kill switch → heartbeat berikutnya trigger enforcement |
| Buyer ganti Roblox account | Admin bisa override robloxUserId manual |
| Roblox API rate limit | Cache sudah handle, retry otomatis, error message jelas ke user |

---

## 15. Endpoint Reference (Complete, Updated Mei 2026)

### 15.1 User Endpoints

| Method | Path | Auth | Rate Limit | Deskripsi |
|---|---|---|---|---|
| PUT | /user/roblox-id | Login | - | Set/update Roblox User ID (validate via API) |
| GET | /user/transactions | Login | - | Riwayat transaksi wallet (paginated, filterable) |

### 15.2 License Enforcement Endpoints

| Method | Path | Auth | Rate Limit | Deskripsi |
|---|---|---|---|---|
| POST | /api/license/handshake | Public | 10/min | Verify + signKey + session + creator check |
| POST | /api/license/heartbeat | Public | 15/min | Recheck + rotate signKey + creator consistency |
| POST | /api/license/enforce | Public | 5/min | Return encrypted breaking code per phase |

### 15.3 Admin Endpoints (Tambahan)

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| GET | /admin/users | Admin | List semua users (search, filter, paginated) |
| PUT | /admin/users/:id/role | Admin | Ubah role (tidak bisa demote diri sendiri) |
| POST | /admin/users/:id/adjust-balance | Admin | Adjust saldo wallet (reason wajib) |
| GET | /admin/licenses/active | Admin | License aktif saat ini (verified < 5 menit) |
| GET | /admin/licenses/:id/logs | Admin | Verification logs per license |
| POST | /admin/licenses/:id/kill | Admin | Kill switch (suspend + trigger enforcement) |

---

*Terakhir diperbarui: 18 Mei 2026*

---

## 16. Mobile Auth (Update Juni 2026)

### 16.1 Overview

Sejak Juni 2026 backend melayani klien mobile (Flutter) di samping klien web. Kedua jalur mengakses endpoint protected yang sama melalui satu middleware `requireAuth`:

- **Web** — cookie `connect.sid` (express-session, MemoryStore)
- **Mobile** — `Authorization: Bearer <jwt>` (HS256 access JWT) + opaque refresh token

`requireAuth` mengecek header `Authorization: Bearer` lebih dulu, fallback ke cookie bila tidak ada. Bearer menang bila keduanya hadir. Tidak ada perubahan controller — `req.user.id` dan `req.user.role` diisi dari JWT payload bila Bearer dipakai.

### 16.2 Token Model

| Token | Algoritma / Bentuk | TTL (default) | Penyimpanan server | Penyimpanan klien |
|---|---|---|---|---|
| Access JWT | HS256, payload `{ sub, role, iat, exp }` | `ACCESS_TOKEN_TTL_DAYS` (7 hari) | Tidak disimpan (stateless) | `flutter_secure_storage` |
| Refresh token | 32 random bytes (base64url) | `REFRESH_TOKEN_TTL_DAYS` (30 hari) | `Session.sessionToken` (SHA-256 hash) | `flutter_secure_storage` |

Access JWT tidak bisa di-revoke sebelum expiry — trade-off ditutup oleh TTL pendek dan revoke refresh token.

### 16.3 Endpoint Mobile-Specific

| Method | Path | Auth | Rate Limit | Deskripsi |
|---|---|---|---|---|
| GET | /auth/google?platform=mobile | Publik | - | Mulai OAuth dengan signed state untuk cabang mobile |
| GET | /auth/discord?platform=mobile | Publik | - | Mulai OAuth dengan signed state untuk cabang mobile |
| POST | /auth/refresh | Publik (rate limit) | 30/min | Tukar refresh token dengan pasangan access+refresh baru. Old session row dihapus, row baru di-insert (rotation). Reuse → revoke seluruh session user |
| POST | /auth/logout-mobile | Bearer | 10/min/user | Hapus row `Session` yang cocok dengan hash refresh token. Idempotent |

Endpoint lain (`/auth/me`, `/topup/*`, `/checkout`, `/licenses/*`, `/admin/*`, dll.) otomatis bisa diakses via Bearer karena `requireAuth` sudah mendukung dua jalur.

### 16.4 Deep Link

Backend memperlakukan deep link sebagai redirect URL opaque dari env `MOBILE_DEEP_LINK_REDIRECT` (default `rbxroyale://auth`). Format redirect dari callback:

| Outcome | Redirect URL |
|---|---|
| Sukses | `${MOBILE_DEEP_LINK_REDIRECT}?access=<jwt>&refresh=<token>` |
| OAuth gagal (cancel/denied) | `${MOBILE_DEEP_LINK_REDIRECT}?error=oauth_failed` |
| State HMAC tidak valid | `FRONTEND_URL/?login=failed` (treat sebagai forged, tidak redirect ke deep link) |

Custom scheme bisa di-hijack app lain di device yang sama — risiko diakui dan diterima untuk v1. Migrasi ke App Links / Universal Links bersifat additive (cukup ganti `MOBILE_DEEP_LINK_REDIRECT` ke URL HTTPS yang diverifikasi via `assetlinks.json` / `apple-app-site-association`).

### 16.5 Reuse Detection

Setiap `/auth/refresh` sukses akan menghapus row `Session` lama dan insert row baru (rotation). Bila klien menyajikan refresh yang sudah dirotasi, server menghapus seluruh `Session` milik user tersebut sebagai sinyal token dicuri (RFC 6819 §5.2.2.3). Klien dipaksa login ulang.

### 16.6 Reusing the Session Table (No Migration)

Fitur ini tidak menambah kolom atau tabel. Tabel `Session` di `prisma/schema.prisma` sudah ada sejak skema awal RBX Royale tapi belum dipakai (web memakai express-session MemoryStore). Refresh token mobile mengisi tabel ini sekarang dengan konvensi: `sessionToken` = SHA-256 hash dari raw refresh, `expiresAt` = sekarang + `REFRESH_TOKEN_TTL_DAYS`, `ipAddress`/`userAgent` = forensic snapshot saat issue (tidak divalidasi saat use).

### 16.7 Konfigurasi

Env vars baru (lihat juga 9.1):

| Variable | Wajib di production | Default dev | Keterangan |
|---|---|---|---|
| JWT_SECRET | Ya (fail-closed, `process.exit(1)`) | warned default | HS256 signing + HMAC OAuth state |
| MOBILE_DEEP_LINK_REDIRECT | Ya | `rbxroyale://auth` | Redirect tujuan setelah callback mobile sukses |
| ACCESS_TOKEN_TTL_DAYS | Tidak | 7 | TTL access JWT |
| REFRESH_TOKEN_TTL_DAYS | Tidak | 30 | TTL refresh token (`Session.expiresAt`) |

### 16.8 Referensi Spec & Plan

- Spec: `docs/superpowers/specs/2026-06-14-mobile-oauth-token-auth-design.md`
- Plan: `docs/superpowers/plans/2026-06-14-mobile-oauth-token-auth.md`
- Modul utama: `backend/src/services/authTokenService.js` (sign/verify JWT, issue/rotate/revoke refresh token, signOAuthState/verifyOAuthState)
- Middleware: `backend/src/middlewares/auth.js` `requireAuth`
- Controller: `backend/src/controllers/authController.js` (`handleRefresh`, `handleMobileLogout`, cabang mobile pada OAuth callback)
- OpenAPI: `backend/openapi.yaml` (security scheme `bearerAuth`)

---

*Terakhir diperbarui: 14 Juni 2026*
