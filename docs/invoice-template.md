# Invoice Template — RBX Royale

Digunakan untuk generate invoice setelah pembelian berhasil. Data diambil dari response checkout API.

---

## Template

```
═══════════════════════════════════════════════════════
                    INVOICE
              RBX Royale Community
═══════════════════════════════════════════════════════

Invoice ID    : INV-{purchaseId}
Date          : {purchasedAt}
Status        : PAID

───────────────────────────────────────────────────────
BUYER
───────────────────────────────────────────────────────
Name          : {user.displayName}
Email         : {user.email}
Account ID    : {user.id}

───────────────────────────────────────────────────────
ITEM
───────────────────────────────────────────────────────
Product       : {product.name}
License Type  : {licenseType}
License Key   : {licenseKey}
Max Games     : {maxGames || "Unlimited"}

───────────────────────────────────────────────────────
PAYMENT
───────────────────────────────────────────────────────
Subtotal      : Rp {amountRupiah}
Discount      : -
Total         : Rp {amountRupiah}
Method        : Wallet Balance (QRIS Top-Up)

───────────────────────────────────────────────────────
LICENSE DETAILS
───────────────────────────────────────────────────────
License Key   : {licenseKey}
Type          : {licenseType}
Status        : ACTIVE
Valid For     : Lifetime (no expiry)
Max Games     : {maxGames || "Unlimited"}

Whitelist your game at:
https://audio.muhwldns.me/dashboard/licenses/{licenseId}

───────────────────────────────────────────────────────
INSTALLATION
───────────────────────────────────────────────────────
1. Download .rbxm from your dashboard
2. Import to Roblox Studio (drag into Explorer)
3. Open the main script
4. Find "PASTE_YOUR_KEY_HERE"
5. Replace with: {licenseKey}
6. Enable HttpService (Game Settings → Security)
7. Whitelist your game ID at dashboard
8. Publish and test

───────────────────────────────────────────────────────
SUPPORT
───────────────────────────────────────────────────────
Dashboard     : https://audio.muhwldns.me/dashboard
Store         : https://audio.muhwldns.me/store
Email         : support@muhwldns.me

═══════════════════════════════════════════════════════
          Thank you for your purchase!
         RBX Royale — Scripts & Audio Tools
═══════════════════════════════════════════════════════
```

---

## Penggunaan

Invoice ini bisa di-generate di:
1. **Email** — Dikirim via Resend setelah purchase (sudah ada di `emailService.js`)
2. **Dashboard** — Halaman `/dashboard/licenses/{id}` bisa tampilkan invoice
3. **PDF** — Nanti bisa generate PDF dari template ini (future enhancement)

---

## Data Source

Semua field diambil dari response `POST /checkout`:

```json
{
  "purchases": [{ "id", "productId", "licenseType", "amountRupiah" }],
  "licenses": [{ "id", "productId", "licenseKey", "licenseType", "maxGames" }],
  "totalCharged": 25000,
  "newBalance": 75000
}
```

Ditambah data user dari session (`/auth/me`).
