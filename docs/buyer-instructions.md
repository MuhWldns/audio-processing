# Buyer Instructions — Cara Install Script

## Setelah Pembelian

Selamat! Kamu telah membeli script dari RBX Royale. Berikut cara install ke game Roblox kamu.

---

## Step 1: Dapatkan License Key

License key kamu bisa dilihat di:
- Email konfirmasi pembelian
- Dashboard: https://audio.muhwldns.me/dashboard/licenses

Format: `RBXR-XXXX-XXXX-XXXX-XXXX`

---

## Step 2: Download File

1. Buka dashboard → My Licenses
2. Klik license yang baru dibeli
3. Klik "Download" untuk mendapatkan file `.rbxm`

---

## Step 3: Import ke Roblox Studio

1. Buka game kamu di Roblox Studio
2. Drag file `.rbxm` ke panel Explorer
3. Atau: klik kanan ServerScriptService → Insert from File → pilih `.rbxm`

---

## Step 4: Masukkan License Key

1. Buka script utama (di ServerScriptService)
2. Cari teks: `PASTE_YOUR_KEY_HERE`
3. Ganti dengan license key kamu: `RBXR-XXXX-XXXX-XXXX-XXXX`

---

## Step 5: Enable HttpService

1. Di Roblox Studio, buka **Game Settings**
2. Pergi ke tab **Security**
3. Enable **"Allow HTTP Requests"**
4. Klik Save

---

## Step 6: Whitelist Game ID

1. Buka dashboard: https://audio.muhwldns.me/dashboard/licenses
2. Klik license kamu
3. Klik "Add Game"
4. Masukkan **Place ID** game kamu (bisa dilihat di URL game atau Game Settings)
5. Klik Save

---

## Step 7: Test

1. Klik **Play** di Roblox Studio
2. Cek Output panel — tidak boleh ada error
3. Publish game dan test di live server

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| "Core dependency unavailable" | Pastikan HttpService enabled |
| Game tidak berfungsi | Pastikan license key benar dan game ID sudah di-whitelist |
| Error setelah beberapa menit | License mungkin expired atau di-revoke. Cek dashboard. |
| Tidak bisa whitelist game | Pastikan kamu belum melebihi batas game untuk tier license kamu |

---

## Batas Game per Tier

| Tier | Max Games |
|------|-----------|
| Personal | 3 game |
| Commercial | 10 game |
| Enterprise | Unlimited |

---

## Butuh Bantuan?

- Dashboard: https://audio.muhwldns.me/dashboard
- Email: support@muhwldns.me

---

*RBX Royale — Scripts & Audio Tools*
