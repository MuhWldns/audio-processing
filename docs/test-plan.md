# Test Plan — RBX Royale Platform

> Dokumen ini berisi test plan, test cases, dan test scenarios untuk seluruh sistem RBX Royale.
> Terakhir diperbarui: 21 Mei 2026

---

## 1. Scope

### Sistem yang Ditest
- Backend API (Express.js)
- Frontend (Next.js)
- License Verification System (Roblox integration)
- Payment Flow (Bayar.gg QRIS)
- Storage (Backblaze B2)
- Email (Resend)

### Jenis Testing
| Jenis | Tool | Coverage |
|-------|------|----------|
| Unit Test | Vitest + Supertest | Backend controllers/services |
| Integration Test | Vitest + real DB | End-to-end API flows |
| Manual Test | Browser + Roblox Studio | Frontend UX + Roblox runtime |
| Security Test | Manual + automated | Auth bypass, injection, race conditions |

---

## 2. Test Environment

| Component | Dev | Staging | Production |
|-----------|-----|---------|------------|
| Backend | localhost:3001 | api-rbx.muhwldns.me | api-rbx.muhwldns.me |
| Frontend | localhost:5174 | audio.muhwldns.me | audio.muhwldns.me |
| Database | MySQL localhost:3306 | MySQL Docker VPS | MySQL Docker VPS |
| Payment | Bayar.gg sandbox | Bayar.gg production | Bayar.gg production |
| Roblox | Studio (Play mode) | Published game | Published game |

---

## 3. Test Cases — Authentication

### TC-AUTH-001: Google OAuth Login
**Precondition:** User belum login
**Steps:**
1. Buka /login
2. Klik "Continue with Google"
3. Approve di Google consent screen
4. Redirect kembali ke platform
**Expected:** User logged in, /auth/me return user data, cookie connect.sid ter-set dengan domain .muhwldns.me

### TC-AUTH-002: Discord OAuth Login
**Precondition:** User belum login
**Steps:**
1. Buka /login
2. Klik "Continue with Discord"
3. Approve di Discord consent screen
4. Redirect kembali ke platform
**Expected:** User logged in, session active

### TC-AUTH-003: Session Persistence
**Precondition:** User sudah login
**Steps:**
1. Refresh halaman
2. Navigasi ke halaman lain
3. Tutup browser, buka lagi
**Expected:** Session tetap aktif (cookie maxAge belum expired)

### TC-AUTH-004: Logout
**Precondition:** User sudah login
**Steps:**
1. Klik Logout
2. Coba akses /dashboard
**Expected:** Redirect ke /login, /auth/me return { user: null }

### TC-AUTH-005: Protected Route tanpa Login
**Precondition:** User belum login
**Steps:**
1. Akses /dashboard langsung
2. Akses /topup langsung
3. Akses /admin langsung
**Expected:** Semua redirect ke /login?redirect={path}

### TC-AUTH-006: Admin Route dengan User Biasa
**Precondition:** User login dengan role USER
**Steps:**
1. Akses /admin
2. Hit GET /admin/users via API
**Expected:** Frontend show "Access Denied", API return 403

---

## 4. Test Cases — Top-Up (Payment)

### TC-TOPUP-001: Create Top-Up (Happy Path)
**Precondition:** User login, wallet balance = 0
**Steps:**
1. Buka /topup
2. Input amount: 50000
3. Klik "Lanjut ke QRIS"
**Expected:** QR code muncul, orderId ter-generate, status PENDING

### TC-TOPUP-002: Amount Validation
**Steps:**
1. Input amount: 500 (below min)
2. Input amount: 600000 (above max)
3. Input amount: "abc" (non-numeric)
**Expected:** Error message untuk setiap case, tidak bisa submit

### TC-TOPUP-003: Payment Webhook (Bayar.gg)
**Precondition:** Order PENDING exists
**Steps:**
1. Simulate webhook POST /webhooks/bayar dengan signature valid
2. Body: { invoice_id, status: "paid", final_amount }
**Expected:** Order → COMPLETED, walletBalance += amount, WalletTransaction created, email sent

### TC-TOPUP-004: Webhook Idempotency
**Steps:**
1. Kirim webhook yang sama 2x
**Expected:** Pertama: process + credit. Kedua: return { ok: true, alreadyProcessed: true }, balance tidak double

### TC-TOPUP-005: Webhook Invalid Signature
**Steps:**
1. Kirim webhook dengan signature salah
**Expected:** Return 401, order tetap PENDING

### TC-TOPUP-006: Polling Status
**Precondition:** Order PENDING
**Steps:**
1. GET /topup/status/{orderId}
**Expected:** { paid: false, status: "PENDING" }
2. Setelah webhook paid:
**Expected:** { paid: true, status: "COMPLETED" }

### TC-TOPUP-007: Frontend Polling Auto-Detect
**Precondition:** QR displayed, payment completed via external
**Steps:**
1. Tunggu polling interval (3 detik)
**Expected:** Frontend auto-detect paid, show success page, refresh balance

---

## 5. Test Cases — Store & Checkout

### TC-STORE-001: Browse Products
**Steps:**
1. Buka /store
2. Klik product
3. Filter by category
4. Search by keyword
**Expected:** Products displayed, filter/search works, pagination correct

### TC-CART-001: Add to Cart
**Precondition:** User login
**Steps:**
1. Pilih product, pilih tier PERSONAL
2. Klik "Add to Cart"
**Expected:** Item added, cart count updated

### TC-CART-002: Add Duplicate Product
**Steps:**
1. Add product yang sudah ada di cart
**Expected:** Update license type (bukan duplicate entry)

### TC-CART-003: Add Product Already Licensed
**Precondition:** User sudah punya ACTIVE license untuk product
**Steps:**
1. Add product ke cart
**Expected:** Error 409 "You already own a license for this product"

### TC-CHECKOUT-001: Successful Checkout
**Precondition:** Cart has items, balance sufficient
**Steps:**
1. Buka /store/checkout
2. Klik "Konfirmasi Pembelian"
**Expected:** 
- Balance deducted
- License key generated (RBXR-XXXX-XXXX-XXXX-XXXX)
- Purchase record created
- Cart cleared
- Email sent
- Redirect to success page with license keys

### TC-CHECKOUT-002: Insufficient Balance
**Precondition:** Cart total > wallet balance
**Steps:**
1. Buka /store/checkout
**Expected:** Button disabled, shows deficit amount, link to /topup

### TC-CHECKOUT-003: Race Condition (Concurrent Checkout)
**Steps:**
1. Kirim 2 POST /checkout bersamaan
**Expected:** Hanya 1 yang berhasil, yang lain return 402 (balance check inside transaction)

### TC-CHECKOUT-004: Cart with Inactive Product
**Precondition:** Product di-deactivate setelah ditambah ke cart
**Steps:**
1. Buka /store/checkout
**Expected:** Inactive product filtered out, only active items processed

---

## 6. Test Cases — License Management

### TC-LICENSE-001: View Licenses
**Precondition:** User punya 1+ license
**Steps:**
1. Buka /dashboard/licenses
**Expected:** List licenses with product info, status, game count

### TC-LICENSE-002: Whitelist Game (Happy Path)
**Precondition:** User punya robloxUserId set, license ACTIVE, game owned by user
**Steps:**
1. Buka license detail
2. Input Place ID game milik sendiri
3. Klik "Add Game"
**Expected:** Game added to whitelist, creator metadata saved (universeId, creatorId, creatorType, verifiedAt)

### TC-LICENSE-003: Whitelist Game tanpa Roblox ID
**Precondition:** User belum set robloxUserId
**Steps:**
1. Coba whitelist game
**Expected:** Error "Please set your Roblox User ID in profile first"

### TC-LICENSE-004: Whitelist Game Bukan Milik User
**Precondition:** User set robloxUserId = 111, game owned by user 222
**Steps:**
1. Input Place ID game milik orang lain
**Expected:** Error "Ownership verification failed" dengan reason "owner_mismatch"

### TC-LICENSE-005: Whitelist Group Game (Owner)
**Precondition:** User adalah owner group yang memiliki game
**Steps:**
1. Input Place ID game milik group
**Expected:** Success — server resolve group → check owner → match

### TC-LICENSE-006: Whitelist Group Game (Non-Owner)
**Precondition:** User adalah member (bukan owner) group
**Steps:**
1. Input Place ID game milik group
**Expected:** Error "not_group_owner"

### TC-LICENSE-007: Max Games Reached
**Precondition:** PERSONAL license, sudah 3 games whitelisted
**Steps:**
1. Coba add game ke-4
**Expected:** Error 403 "Maximum games reached for this license tier"

### TC-LICENSE-008: Download Script
**Precondition:** License ACTIVE, product has script file di B2
**Steps:**
1. Klik "Download Script"
**Expected:** Browser download .lua file via presigned URL redirect

### TC-LICENSE-009: Download Script (Suspended License)
**Precondition:** License SUSPENDED
**Steps:**
1. Coba download
**Expected:** Error 404 "License not found or inactive"

---

## 7. Test Cases — License Verification (Roblox Runtime)

### TC-VERIFY-001: Handshake (Valid License + Whitelisted Game)
**Precondition:** License ACTIVE, game whitelisted, creatorId match
**Steps:**
1. POST /api/license/handshake { licenseKey, gameId, creatorId, creatorType }
**Expected:** { valid: true, sessionToken, signKey, expiresIn: 300, product, license }

### TC-VERIFY-002: Handshake (Invalid Key)
**Steps:**
1. POST /api/license/handshake { licenseKey: "FAKE-KEY", gameId: "123" }
**Expected:** { valid: false, reason: "invalid_key" }

### TC-VERIFY-003: Handshake (Game Not Whitelisted)
**Precondition:** License valid, tapi gameId tidak di whitelist
**Steps:**
1. POST /api/license/handshake { licenseKey: valid, gameId: "999999" }
**Expected:** { valid: false, reason: "not_whitelisted" }

### TC-VERIFY-004: Handshake (Creator Mismatch)
**Precondition:** Game whitelisted dengan creatorId "111", tapi request kirim creatorId "222"
**Steps:**
1. POST /api/license/handshake { ..., creatorId: "222" }
**Expected:** { valid: false, reason: "creator_mismatch" }

### TC-VERIFY-005: Handshake (Suspended License)
**Precondition:** License status = SUSPENDED
**Steps:**
1. POST /api/license/handshake { licenseKey: suspended }
**Expected:** { valid: false, reason: "license_suspended" }

### TC-VERIFY-006: Heartbeat (Valid)
**Precondition:** Handshake berhasil, punya sessionToken
**Steps:**
1. POST /api/license/heartbeat { licenseKey, gameId, sessionToken, creatorId }
**Expected:** { valid: true, signKey: rotated, expiresIn: 300 }

### TC-VERIFY-007: Heartbeat (Invalid Session Token)
**Steps:**
1. POST /api/license/heartbeat { ..., sessionToken: "wrong" }
**Expected:** { valid: false, reason: "invalid_session" }

### TC-VERIFY-008: Heartbeat Grace Fail
**Precondition:** Backend down / network issue
**Steps:**
1. Heartbeat fail #1 (menit 0)
2. Heartbeat fail #2 (menit 10)
3. Heartbeat fail #3 (menit 20)
4. Heartbeat fail #4 (menit 30)
**Expected:** Fail 1-3: game tetap jalan (grace). Fail 4: runtime set inactive, enforcement trigger

### TC-VERIFY-009: Enforce Phase Escalation
**Precondition:** License invalid, enforcement triggered
**Steps:**
1. POST /api/license/enforce { phase: 1 }
2. Decrypt payload, execute
3. Wait nextDelay, request phase 2
4. ... sampai phase 5
**Expected:** 
- Phase 1: invisible parts spawn
- Phase 2: random GUI notifications
- Phase 3: heavier + more frequent
- Phase 4: full screen overlay + sound
- Phase 5: mass spawn + kick players

### TC-VERIFY-010: SignKey Rotation
**Steps:**
1. Handshake → get signKey A
2. Wait 5+ minutes
3. Heartbeat → get signKey B
**Expected:** signKey A ≠ signKey B (time-bucketed rotation)

---

## 8. Test Cases — Roblox Owner Verification

### TC-ROBLOX-001: Set Roblox User ID (Valid)
**Steps:**
1. PUT /user/roblox-id { robloxUserId: "123456789" }
**Expected:** Roblox API validates user exists, saved, returns username

### TC-ROBLOX-002: Set Roblox User ID (Invalid)
**Steps:**
1. PUT /user/roblox-id { robloxUserId: "999999999999" } (non-existent)
**Expected:** Error 404 "Roblox User ID not found"

### TC-ROBLOX-003: Set Roblox User ID (Non-Numeric)
**Steps:**
1. PUT /user/roblox-id { robloxUserId: "abc" }
**Expected:** Error 400 "Roblox User ID must be numeric"

### TC-ROBLOX-004: Ownership Resolve Chain
**Steps:**
1. Input placeId yang valid
2. Server resolve: placeId → universeId → creator
**Expected:** Correct universeId, creatorId, creatorType returned

### TC-ROBLOX-005: Roblox API Cache
**Steps:**
1. Whitelist game A (triggers Roblox API call)
2. Whitelist game A lagi (within 10 min)
**Expected:** Second call uses cache, no Roblox API hit

### TC-ROBLOX-006: Roblox API Down
**Steps:**
1. Simulate Roblox API timeout/500
**Expected:** Error "api_error" returned to user, whitelist not created

---

## 9. Test Cases — Admin

### TC-ADMIN-001: Kill Switch
**Precondition:** License ACTIVE, game running
**Steps:**
1. Admin buka /admin/enforcement
2. Klik "Kill" pada license
3. Input reason
4. Confirm
**Expected:** License → SUSPENDED, next heartbeat dari game → enforcement trigger

### TC-ADMIN-002: Adjust Balance
**Precondition:** User balance = 50000
**Steps:**
1. Admin buka /admin/users
2. Klik "Adjust" pada user
3. Input amount: 25000, reason: "Bonus"
**Expected:** Balance → 75000, WalletTransaction created, ActivityLog created

### TC-ADMIN-003: Adjust Balance (Negative, Would Go Below Zero)
**Precondition:** User balance = 10000
**Steps:**
1. Adjust amount: -20000
**Expected:** Error "Adjustment would result in negative balance"

### TC-ADMIN-004: Promote User to Admin
**Steps:**
1. Admin klik "Promote" pada user biasa
2. Confirm dialog
**Expected:** User role → ADMIN, ActivityLog created

### TC-ADMIN-005: Cannot Demote Self
**Steps:**
1. Admin coba demote diri sendiri
**Expected:** Error 403 "Cannot demote yourself"

### TC-ADMIN-006: View Active Sessions
**Steps:**
1. Buka /admin/enforcement
**Expected:** Shows licenses verified within last 5 minutes, auto-refresh 30s

### TC-ADMIN-007: View Verification Logs
**Steps:**
1. Klik "Logs" pada license di enforcement dashboard
**Expected:** Modal shows recent verification attempts (time, gameId, IP, success/fail, reason)

---

## 10. Test Cases — Audio Processing

### TC-AUDIO-001: Upload Audio (Free Quota)
**Precondition:** User login, freeAudioUsedToday < 3
**Steps:**
1. Process audio di /audio/studio
2. Export → upload triggered (background)
**Expected:** Upload success, freeAudioUsedToday += 1, no charge

### TC-AUDIO-002: Upload Audio (Paid, Sufficient Balance)
**Precondition:** freeAudioUsedToday = 3, walletBalance >= 2000
**Steps:**
1. Export audio
**Expected:** Upload success, walletBalance -= 2000, WalletTransaction created

### TC-AUDIO-003: Upload Audio (Paid, Insufficient Balance)
**Precondition:** freeAudioUsedToday = 3, walletBalance = 0
**Steps:**
1. Export audio
**Expected:** Upload fails silently (402), file not saved, no charge

### TC-AUDIO-004: Download from History
**Precondition:** User has upload history
**Steps:**
1. Buka /audio/history
2. Klik download pada item
**Expected:** File downloaded, path traversal protected

---

## 11. Test Cases — Security

### TC-SEC-001: CORS Validation
**Steps:**
1. Fetch API dari domain yang bukan CORS_ORIGIN
**Expected:** Request blocked by CORS

### TC-SEC-002: Rate Limiting
**Steps:**
1. Spam POST /topup/create > 5x dalam 1 menit
**Expected:** Return 429 setelah limit tercapai

### TC-SEC-003: Path Traversal (History Download)
**Steps:**
1. Manipulate storedFileName di DB ke "../../etc/passwd"
2. GET /history/:id/download
**Expected:** Error 400 "Invalid file path" (path resolved + validated)

### TC-SEC-004: Webhook Signature Bypass
**Steps:**
1. POST /webhooks/bayar tanpa signature header
2. POST dengan signature salah
**Expected:** 401 untuk keduanya

### TC-SEC-005: Admin File Upload (Path Traversal)
**Steps:**
1. Upload file dengan nama "../../../etc/malicious"
**Expected:** Rejected — extension validation + B2 key sanitization

### TC-SEC-006: Checkout Race Condition
**Steps:**
1. 2 concurrent POST /checkout dengan balance pas-pasan
**Expected:** Hanya 1 berhasil (atomic balance check inside transaction)

### TC-SEC-007: Session Fixation
**Steps:**
1. Gunakan session cookie dari user lain
**Expected:** /auth/me return user yang sesuai cookie (atau null jika invalid)

### TC-SEC-008: License Key Brute Force
**Steps:**
1. Spam POST /api/verify-license dengan random keys
**Expected:** Rate limited (30/min), semua return { valid: false }

---

## 12. Test Cases — Email

### TC-EMAIL-001: Top-Up Success Email
**Precondition:** User has email, webhook confirms payment
**Steps:**
1. Payment webhook processed
**Expected:** Email sent with amount, new balance, violet theme

### TC-EMAIL-002: Purchase Success Email
**Precondition:** User has email, checkout success
**Steps:**
1. Checkout completes
**Expected:** Email sent with license keys, product names, next steps

### TC-EMAIL-003: No Email (User tanpa email)
**Precondition:** User login via Discord tanpa email
**Steps:**
1. Complete topup/checkout
**Expected:** Email skipped silently, no error, main flow unaffected

---

## 13. Test Cases — Storage (B2)

### TC-B2-001: Admin Upload File
**Steps:**
1. Admin upload .lua file via /admin/products/:id/files
**Expected:** File uploaded to B2, ProductFile record created with B2 key

### TC-B2-002: License Download (Presigned URL)
**Steps:**
1. User download script via /licenses/:id/download
**Expected:** 302 redirect to presigned B2 URL (5 min expiry)

### TC-B2-003: File Extension Validation
**Steps:**
1. Upload .exe file
2. Upload .lua file
**Expected:** .exe rejected, .lua accepted

### TC-B2-004: File Size Limit
**Steps:**
1. Upload file > 10MB
**Expected:** Rejected with error

---

## 14. Test Priority Matrix

| Priority | Category | Test Cases |
|----------|----------|------------|
| P0 (Critical) | Auth, Checkout, Payment Webhook | TC-AUTH-001/002, TC-CHECKOUT-001/003, TC-TOPUP-003/004 |
| P1 (High) | License Verify, Whitelist, Admin Kill | TC-VERIFY-001/002/003/008, TC-LICENSE-002/004, TC-ADMIN-001 |
| P2 (Medium) | Store, Cart, Audio, Email | TC-STORE-001, TC-CART-001, TC-AUDIO-001/002, TC-EMAIL-001 |
| P3 (Low) | Edge cases, UI polish | TC-SEC-*, TC-B2-003/004, TC-ROBLOX-005/006 |

---

## 15. Acceptance Criteria

### Release Readiness
- [ ] Semua P0 test cases PASS
- [ ] Semua P1 test cases PASS
- [ ] P2 test cases: 90%+ PASS
- [ ] No known security vulnerabilities (P0/P1)
- [ ] Backend unit tests: 57+ pass
- [ ] Frontend build: clean (no errors)
- [ ] Production deploy: health check OK
- [ ] Backup cron: verified working

---

*Dokumen ini adalah living document. Update setiap kali ada fitur baru atau bug ditemukan.*
