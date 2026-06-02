# Frontend Pages Plan — RBX Royale Platform

**Last Updated:** 2026-05-15  
**Tech Stack:** Next.js 14+ App Router, TypeScript, Tailwind CSS  
**Backend:** Express (localhost:3001)  
**Auth:** Session-based (cookie `connect.sid`) via Google/Discord OAuth  
**Bahasa:** Indonesia (untuk internal team)

---

## Legend

- ✅ = Sudah ada (done)
- 🔨 = Perlu dibuat (todo)
- 🔧 = Perlu di-enhance (existing tapi belum lengkap)
- **P1** = Priority 1 (Phase 1 completion — harus selesai sebelum launch)
- **P2** = Priority 2 (Phase 2 — Script Store)
- **P3** = Priority 3 (Nice to have, bisa nanti)

---

## Overview Arsitektur Halaman

```
/                           → Landing page (public)
/login                      → OAuth login (public)
/audio/studio               → Audio editor (protected)
/audio/history              → Audio upload history (protected)
/topup                      → Top-up wallet (protected)
/dashboard                  → User dashboard home (protected) — GABUNG profile
/dashboard/transactions     → Transaction history (protected)
/dashboard/licenses         → My licenses list (protected)
/dashboard/licenses/[id]    → License detail (protected)
/store                      → Store homepage (public)
/store/products             → Product listing (public)
/store/products/[slug]      → Product detail (public)
/store/cart                 → Shopping cart (protected)
/store/checkout             → Checkout (protected)
/store/checkout/success     → Purchase success (protected)
/admin                      → Admin dashboard (admin only)
/admin/products             → Product management (admin only)
/admin/products/new         → Create product (admin only)
/admin/products/[id]/edit   → Edit product (admin only)
/admin/categories           → Category management (admin only)
/admin/licenses             → License management (admin only)
```

---

## Halaman yang Sudah Ada (✅ Done)

### ✅ `/` — Landing Page

**File:** `app/page.tsx`  
**Auth:** Public  
**Status:** Done  
**Deskripsi:** Homepage platform RBX Royale. Hero section, fitur highlights, CTA ke audio studio dan store.

---

### ✅ `/login` — Login Page

**File:** `app/login/page.tsx`  
**Auth:** Public  
**Status:** Done  
**Deskripsi:** Halaman login dengan 2 tombol OAuth (Google, Discord). Redirect ke backend `/auth/google` dan `/auth/discord`.

---

### ✅ `/audio/studio` — Audio Processing Studio

**File:** `app/audio/studio/page.tsx`  
**Auth:** Protected (redirect ke /login kalau belum login)  
**Status:** Done  
**Deskripsi:** Editor audio browser-based. Upload file, adjust gain/EQ/reverb, preview, export ke WAV/MP3/OGG, upload hasil ke backend.

---

### ✅ `/audio/history` — Audio Upload History

**File:** `app/audio/history/page.tsx`  
**Auth:** Protected  
**Status:** Done  
**Deskripsi:** List semua audio yang pernah di-process dan di-upload. Bisa download lagi.

**API Calls:**
- `GET /history` — fetch list uploads
- `GET /history/{id}/download` — download file

---

### ✅ `/topup` — Top-Up Wallet

**File:** `app/topup/page.tsx`  
**Auth:** Protected  
**Status:** Done (perlu enhance)  
**Deskripsi:** Form input jumlah top-up (Rp 1.000 - 500.000), submit ke Bayar.gg, redirect ke payment URL.

**API Calls:**
- `POST /topup/create` — buat order top-up

---

### ✅ `/profile` — User Profile

**File:** `app/profile/page.tsx`  
**Auth:** Protected  
**Status:** Done — **AKAN DI-MERGE KE `/dashboard`**  
**Deskripsi:** Tampilkan user info, wallet balance, free audio quota. Akan digabung ke dashboard.

---

## Halaman yang Perlu Di-Enhance (🔧)

### 🔧 `/topup` — Top-Up Wallet (Enhance)

**Priority:** P1  
**File:** `app/topup/page.tsx`  
**Auth:** Protected

**Yang perlu ditambah:**
1. **Status polling** — Setelah user balik dari Bayar.gg, cek apakah payment sudah berhasil
2. **Loading state** saat menunggu response dari Bayar.gg
3. **Error handling** yang lebih baik (amount invalid, gateway error, dll)
4. **Success state** — tampilkan konfirmasi kalau top-up berhasil + balance baru

**Enhance Flow:**
```
User input amount → Submit → Loading → Redirect ke Bayar.gg
→ User bayar → Redirect balik ke /topup?order=xxx
→ Polling GET /topup/status/{orderId} setiap 3 detik
→ Kalau paid=true → Show success + update balance
→ Kalau timeout (5 menit) → Show "payment pending, cek nanti"
```

**API Calls:**
- `POST /topup/create` — buat order (sudah ada)
- `GET /topup/status/{orderId}` — polling status (BARU)
- `GET /auth/me` — refresh user data setelah success (untuk update balance di header)

**State:**
```typescript
interface TopUpState {
  step: 'input' | 'processing' | 'polling' | 'success' | 'failed' | 'timeout'
  amount: number
  orderId: string | null
  invoiceId: string | null
  paymentUrl: string | null
  error: string | null
}
```

**Edge Cases:**
- User close tab sebelum bayar → order tetap PENDING di DB, bisa cek nanti
- Bayar.gg down → show error "Payment gateway sedang gangguan"
- User input amount < 1000 atau > 500000 → client-side validation
- Double submit → disable button setelah click pertama
- User balik dari Bayar.gg tapi belum bayar → polling timeout → show "Belum terbayar"

**UX Notes:**
- Show current balance di atas form
- Quick amount buttons: Rp 10.000, Rp 25.000, Rp 50.000, Rp 100.000
- Disable submit kalau amount invalid
- Show countdown timer kalau payment punya expiry

---

## Halaman Baru yang Perlu Dibuat (🔨)

---

### 🔨 `/dashboard` — User Dashboard

**Priority:** P1  
**File:** `app/dashboard/page.tsx`  
**Auth:** Protected  
**Menggantikan:** `/profile` (merge)

**Deskripsi:**  
Halaman utama user setelah login. Overview semua informasi penting: profile, wallet balance, recent activity, quick actions. Ini "home base" user di platform.

**API Calls:**
- `GET /auth/me` — user data + wallet balance (sudah ada di auth context)
- `GET /licenses` — count licenses (untuk summary card)

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `ProfileCard` | Avatar, nama, email, member since |
| `WalletCard` | Balance besar, tombol "Top Up", link ke transaction history |
| `QuotaCard` | Free audio used today (x/3), reset info |
| `QuickActions` | Grid tombol: Audio Studio, Store, My Licenses, Top Up |
| `RecentActivity` | 5 aktivitas terakhir (top-up, purchase, audio export) |
| `LicenseSummary` | Jumlah active licenses, link ke /dashboard/licenses |

**State:**
```typescript
interface DashboardState {
  user: User                    // dari auth context
  licenses: License[]           // dari GET /licenses
  loadingLicenses: boolean
}
```

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Header (shared)                              │
├─────────────────────────────────────────────┤
│ ┌──────────────┐  ┌──────────────────────┐  │
│ │ ProfileCard  │  │ WalletCard           │  │
│ │ avatar+name  │  │ Rp 50.000            │  │
│ │ email        │  │ [Top Up] [History]   │  │
│ └──────────────┘  └──────────────────────┘  │
│ ┌──────────────┐  ┌──────────────────────┐  │
│ │ QuotaCard    │  │ LicenseSummary       │  │
│ │ 1/3 used     │  │ 3 active licenses    │  │
│ └──────────────┘  └──────────────────────┘  │
│ ┌───────────────────────────────────────────┐│
│ │ QuickActions                              ││
│ │ [Studio] [Store] [Licenses] [Top Up]      ││
│ └───────────────────────────────────────────┘│
│ ┌───────────────────────────────────────────┐│
│ │ RecentActivity (5 items)                  ││
│ └───────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Edge Cases:**
- User baru (belum pernah top-up, belum punya license) → show onboarding hints
- Wallet balance 0 → highlight "Top Up" button
- Free quota habis → show "Upgrade" atau info pricing

**UX Notes:**
- Responsive: 2 kolom di desktop, 1 kolom di mobile
- Cards bisa di-click untuk navigate ke detail page
- Balance selalu fresh (dari auth context yang auto-refresh)
- Greeting: "Halo, {displayName}!" di atas

---

### 🔨 `/dashboard/transactions` — Transaction History

**Priority:** P1  
**File:** `app/dashboard/transactions/page.tsx`  
**Auth:** Protected

**Deskripsi:**  
Riwayat semua transaksi keuangan user: top-up, pembelian script, audio processing charges. Ini beda dari audio history — ini fokus ke uang/token.

**API Calls:**
- `GET /topup/status/{reference}` — (kalau perlu detail per order)
- Note: Backend belum punya endpoint khusus "all transactions". Kemungkinan perlu endpoint baru `GET /user/transactions` atau gabung dari beberapa source.

**Fallback (kalau endpoint belum ada):**
Bisa fetch dari multiple endpoints dan merge di frontend:
- Top-up orders (dari TopUpOrder records)
- Service transactions (audio charges)
- Purchases (script purchases)

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `TransactionList` | List semua transaksi |
| `TransactionItem` | Row: icon, title, amount (+/-), date, status badge |
| `TransactionFilter` | Filter by type: All, Top-Up, Purchase, Audio |
| `DateRangeFilter` | Filter by date range (optional, P3) |
| `EmptyState` | "Belum ada transaksi" |

**State:**
```typescript
interface TransactionHistoryState {
  transactions: Transaction[]
  filter: 'all' | 'topup' | 'purchase' | 'audio'
  loading: boolean
  error: string | null
}

interface Transaction {
  id: string
  type: 'topup' | 'purchase' | 'audio_charge'
  title: string
  description: string
  amount: number          // positive = masuk, negative = keluar
  status: 'completed' | 'pending' | 'failed'
  createdAt: string
  metadata?: Record<string, any>
}
```

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Transaction History                          │
│ ┌───────────────────────────────────────────┐│
│ │ Filter: [All] [Top-Up] [Purchase] [Audio] ││
│ └───────────────────────────────────────────┘│
│ ┌───────────────────────────────────────────┐│
│ │ ↑ Top Up         +Rp 10.000   Completed  ││
│ │   14 Mei 2026                             ││
│ ├───────────────────────────────────────────┤│
│ │ ↓ Audio Export   -Rp 2.000    Completed   ││
│ │   14 Mei 2026                             ││
│ ├───────────────────────────────────────────┤│
│ │ ↓ Script Purchase -Rp 50.000  Completed   ││
│ │   13 Mei 2026                             ││
│ └───────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Edge Cases:**
- Belum ada transaksi → empty state dengan CTA "Top Up Sekarang"
- Transaction pending (top-up belum dibayar) → show status badge kuning
- Transaction failed → show status badge merah
- Banyak transaksi → pagination atau infinite scroll

**UX Notes:**
- Amount positif (top-up) warna hijau, negatif (spending) warna merah
- Icon berbeda per type (arrow-up untuk top-up, shopping-bag untuk purchase, music untuk audio)
- Klik item bisa expand untuk lihat detail (metadata)
- Sort by newest first (default)

---

### 🔨 `/store` — Store Homepage

**Priority:** P2  
**File:** `app/store/page.tsx`  
**Auth:** Public (bisa diakses tanpa login)

**Deskripsi:**  
Halaman utama script store. Menampilkan featured products, kategori, dan CTA untuk browsing. Ini "etalase" utama platform.

**API Calls:**
- `GET /products?featured=true&limit=6` — featured products
- `GET /products/categories` — list kategori
- `GET /products?sort=newest&limit=4` — newest products

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `HeroSection` | Banner besar dengan tagline + CTA "Browse Scripts" |
| `FeaturedProducts` | Grid 3x2 produk featured |
| `CategoryGrid` | Grid kategori dengan icon + nama + product count |
| `NewestProducts` | Row 4 produk terbaru |
| `ProductCard` | Card: thumbnail, nama, harga terendah, category badge |
| `CTASection` | "Punya pertanyaan?" atau "Butuh custom script?" |

**State:**
```typescript
interface StoreHomeState {
  featuredProducts: ProductSummary[]
  newestProducts: ProductSummary[]
  categories: Category[]
  loading: boolean
  error: string | null
}
```

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Header (shared)                              │
├─────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────┐│
│ │ HeroSection                               ││
│ │ "Premium Roblox Scripts"                  ││
│ │ "Verified, licensed, ready to use"        ││
│ │ [Browse All Scripts]                      ││
│ └───────────────────────────────────────────┘│
│                                              │
│ Featured Scripts                             │
│ ┌────────┐ ┌────────┐ ┌────────┐           │
│ │ Card 1 │ │ Card 2 │ │ Card 3 │           │
│ └────────┘ └────────┘ └────────┘           │
│ ┌────────┐ ┌────────┐ ┌────────┐           │
│ │ Card 4 │ │ Card 5 │ │ Card 6 │           │
│ └────────┘ └────────┘ └────────┘           │
│                                              │
│ Categories                                   │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│ │ UI   │ │ Util │ │ Game │ │ More │       │
│ └──────┘ └──────┘ └──────┘ └──────┘       │
│                                              │
│ Newest Additions                             │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│
│ │ New 1  │ │ New 2  │ │ New 3  │ │ New 4  ││
│ └────────┘ └────────┘ └────────┘ └────────┘│
└─────────────────────────────────────────────┘
```

**Edge Cases:**
- Belum ada produk → show "Coming soon" placeholder
- Belum ada kategori → hide section
- Gambar produk gagal load → fallback placeholder image
- Slow connection → skeleton loading cards

**UX Notes:**
- ProductCard show harga terendah (Personal tier): "Mulai dari Rp 50.000"
- Hover effect pada cards (scale up sedikit + shadow)
- Responsive: 3 col desktop, 2 col tablet, 1 col mobile
- SEO: halaman ini bisa SSG (static generation) karena public + jarang berubah

---

### 🔨 `/store/products` — Product Listing

**Priority:** P2  
**File:** `app/store/products/page.tsx`  
**Auth:** Public

**Deskripsi:**  
Halaman listing semua produk dengan search, filter kategori, sorting, dan pagination. User bisa browse dan cari script yang mereka butuhkan.

**API Calls:**
- `GET /products?page=1&limit=12&sort=newest&category=&search=` — products with filters
- `GET /products/categories` — for filter dropdown

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `SearchBar` | Input search dengan debounce 300ms |
| `CategoryFilter` | Dropdown atau pill buttons untuk filter kategori |
| `SortDropdown` | Sort: Terbaru, Harga Terendah, Harga Tertinggi, Nama A-Z |
| `ProductGrid` | Grid of ProductCards |
| `ProductCard` | Thumbnail, nama, short desc, harga, category badge, sold count |
| `Pagination` | Page numbers + prev/next |
| `EmptyState` | "Tidak ada produk ditemukan" |
| `LoadingSkeleton` | Skeleton cards saat loading |

**State:**
```typescript
interface ProductListState {
  products: ProductSummary[]
  categories: Category[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  filters: {
    search: string
    category: string      // category slug or empty
    sort: 'newest' | 'price-asc' | 'price-desc' | 'name'
  }
  loading: boolean
  error: string | null
}
```

**URL Query Params Sync:**
```
/store/products?search=ui&category=ui-systems&sort=price-asc&page=2
```
Filter state harus sync dengan URL query params supaya:
- User bisa share link dengan filter
- Browser back/forward works
- Refresh tidak reset filter

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Script Store                                 │
│ ┌───────────────────────────────────────────┐│
│ │ [🔍 Search scripts...]                    ││
│ └───────────────────────────────────────────┘│
│ ┌─────────────────┐ ┌──────────────────────┐│
│ │ Category Filter │ │ Sort: [Terbaru ▼]    ││
│ │ [All] [UI] [Util]│ │                      ││
│ └─────────────────┘ └──────────────────────┘│
│                                              │
│ Showing 12 of 24 products                    │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│
│ │ Card   │ │ Card   │ │ Card   │ │ Card   ││
│ └────────┘ └────────┘ └────────┘ └────────┘│
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│
│ │ Card   │ │ Card   │ │ Card   │ │ Card   ││
│ └────────┘ └────────┘ └────────┘ └────────┘│
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│
│ │ Card   │ │ Card   │ │ Card   │ │ Card   ││
│ └────────┘ └────────┘ └────────┘ └────────┘│
│                                              │
│ [← Prev] [1] [2] [3] [Next →]              │
└─────────────────────────────────────────────┘
```

**Edge Cases:**
- Search tidak ketemu → "Tidak ada produk untuk '{query}'"
- Kategori kosong → "Belum ada produk di kategori ini"
- Page melebihi total → redirect ke page 1
- Produk inactive tidak muncul (backend sudah filter)
- Slow search → show loading indicator di search bar

**UX Notes:**
- Debounce search 300ms (jangan hit API setiap keystroke)
- Responsive grid: 4 col desktop, 3 col tablet, 2 col mobile (1 col small mobile)
- Show "X produk ditemukan" count
- ProductCard hover → show "Lihat Detail" overlay
- Harga tampilkan yang terendah: "Mulai Rp 50.000"
- Sold count sebagai social proof: "42 terjual"

---

### 🔨 `/store/products/[slug]` — Product Detail

**Priority:** P2  
**File:** `app/store/products/[slug]/page.tsx`  
**Auth:** Public (tapi "Add to Cart" butuh login)

**Deskripsi:**  
Halaman detail produk. Menampilkan semua info tentang script: deskripsi, screenshots, pricing tiers, fitur, dan tombol add to cart.

**API Calls:**
- `GET /products/{slug}` — product detail
- `POST /cart/add` — add to cart (protected, butuh login)

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `ProductGallery` | Image carousel/gallery (thumbnail + additional images) |
| `ProductInfo` | Nama, category badge, version, sold count |
| `ProductDescription` | Full description (support markdown?) |
| `PricingTiers` | 3 tier cards: Personal, Commercial, Enterprise |
| `TierCard` | Nama tier, harga, max games, features, "Add to Cart" button |
| `AddToCartButton` | Button yang handle login check + add to cart |
| `ProductDocs` | List documentation files (kalau ada) |
| `Breadcrumb` | Store > Category > Product Name |

**State:**
```typescript
interface ProductDetailState {
  product: ProductDetail | null
  selectedTier: 'PERSONAL' | 'COMMERCIAL' | 'ENTERPRISE'
  loading: boolean
  error: string | null
  addingToCart: boolean
  addToCartSuccess: boolean
}
```

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Breadcrumb: Store > UI Systems > UI Pro      │
├─────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌─────────────────────┐│
│ │                  │ │ UI System Pro        ││
│ │  Product Image   │ │ Category: UI Systems ││
│ │  Gallery         │ │ Version: 1.2.0       ││
│ │                  │ │ 42 terjual           ││
│ │                  │ │                      ││
│ └──────────────────┘ │ Pilih Tier:          ││
│                      │ ┌───┐ ┌───┐ ┌───┐   ││
│                      │ │Per│ │Com│ │Ent│   ││
│                      │ │50k│ │150│ │500│   ││
│                      │ └───┘ └───┘ └───┘   ││
│                      │                      ││
│                      │ [Add to Cart]        ││
│                      └─────────────────────┘│
│                                              │
│ ┌───────────────────────────────────────────┐│
│ │ Description                               ││
│ │ A comprehensive UI framework for...       ││
│ └───────────────────────────────────────────┘│
│                                              │
│ ┌───────────────────────────────────────────┐│
│ │ Pricing Comparison                        ││
│ │ ┌─────────┐ ┌─────────┐ ┌─────────┐     ││
│ │ │Personal │ │Commerc. │ │Enterpr. │     ││
│ │ │Rp 50.000│ │Rp150.000│ │Rp500.000│     ││
│ │ │3 games  │ │10 games │ │Unlimited│     ││
│ │ │         │ │Priority │ │Source   │     ││
│ │ │         │ │Support  │ │Code     │     ││
│ │ └─────────┘ └─────────┘ └─────────┘     ││
│ └───────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Edge Cases:**
- Product not found (404) → show "Produk tidak ditemukan" + link back to store
- Product inactive → show "Produk tidak tersedia"
- User belum login klik "Add to Cart" → redirect ke /login?redirect=/store/products/{slug}
- User sudah punya license untuk produk ini → show "Sudah Dimiliki" instead of Add to Cart
- Image gagal load → placeholder
- Harga 0 → show "Gratis" atau hide tier

**UX Notes:**
- Default selected tier: Personal (paling murah)
- Tier card yang selected punya border highlight
- "Add to Cart" button disabled saat `addingToCart=true`
- Success toast: "Ditambahkan ke keranjang!" dengan link ke cart
- SEO: halaman ini SSR (server-side render) untuk indexing
- Breadcrumb untuk navigasi balik
- Sticky "Add to Cart" section di mobile (fixed bottom)

---

### 🔨 `/store/cart` — Shopping Cart

**Priority:** P2  
**File:** `app/store/cart/page.tsx`  
**Auth:** Protected

**Deskripsi:**  
Halaman keranjang belanja. User bisa review items, ubah license type, hapus item, dan proceed ke checkout.

**API Calls:**
- `GET /cart` — fetch cart items + total
- `DELETE /cart/{itemId}` — remove item
- `DELETE /cart` — clear all
- `POST /cart/add` — update license type (re-add with different type)

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `CartItemRow` | Product info, license type selector, price, remove button |
| `LicenseTypeSelector` | Dropdown: Personal/Commercial/Enterprise (update price) |
| `CartSummary` | Total items, total price, wallet balance, shortfall warning |
| `CheckoutButton` | "Proceed to Checkout" (disabled kalau cart kosong) |
| `EmptyCart` | "Keranjang kosong" + CTA ke store |
| `RemoveConfirmModal` | Konfirmasi sebelum hapus item |

**State:**
```typescript
interface CartState {
  items: CartItem[]
  total: number
  loading: boolean
  removing: string | null    // itemId yang sedang di-remove
  error: string | null
}
```

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Keranjang Belanja (2 items)                  │
├─────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────┐│
│ │ [img] UI System Pro                       ││
│ │       Tier: [Personal ▼]                  ││
│ │       Rp 50.000              [🗑 Hapus]   ││
│ ├───────────────────────────────────────────┤│
│ │ [img] Game Mechanics Kit                  ││
│ │       Tier: [Commercial ▼]                ││
│ │       Rp 200.000             [🗑 Hapus]   ││
│ └───────────────────────────────────────────┘│
│                                              │
│ ┌───────────────────────────────────────────┐│
│ │ Ringkasan                                 ││
│ │ Total: Rp 250.000                         ││
│ │ Saldo: Rp 50.000                          ││
│ │ ⚠️ Kurang: Rp 200.000                     ││
│ │                                           ││
│ │ [Top Up Dulu]  [Checkout →]               ││
│ └───────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Edge Cases:**
- Cart kosong → empty state + "Browse Store" CTA
- Product jadi inactive setelah ditambah ke cart → show warning "Produk tidak tersedia"
- Saldo kurang → show shortfall amount + "Top Up Dulu" button
- User sudah punya license (beli di session lain) → show warning, disable checkout untuk item itu
- Ubah license type → price update real-time
- Remove last item → show empty state

**UX Notes:**
- License type change langsung update harga (optimistic UI, confirm via API)
- Show wallet balance di summary supaya user tahu apakah cukup
- Shortfall warning warna merah/orange
- "Top Up Dulu" button navigate ke /topup dengan redirect back ke /store/cart
- Responsive: full width di mobile, 2 column (items + summary) di desktop
- Confirm dialog sebelum remove item (prevent accidental delete)

---

### 🔨 `/store/checkout` — Checkout

**Priority:** P2  
**File:** `app/store/checkout/page.tsx`  
**Auth:** Protected

**Deskripsi:**  
Halaman konfirmasi pembelian. Review items, cek saldo, confirm purchase. Deduct wallet balance dan generate licenses.

**API Calls:**
- `GET /cart` — fetch cart items (untuk review)
- `POST /checkout` — process purchase
- `GET /auth/me` — refresh balance setelah purchase

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `OrderReview` | List items yang akan dibeli (read-only) |
| `PaymentSummary` | Total, wallet balance, sufficient/insufficient indicator |
| `ConfirmButton` | "Konfirmasi Pembelian" dengan loading state |
| `InsufficientBalance` | Warning + link ke top-up |
| `CheckoutSuccess` | Redirect ke /store/checkout/success |

**State:**
```typescript
interface CheckoutState {
  items: CartItem[]
  total: number
  walletBalance: number
  sufficient: boolean
  processing: boolean
  error: string | null
}
```

**Flow:**
```
Load cart items → Show review
→ User klik "Konfirmasi"
→ POST /checkout
→ Success → redirect ke /store/checkout/success
→ Error 402 → show "Saldo tidak cukup"
→ Error 409 → show "Sudah punya license"
→ Error lain → show generic error
```

**Edge Cases:**
- Saldo tidak cukup → disable confirm button, show top-up CTA
- Cart kosong (user navigate langsung ke /checkout) → redirect ke /store/cart
- Double click confirm → disable button setelah click pertama
- Network error saat checkout → show retry button
- Concurrent purchase (user beli di tab lain) → handle 409 gracefully
- Session expired saat checkout → redirect ke login

**UX Notes:**
- Halaman ini read-only (tidak bisa edit cart di sini, harus balik ke /store/cart)
- Show "Saldo setelah pembelian: Rp X" supaya user tahu sisa
- Confirm button warna hijau, prominent
- Loading state: "Memproses pembelian..." dengan spinner
- Jangan show license keys di halaman ini (redirect ke success page)

---

### 🔨 `/store/checkout/success` — Purchase Success

**Priority:** P2  
**File:** `app/store/checkout/success/page.tsx`  
**Auth:** Protected

**Deskripsi:**  
Halaman setelah pembelian berhasil. Tampilkan license keys yang baru di-generate, link download, dan next steps.

**API Calls:**
- `GET /licenses` — fetch newly created licenses

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `SuccessHeader` | Checkmark icon + "Pembelian Berhasil!" |
| `LicenseKeyList` | List license keys yang baru dibuat |
| `LicenseKeyCard` | Product name, license key (copyable), tier, max games |
| `CopyButton` | Copy license key ke clipboard |
| `NextSteps` | Instruksi: 1) Download script, 2) Paste key di Roblox Studio, 3) Add game to whitelist |
| `ActionButtons` | "Lihat Licenses" + "Kembali ke Store" |

**State:**
```typescript
interface CheckoutSuccessState {
  licenses: License[]
  loading: boolean
  copiedKey: string | null   // track which key was copied
}
```

**Layout:**
```
┌─────────────────────────────────────────────┐
│         ✓ Pembelian Berhasil!                │
│                                              │
│ ┌───────────────────────────────────────────┐│
│ │ UI System Pro — Personal License          ││
│ │ Key: RBXR-A2B3-C4D5-E6F7-G8H9  [Copy]   ││
│ │ Max Games: 3                              ││
│ │ [Download Script]                         ││
│ └───────────────────────────────────────────┘│
│                                              │
│ ┌───────────────────────────────────────────┐│
│ │ Langkah Selanjutnya:                      ││
│ │ 1. Download script file                   ││
│ │ 2. Paste license key di script config     ││
│ │ 3. Tambahkan Game ID di dashboard         ││
│ │ 4. Publish game — license auto-verify     ││
│ └───────────────────────────────────────────┘│
│                                              │
│ [Lihat Semua Licenses]  [Kembali ke Store]  │
└─────────────────────────────────────────────┘
```

**Edge Cases:**
- User refresh halaman → licenses tetap bisa di-fetch dari API
- User navigate langsung ke URL ini tanpa purchase → show empty / redirect
- Copy button → show "Copied!" feedback 2 detik

**UX Notes:**
- Confetti animation atau success icon besar di atas
- License key pakai monospace font, mudah dibaca
- Copy button prominent (user pasti perlu copy key)
- Next steps jelas dan numbered
- Jangan auto-redirect dari halaman ini (user perlu waktu baca + copy)

---

### 🔨 `/dashboard/licenses` — My Licenses

**Priority:** P2  
**File:** `app/dashboard/licenses/page.tsx`  
**Auth:** Protected

**Deskripsi:**  
List semua license yang dimiliki user. Dari sini user bisa lihat status, download script, dan manage game whitelist.

**API Calls:**
- `GET /licenses` — fetch all user licenses

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `LicenseList` | Grid/list of LicenseCards |
| `LicenseCard` | Product thumbnail, name, key (masked), tier, status badge, game count |
| `StatusBadge` | ACTIVE (hijau), SUSPENDED (kuning), REVOKED (merah), EXPIRED (abu) |
| `LicenseFilter` | Filter by status: All, Active, Suspended, Expired |
| `EmptyState` | "Belum punya license" + CTA ke store |

**State:**
```typescript
interface LicensesPageState {
  licenses: License[]
  filter: 'all' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED'
  loading: boolean
  error: string | null
}
```

**Layout:**
```
┌─────────────────────────────────────────────┐
│ My Licenses (3)                              │
│ Filter: [All] [Active] [Suspended] [Expired]│
├─────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────┐│
│ │ [img] UI System Pro          🟢 ACTIVE    ││
│ │       Personal License                    ││
│ │       Key: RBXR-****-****-****-G8H9       ││
│ │       Games: 2/3 whitelisted              ││
│ │       [Lihat Detail →]                    ││
│ ├───────────────────────────────────────────┤│
│ │ [img] Game Mechanics Kit     🟢 ACTIVE    ││
│ │       Commercial License                  ││
│ │       Key: RBXR-****-****-****-X2Y3       ││
│ │       Games: 5/10 whitelisted             ││
│ │       [Lihat Detail →]                    ││
│ └───────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Edge Cases:**
- Belum punya license → empty state + "Browse Store" CTA
- License expired → show badge + info "Perpanjang" (kalau ada subscription model nanti)
- License suspended → show badge + info "Hubungi support"
- Banyak licenses → pagination atau scroll

**UX Notes:**
- License key di-mask (hanya show 4 karakter terakhir) di list view
- Full key visible di detail page
- Status badge warna-warni untuk quick scan
- Show "x/y games" sebagai progress indicator
- Klik card → navigate ke `/dashboard/licenses/[id]`
- Responsive: 1 column di mobile, 2 column di desktop

---

### 🔨 `/dashboard/licenses/[id]` — License Detail

**Priority:** P2  
**File:** `app/dashboard/licenses/[id]/page.tsx`  
**Auth:** Protected

**Deskripsi:**  
Detail lengkap satu license. Tampilkan full key (copyable), game whitelist management, download script, dan verification logs.

**API Calls:**
- `GET /licenses/{id}` — license detail + games + recent verifications
- `POST /licenses/{id}/whitelist` — add game
- `DELETE /licenses/{id}/whitelist/{gameWhitelistId}` — remove game
- `GET /licenses/{id}/download` — download script file

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `LicenseHeader` | Product name, tier, status badge, purchase date |
| `LicenseKeyDisplay` | Full key (monospace) + copy button |
| `GameWhitelistSection` | List games + add/remove functionality |
| `AddGameForm` | Input game ID + optional name, submit button |
| `GameRow` | Game ID, name, status, remove button |
| `DownloadSection` | Download script button + version info |
| `VerificationLog` | Recent verification attempts (success/fail) |
| `IntegrationGuide` | Collapsible section: cara pakai di Roblox Studio |

**State:**
```typescript
interface LicenseDetailState {
  license: LicenseDetail | null
  loading: boolean
  error: string | null
  addingGame: boolean
  removingGame: string | null
  newGameId: string
  newGameName: string
  downloading: boolean
}
```

**Layout:**
```
┌─────────────────────────────────────────────┐
│ ← Back to My Licenses                        │
├─────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────┐│
│ │ UI System Pro — Personal License          ││
│ │ Status: 🟢 ACTIVE                         ││
│ │ Purchased: 13 Mei 2026                    ││
│ │ Amount: Rp 50.000                         ││
│ └───────────────────────────────────────────┘│
│                                              │
│ ┌───────────────────────────────────────────┐│
│ │ License Key                               ││
│ │ ┌─────────────────────────────────┐       ││
│ │ │ RBXR-A2B3-C4D5-E6F7-G8H9       │ [Copy]││
│ │ └─────────────────────────────────┘       ││
│ └───────────────────────────────────────────┘│
│                                              │
│ ┌───────────────────────────────────────────┐│
│ │ Script Download                           ││
│ │ Version: 1.2.0                            ││
│ │ [⬇ Download Script]                       ││
│ └───────────────────────────────────────────┘│
│                                              │
│ ┌───────────────────────────────────────────┐│
│ │ Game Whitelist (2/3)                      ││
│ │ ┌─────────────────────────────────────┐   ││
│ │ │ 123456789 — My Roblox Game  [Remove]│   ││
│ │ │ 987654321 — Test Game       [Remove]│   ││
│ │ └─────────────────────────────────────┘   ││
│ │                                           ││
│ │ Add Game:                                 ││
│ │ Game ID: [____________]                   ││
│ │ Name:    [____________] (optional)        ││
│ │ [+ Add Game]                              ││
│ └───────────────────────────────────────────┘│
│                                              │
│ ┌───────────────────────────────────────────┐│
│ │ Recent Verifications                      ││
│ │ ✓ 123456789 — valid — 14 Mei 09:00       ││
│ │ ✓ 123456789 — valid — 13 Mei 21:00       ││
│ │ ✗ 555555555 — not whitelisted — 13 Mei   ││
│ └───────────────────────────────────────────┘│
│                                              │
│ ┌───────────────────────────────────────────┐│
│ │ ▶ Cara Integrasi di Roblox Studio        ││
│ │   (collapsible)                           ││
│ │   1. Download script                      ││
│ │   2. Paste di ServerScriptService         ││
│ │   3. Set LICENSE_KEY = "RBXR-..."         ││
│ │   4. Enable HttpService                   ││
│ │   5. Publish game                         ││
│ └───────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Edge Cases:**
- License not found → 404 page
- License suspended/revoked → show warning banner, disable download
- Max games reached → disable "Add Game" form, show "Upgrade tier untuk lebih banyak games"
- Game ID format invalid → client-side validation (harus numeric)
- Duplicate game ID → handle 409 error dari API
- Download gagal (file not found) → show error message
- Remove game → confirm dialog dulu

**UX Notes:**
- License key pakai monospace font besar, mudah dibaca dan copy
- Copy button → "Copied!" feedback
- Game whitelist show progress: "2/3 games" dengan progress bar
- Add game form inline (tidak perlu modal)
- Verification log show last 10 entries, sorted newest first
- Success verification → green checkmark, failed → red X
- Integration guide collapsible (default collapsed, supaya tidak overwhelming)
- Back button di atas untuk navigate ke list

---

### ✅ `/admin` — Admin Dashboard

**Priority:** P3  
**File:** `app/admin/page.tsx`  
**Auth:** Admin only (role = ADMIN)  
**Status:** Done (2026-05-15)

**Deskripsi:**  
Overview analytics untuk admin. Total products, licenses, revenue, recent purchases.

**API Calls:**
- `GET /admin/analytics` — overview stats + recent purchases

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `StatsGrid` | 4 stat cards: Products, Active Licenses, Purchases, Revenue |
| `StatCard` | Icon, label, value (big number) |
| `RecentPurchasesTable` | Table: user, product, amount, tier, date |
| `QuickLinks` | Links ke manage products, licenses, categories |

**State:**
```typescript
interface AdminDashboardState {
  analytics: {
    totalProducts: number
    totalActiveLicenses: number
    totalPurchases: number
    totalRevenue: number
  }
  recentPurchases: AdminPurchase[]
  loading: boolean
  error: string | null
}
```

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Admin Dashboard                              │
├─────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│ │  5   │ │  42  │ │  45  │ │2.25M │       │
│ │Produk│ │Licens│ │Purch.│ │Revenue│       │
│ └──────┘ └──────┘ └──────┘ └──────┘       │
│                                              │
│ Quick Actions                                │
│ [Manage Products] [Manage Licenses]          │
│ [Manage Categories]                          │
│                                              │
│ Recent Purchases                             │
│ ┌───────────────────────────────────────────┐│
│ │ User        │ Product     │ Amount │ Date ││
│ │ dev@rbx...  │ UI System   │ 50.000 │ 14/5││
│ │ user2@...   │ Game Kit    │150.000 │ 13/5││
│ └───────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Edge Cases:**
- Non-admin user akses → redirect ke / atau show 403
- Belum ada data → show zeros, empty table
- Revenue format → "Rp 2.250.000" (formatted)

**UX Notes:**
- Stat cards warna-warni (biru, hijau, ungu, orange)
- Revenue formatted dengan locale ID
- Recent purchases max 10 rows
- Table responsive (horizontal scroll di mobile)

---

### ✅ `/admin/products` — Product Management

**Priority:** P3  
**File:** `app/admin/products/page.tsx`  
**Auth:** Admin only  
**Status:** Done (2026-05-15)

**Deskripsi:**  
CRUD interface untuk manage products. List semua produk (termasuk inactive), create, edit, delete (soft).

**API Calls:**
- `GET /admin/products?page=1&limit=50` — list all products
- `DELETE /admin/products/{id}` — deactivate product
- `POST /admin/products` — create (di page /new)
- `PUT /admin/products/{id}` — update (di page /edit)

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `ProductTable` | Table: name, category, prices, status, actions |
| `StatusToggle` | Active/Inactive toggle |
| `ActionButtons` | Edit, Deactivate, Manage Files |
| `CreateButton` | "Tambah Produk" → navigate ke /admin/products/new |
| `Pagination` | Page navigation |
| `ConfirmDeleteModal` | Konfirmasi deactivate |

**State:**
```typescript
interface AdminProductsState {
  products: AdminProduct[]
  pagination: Pagination
  loading: boolean
  deleting: string | null
  error: string | null
}
```

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Product Management          [+ Tambah Produk]│
├─────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────┐│
│ │Name       │Category│Personal│Status│Action││
│ │UI System  │UI      │50.000  │Active│[E][D]││
│ │Game Kit   │Game    │75.000  │Active│[E][D]││
│ │Old Script │Util    │25.000  │Inact.│[E][A]││
│ └───────────────────────────────────────────┘│
│ [← Prev] [1] [Next →]                       │
└─────────────────────────────────────────────┘
```

**Edge Cases:**
- Deactivate product yang punya active licenses → show warning "X users punya license aktif"
- Reactivate product → toggle status back to active

**UX Notes:**
- Inactive products show dengan opacity rendah atau strikethrough
- Confirm dialog sebelum deactivate
- Quick search/filter di atas table (optional P3)

---

### ✅ `/admin/products/new` — Create Product

**Priority:** P3  
**File:** `app/admin/products/new/page.tsx`  
**Auth:** Admin only  
**Status:** Done (2026-05-15)

**Deskripsi:**  
Form untuk membuat produk baru.

**API Calls:**
- `GET /products/categories` — for category dropdown
- `POST /admin/products` — create product

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `ProductForm` | Reusable form (shared with edit page) |
| `SlugInput` | Auto-generate slug dari name, editable |
| `PricingInputs` | 3 price fields: Personal, Commercial, Enterprise |
| `CategorySelect` | Dropdown kategori |
| `TagsInput` | Comma-separated tags input |
| `ThumbnailUpload` | Image upload (optional, P3) |
| `SubmitButton` | "Simpan Produk" |

**State:**
```typescript
interface ProductFormState {
  name: string
  slug: string
  description: string
  shortDesc: string
  categoryId: string
  pricePersonal: number
  priceCommercial: number
  priceEnterprise: number
  featured: boolean
  version: string
  tags: string
  thumbnail: string
  submitting: boolean
  error: string | null
}
```

**Validation Rules:**
- name: required, min 3 chars
- slug: required, unique, lowercase, hyphens only
- description: required, min 20 chars
- pricePersonal: required, >= 0
- priceCommercial: >= pricePersonal
- priceEnterprise: >= priceCommercial

**Edge Cases:**
- Slug conflict (409) → show "Slug sudah dipakai"
- Auto-generate slug dari name (replace spaces with hyphens, lowercase)
- Form validation client-side sebelum submit
- Network error → show retry

**UX Notes:**
- Slug auto-generate tapi bisa di-edit manual
- Price inputs pakai format Rupiah (Rp prefix)
- Preview slug: "URL: /store/products/{slug}"
- After success → redirect ke /admin/products

---

### ✅ `/admin/products/[id]/edit` — Edit Product

**Priority:** P3  
**File:** `app/admin/products/[id]/edit/page.tsx`  
**Auth:** Admin only  
**Status:** Done (2026-05-15)

**Deskripsi:**  
Form edit produk (sama seperti create, tapi pre-filled). Juga bisa manage files di sini.

**API Calls:**
- `GET /products/{id}` — fetch current product data
- `PUT /admin/products/{id}` — update product
- `POST /admin/products/{id}/files` — add file
- `DELETE /admin/products/{productId}/files/{fileId}` — remove file

**Komponen:**
- Same as `/admin/products/new` (reuse `ProductForm`)
- Plus: `FileManagement` section (list files, add, remove)

**Edge Cases:**
- Product not found → 404
- Concurrent edit (someone else edited) → show stale data warning
- File upload → validate file type (script, documentation, asset)

---

### ✅ `/admin/categories` — Category Management

**Priority:** P3  
**File:** `app/admin/categories/page.tsx`  
**Auth:** Admin only  
**Status:** Done (2026-05-15)

**Deskripsi:**  
CRUD untuk product categories. Simple table + inline create/edit.

**API Calls:**
- `GET /products/categories` — list categories
- `POST /admin/categories` — create
- `PUT /admin/categories/{id}` — update
- `DELETE /admin/categories/{id}` — deactivate

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `CategoryTable` | Table: name, slug, description, product count, actions |
| `CategoryForm` | Inline form atau modal: name, slug, description, icon |
| `CreateButton` | "Tambah Kategori" |
| `EditModal` | Modal form untuk edit |
| `ConfirmDeleteModal` | Konfirmasi deactivate |

**State:**
```typescript
interface AdminCategoriesState {
  categories: Category[]
  loading: boolean
  editing: string | null
  creating: boolean
  error: string | null
}
```

**Edge Cases:**
- Delete category yang punya products → show warning
- Slug conflict → show error

**UX Notes:**
- Inline editing (klik row → jadi editable) atau modal
- Sort by sortOrder (drag-and-drop reorder, P3)
- Show product count per category

---

### ✅ `/admin/licenses` — License Management

**Priority:** P3  
**File:** `app/admin/licenses/page.tsx`  
**Auth:** Admin only  
**Status:** Done (2026-05-15)

**Deskripsi:**  
Manage semua licenses. Filter by status, user, product. Bisa suspend/revoke licenses.

**API Calls:**
- `GET /admin/licenses?page=1&limit=50&status=&userId=&productId=` — list licenses
- `PUT /admin/licenses/{id}/status` — update status (suspend, revoke, reactivate)

**Komponen:**
| Komponen | Deskripsi |
|----------|-----------|
| `LicenseTable` | Table: user, product, key, type, status, games, actions |
| `StatusFilter` | Filter: All, Active, Suspended, Revoked |
| `StatusUpdateModal` | Modal: select new status + reason |
| `Pagination` | Page navigation |

**State:**
```typescript
interface AdminLicensesState {
  licenses: AdminLicense[]
  pagination: Pagination
  filters: {
    status: string
    userId: string
    productId: string
  }
  loading: boolean
  updatingStatus: string | null
  error: string | null
}
```

**Edge Cases:**
- Revoke license → confirm dialog + require reason
- Reactivate suspended license → simple confirm
- Filter combination returns empty → "Tidak ada license ditemukan"

**UX Notes:**
- Status badge warna-warni
- Reason field required saat suspend/revoke
- Show user email + product name (bukan ID)
- License key masked di table, full key di modal/detail

---

## Shared Components yang Perlu Dibuat

| Komponen | Lokasi | Dipakai Di | Status |
|----------|--------|------------|--------|
| `Toast` | `components/ui/Toast.tsx` | Semua page (success/error notifications) | 🔨 |
| `Modal` | `components/ui/Modal.tsx` | Cart, Admin pages | 🔨 |
| `LoadingSkeleton` | `components/ui/LoadingSkeleton.tsx` | Semua page saat loading | ✅ |
| `EmptyState` | `components/ui/EmptyState.tsx` | History, Licenses, Cart | 🔨 |
| `Pagination` | `components/ui/Pagination.tsx` | Products, Admin tables | ✅ |
| `StatusBadge` | `components/ui/StatusBadge.tsx` | Licenses, Transactions | ✅ |
| `CopyButton` | `components/ui/CopyButton.tsx` | License keys | 🔨 |
| `PriceDisplay` | `components/ui/PriceDisplay.tsx` | Products, Cart, Checkout | 🔨 |
| `ConfirmDialog` | `components/ui/ConfirmDialog.tsx` | Delete/remove actions | ✅ |
| `Breadcrumb` | `components/ui/Breadcrumb.tsx` | Store, Admin | 🔨 |
| `ProductCard` | `components/store/ProductCard.tsx` | Store home, Product listing | 🔨 |
| `LicenseCard` | `components/dashboard/LicenseCard.tsx` | Licenses list | 🔨 |
| `TransactionItem` | `components/dashboard/TransactionItem.tsx` | Transaction history | 🔨 |
| `DashboardLayout` | `components/layout/DashboardLayout.tsx` | All /dashboard/* pages | 🔨 |
| `AdminNav` | `components/admin/AdminNav.tsx` | Admin sub-navigation pills | ✅ |

---

## Implementation Order (Recommended)

### Sprint 1 — Phase 1 Completion (Week 1-2)
1. 🔧 `/topup` enhance (status polling)
2. 🔨 `/dashboard` (merge profile)
3. 🔨 `/dashboard/transactions`
4. Shared: Toast, LoadingSkeleton, EmptyState, StatusBadge, DashboardLayout

### Sprint 2 — Store Core (Week 3-4)
5. 🔨 `/store` (homepage)
6. 🔨 `/store/products` (listing)
7. 🔨 `/store/products/[slug]` (detail)
8. Shared: ProductCard, Pagination, Breadcrumb, PriceDisplay

### Sprint 3 — Purchase Flow (Week 5-6)
9. 🔨 `/store/cart`
10. 🔨 `/store/checkout`
11. 🔨 `/store/checkout/success`
12. Shared: Modal, ConfirmDialog, CopyButton

### Sprint 4 — License Management (Week 7-8)
13. 🔨 `/dashboard/licenses`
14. 🔨 `/dashboard/licenses/[id]`
15. Shared: LicenseCard, TransactionItem

### Sprint 5 — Admin Panel (Week 9-10) ✅ DONE
16. ✅ `/admin` (dashboard)
17. ✅ `/admin/products` + `/admin/products/new` + `/admin/products/[id]/edit`
18. ✅ `/admin/categories`
19. ✅ `/admin/licenses`
20. ✅ Shared: AdminNav, StatusBadge, ConfirmDialog, Pagination, LoadingSkeleton

---

## Notes untuk Developer

### API Base URL
```
Development: http://localhost:3001
```
Semua API calls pakai `credentials: 'include'` untuk kirim session cookie.

### Auth Check
- Protected pages: cek `user` dari `useAuth()` context
- Kalau null → redirect ke `/login?redirect={currentPath}`
- Admin pages: cek `user.role === 'ADMIN'`
- Kalau bukan admin → redirect ke `/`

### State Management
- Auth state: React Context (`useAuth()`)
- Cart state: bisa React Context atau fetch on-demand dari API
- Lainnya: local state per page (useState/useReducer)

### Styling
- Tailwind CSS
- Responsive: mobile-first
- Consistent spacing: p-4, p-6, p-8
- Card style: `border rounded-lg p-6 shadow-sm`
- Button primary: `bg-blue-600 text-white hover:bg-blue-700`
- Button danger: `bg-red-600 text-white hover:bg-red-700`

### Error Handling Pattern
```typescript
try {
  setLoading(true)
  const data = await apiCall()
  setData(data)
} catch (err) {
  if (err.response?.status === 401) {
    // redirect to login
  } else {
    setError(err.response?.data?.error || 'Terjadi kesalahan')
  }
} finally {
  setLoading(false)
}
```

### Currency Formatting
```typescript
const formatRupiah = (amount: number) => {
  return `Rp ${amount.toLocaleString('id-ID')}`
}
```

---

*Document Created: 2026-05-14*  
*Last Updated: 2026-05-15*  
*Total Pages: 12 existing (6 original + 6 admin) + 9 remaining = 21 pages*  
*Estimated Remaining: 8 weeks (4 sprints)*
