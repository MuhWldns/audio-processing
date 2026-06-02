# Frontend E2E Test Scenarios

> Test scenarios untuk frontend RBX Royale. Dapat dijalankan manual atau diautomasi dengan Playwright/Cypress.
> Terakhir diperbarui: 22 Mei 2026

---

## Setup

### Prerequisites
- Backend running (`api-rbx.muhwldns.me` atau `localhost:3001`)
- Frontend running (`localhost:5174`)
- Database seeded dengan test data (user, products, licenses)
- Test user accounts:
  - Regular user: `test@example.com` (via dev-login)
  - Admin user: `admin@example.com` (role: ADMIN)

### Test Data Seeding
```bash
# Via dev-login endpoint (development only)
curl -X POST http://localhost:3001/auth/dev-login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email": "test@example.com", "displayName": "Test User"}'
```

---

## Scenario 1: New User Onboarding

### S1.1: First Login
```
Given: User belum pernah login
When: User klik "Login" → pilih Google/Discord → approve
Then:
  - Redirect ke homepage
  - Header menampilkan nama + avatar
  - Wallet balance = Rp 0
  - robloxUserId = null
```

### S1.2: Set Roblox User ID
```
Given: User sudah login, robloxUserId belum di-set
When: User buka /profile → input Roblox ID → klik Save
Then:
  - Loading state "Verifying..."
  - Success toast "Roblox User ID berhasil disimpan!"
  - Menampilkan "Verified: DisplayName (@username)"
  - Badge hijau "Roblox ID tersambung: {id}"
```

### S1.3: Set Roblox User ID (Invalid)
```
Given: User input ID yang tidak ada di Roblox
When: Klik Save
Then:
  - Error toast "Roblox User ID not found"
  - Input tidak ter-clear (user bisa koreksi)
```

---

## Scenario 2: Top-Up Flow

### S2.1: Top-Up Happy Path
```
Given: User login, balance = 0
When:
  1. Buka /topup
  2. Input amount 50000 (atau klik quick-select "50k")
  3. Klik "Lanjut ke QRIS"
Then:
  - Step berubah ke "processing" (spinner)
  - QR code muncul (dari qrisImageUrl)
  - Countdown timer aktif
  - Status "Menunggu pembayaran"
  
When: Payment completed (webhook received)
Then:
  - Polling detect "paid"
  - Step berubah ke "success"
  - Menampilkan amount + new balance
  - Header wallet balance updated
```

### S2.2: Top-Up Amount Validation
```
Given: User di halaman /topup
When: Input amount 500
Then: Error "Minimal top up Rp 1.000"

When: Input amount 600000
Then: Error "Maksimal QRIS Rp 500.000"

When: Input "abc"
Then: Input hanya terima angka (filtered)
```

### S2.3: Top-Up Timeout
```
Given: QR displayed, user tidak bayar
When: 5 menit berlalu (polling timeout)
Then:
  - Step berubah ke "timeout"
  - Pesan "Belum Terbayar"
  - Tombol "Cek Lagi" dan "Buat Baru"
```

---

## Scenario 3: Store & Purchase Flow

### S3.1: Browse Store
```
Given: Products exist in database
When: User buka /store
Then:
  - Featured products displayed
  - Categories displayed
  - Newest additions displayed
  - Klik product → navigate ke /store/products/{slug}
```

### S3.2: Product Detail
```
Given: Product exists
When: User buka /store/products/{slug}
Then:
  - Product name, description, images
  - 3 pricing tiers (Personal/Commercial/Enterprise)
  - "Add to Cart" button
  - Sold count
```

### S3.3: Add to Cart
```
Given: User login, product active
When: Pilih tier "PERSONAL" → klik "Add to Cart"
Then:
  - Toast "Added to cart"
  - Cart count di header updated (jika ada)
  - Navigate ke /store/cart atau stay
```

### S3.4: Checkout Success
```
Given: Cart has 1 item (25000), balance = 100000
When: Buka /store/checkout → klik "Konfirmasi Pembelian"
Then:
  - Loading state
  - Redirect ke /store/checkout/success
  - License key displayed (RBXR-XXXX-XXXX-XXXX-XXXX)
  - Copy button works
  - Balance updated (75000)
  - "View Invoice" button available
  - Next steps instructions shown
```

### S3.5: Checkout Insufficient Balance
```
Given: Cart total = 50000, balance = 10000
When: Buka /store/checkout
Then:
  - Shows deficit: "Kurang Rp 40.000"
  - Button disabled
  - Link "Top Up Sekarang" visible
```

### S3.6: View Invoice
```
Given: Checkout success page with result
When: Klik "View Invoice"
Then:
  - Modal overlay muncul (white theme)
  - Invoice ID, date, PAID badge
  - Buyer info, items, license keys
  - Total + payment method
  - "Print / Save PDF" button
  - "Close" button
```

---

## Scenario 4: License Management

### S4.1: View Licenses
```
Given: User punya 2 licenses
When: Buka /dashboard/licenses
Then:
  - 2 license cards displayed
  - Each shows: product name, type, status badge, game count
  - Klik card → navigate ke detail
```

### S4.2: Whitelist Game (Happy Path)
```
Given: License ACTIVE, robloxUserId set, game owned by user
When:
  1. Buka license detail
  2. Input Place ID: "123456789"
  3. Klik "Add Game"
Then:
  - Loading state
  - Game added to list with name (from Roblox API)
  - Progress bar updated (e.g., "2/3 games")
```

### S4.3: Whitelist Game (Not Owner)
```
Given: User input Place ID game milik orang lain
When: Klik "Add Game"
Then:
  - Error: "Ownership verification failed"
  - Detail: "Game owned by user X, but your Roblox ID is Y"
```

### S4.4: Whitelist Game (No Roblox ID)
```
Given: User belum set robloxUserId
When: Coba add game
Then:
  - Error: "Please set your Roblox User ID in profile first"
  - Link ke /profile
```

### S4.5: Remove Game from Whitelist
```
Given: License has 2 whitelisted games
When: Klik "Remove" pada game → confirm dialog → "Hapus"
Then:
  - Game removed from list
  - Progress bar updated
```

### S4.6: Download Script
```
Given: License ACTIVE, product has script file
When: Klik "Download Script"
Then:
  - File downloaded as .lua
  - Filename: {slug}-v{version}.lua
```

### S4.7: Copy License Key
```
Given: License detail page
When: Klik "Copy" button next to license key
Then:
  - Key copied to clipboard
  - Button text changes to "Copied!" for 2 seconds
```

---

## Scenario 5: Dashboard

### S5.1: Wallet Page
```
Given: User login, balance = 75000
When: Buka /dashboard/wallet
Then:
  - Balance card: "Rp 75.000" (large)
  - Stats: total top-up, total spent, free audio today
  - Recent 5 transactions
  - "Top Up Sekarang" button
  - "Lihat semua" link → /dashboard/transactions
```

### S5.2: Transaction History
```
Given: User has 10+ transactions
When: Buka /dashboard/transactions
Then:
  - List transactions (newest first)
  - Each: type badge, description, amount (+/-), balance after, date
  - Filter buttons: Semua, Top Up, Pembelian, Audio, Refund, Adjustment
  - Pagination works
```

### S5.3: Transaction Filter
```
Given: User has mixed transactions
When: Klik filter "Top Up"
Then:
  - Only TOP_UP transactions shown
  - Pagination resets to page 1
```

---

## Scenario 6: Admin Panel

### S6.1: Admin Access Control
```
Given: User with role USER
When: Navigate ke /admin
Then: "Access Denied" message

Given: User with role ADMIN
When: Navigate ke /admin
Then: Admin dashboard with analytics
```

### S6.2: Admin Create Product
```
Given: Admin login
When:
  1. Buka /admin/products
  2. Klik "New Product"
  3. Fill form (name, slug, description, prices)
  4. Submit
Then:
  - Product created
  - Redirect ke product list
  - New product visible
```

### S6.3: Admin Upload Script File
```
Given: Product exists
When:
  1. Buka /admin/products/{id}/edit
  2. Scroll ke "Tambah File"
  3. Select .lua file
  4. Choose type "Script"
  5. Klik "Upload File"
Then:
  - File uploaded to B2
  - File record appears in list
  - Shows filename + size
```

### S6.4: Admin Kill Switch
```
Given: License ACTIVE, game running (visible in enforcement dashboard)
When:
  1. Buka /admin/enforcement
  2. Find license in active sessions
  3. Klik "Kill"
  4. Input reason: "Abuse detected"
  5. Confirm
Then:
  - License status → SUSPENDED
  - Removed from active sessions list
  - Next game heartbeat → enforcement triggers
```

### S6.5: Admin Adjust Balance
```
Given: User with balance 50000
When:
  1. Buka /admin/users
  2. Find user
  3. Klik "Adjust"
  4. Input amount: 25000, reason: "Refund"
  5. Confirm
Then:
  - Balance → 75000
  - Transaction logged
  - Activity logged
```

### S6.6: Admin Promote User
```
Given: User with role USER
When:
  1. Buka /admin/users
  2. Klik "Promote" on user
  3. Confirm dialog
Then:
  - User role → ADMIN
  - Badge changes to "ADMIN"
```

### S6.7: Admin View Verification Logs
```
Given: License has verification history
When:
  1. Buka /admin/enforcement
  2. Klik "Logs" on a license
Then:
  - Modal shows log entries
  - Each: timestamp, game ID, IP, success/fail badge, reason
```

---

## Scenario 7: Audio Processing

### S7.1: Process and Export Audio
```
Given: User login, free quota available
When:
  1. Buka /audio/studio
  2. Upload audio file (drag or click)
  3. Adjust controls (gain, EQ, reverb)
  4. Klik "Play preview"
  5. Select format "WAV"
  6. Klik "Export"
Then:
  - File downloaded locally
  - Background upload to server (silent)
  - Export message: "Export complete. File saved locally."
  - If upload success: message updates with cost info
```

### S7.2: Audio History
```
Given: User has previous uploads
When: Buka /audio/history
Then:
  - List of previous uploads
  - Each: filename, format, date, status
  - "Download again" button per item
```

---

## Scenario 8: Error States & Edge Cases

### S8.1: Network Error
```
Given: Backend unreachable
When: User tries any API action
Then:
  - Error message displayed (toast or inline)
  - No crash, UI remains functional
  - User can retry
```

### S8.2: Session Expired
```
Given: User was logged in, session expired
When: User tries protected action
Then:
  - API returns 401
  - User state cleared
  - Redirect to /login
```

### S8.3: 404 Page
```
Given: User navigates to non-existent route
When: /some/random/path
Then:
  - Custom 404 page displayed
  - Links to home + store
```

### S8.4: Error Boundary
```
Given: Component throws runtime error
When: Error occurs during render
Then:
  - Error boundary catches
  - "Something went wrong" message
  - "Try Again" button (reset)
  - "Back to Home" link
```

---

## Scenario 9: Responsive / Mobile

### S9.1: Mobile Navigation
```
Given: Screen width < 768px
When: User opens site
Then:
  - Hamburger menu visible
  - Desktop nav hidden
  - Klik hamburger → mobile menu slides in
  - Nav links + user info visible
  - Klik link → menu closes
```

### S9.2: Mobile Store
```
Given: Mobile viewport
When: Browse /store/products
Then:
  - Products stack vertically (1 column)
  - Filters wrap properly
  - Search input full width
```

---

## Automation Notes (Playwright)

### Recommended Setup
```typescript
// playwright.config.ts
export default {
  baseURL: 'http://localhost:5174',
  use: {
    storageState: 'tests/.auth/user.json', // pre-authenticated state
  },
};
```

### Auth Helper
```typescript
// tests/helpers/auth.ts
async function loginAsUser(page) {
  // Use dev-login endpoint to get session
  const response = await page.request.post('http://localhost:3001/auth/dev-login', {
    data: { email: 'test@example.com', displayName: 'Test User' }
  });
  // Extract cookies and set in browser context
}
```

### Key Selectors
```typescript
// Common selectors for test automation
const selectors = {
  loginButton: 'a[href="/login"]',
  logoutButton: 'button:has-text("Logout")',
  walletBalance: '[data-testid="wallet-balance"]', // add data-testid to components
  toastMessage: '.toast-item',
  loadingSkeleton: '.animate-pulse',
};
```

---

## Test Data Requirements

| Entity | Count | Notes |
|--------|-------|-------|
| Users | 3 | 1 admin, 1 regular with robloxId, 1 regular without |
| Products | 3 | 1 featured, 1 regular, 1 inactive |
| Categories | 2 | With products assigned |
| Licenses | 2 | 1 ACTIVE (with whitelist), 1 SUSPENDED |
| Purchases | 2 | Matching licenses |
| TopUpOrders | 2 | 1 COMPLETED, 1 PENDING |
| WalletTransactions | 5 | Mix of TOP_UP, PURCHASE, AUDIO_CHARGE |

---

*Dokumen ini adalah panduan untuk QA team dan automation engineers.*
