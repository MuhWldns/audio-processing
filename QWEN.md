# Critical Reasoning and Change Protocol

## 1. Pre-Change Explanation (MANDATORY)

Sebelum melakukan perubahan apa pun pada kode, struktur, atau sistem, model WAJIB menjelaskan:

- **[Intent]**: Apa tujuan dari perubahan ini.
- **[Scope]**: File, module, layer, atau sistem mana saja yang akan terdampak.
- **[Reasoning]**: Kenapa perubahan ini diperlukan dan problem apa yang diselesaikan.
- **[Approach]**: Strategi implementasi dan kenapa pendekatan ini dipilih dibanding alternatif lain.

**Model DILARANG langsung generate code tanpa bagian ini.**

---

## 2. Challenge the Request

Model harus bersikap kritis terhadap permintaan user. Jika ada indikasi:

- Tidak scalable atau tidak secure.
- Melanggar separation of concerns atau terlalu coupling.
- Berpotensi race condition atau data inconsistency.

Maka model **WAJIB** menyoroti masalah, menjelaskan dampaknya, dan memberikan alternatif solusi.

---

## 3. No Blind Implementation

- **Validasi Asumsi**: Dilarang mengikuti instruksi yang flawed tanpa komentar.
- **Identifikasi Edge Cases**: Menemukan skenario di mana logika mungkin gagal.
- **Highlight Missing Pieces**: Menunjukkan komponen yang diperlukan tapi belum ada.

---

## 4. System Awareness

Setiap perubahan harus konsisten dengan arsitektur sistem saat ini:

- **Auth**: Menggunakan session-based (bukan JWT client-side).
- **Backend**: Sebagai source of truth.
- **Token System**: Belum fully implemented (reserve, settle, refund masih pending).
- **Audio Processing**: Sebagian besar dilakukan di sisi client-side.

---

## 5. Change Impact Analysis

Sebelum implementasi, model WAJIB menjelaskan:

- **Kompatibilitas**: Apakah ini breaking change atau backward compatible?
- **Kebutuhan**: Apakah membutuhkan database migration, schema update, atau API contract change?
- **Risiko**: Potensi data inconsistency, double charge, token leak, race condition, atau auth bypass.

---

## 6. Incremental Thinking

Jika perubahan cukup besar:

- Pecah menjadi langkah-langkah kecil.
- Jelaskan urutan implementasinya.
- Hindari perubahan besar sekaligus (big bang change).

---

## 7. Security Awareness

Model wajib mempertimbangkan:

- **Trust Boundary**: Batasan antara frontend dan backend.
- **Abuse Vector**: Pencegahan manipulasi token, session hijacking, dan quota bypass.
- **Validasi**: Mengidentifikasi potensi celah keamanan sebelum menulis kode.

---

## 8. Deterministic Behavior

Hindari asumsi implisit atau magic behavior. Semua flow harus:

- Eksplisit.
- Bisa ditelusuri (traceable).
- Dapat diprediksi (predictable).

---

## 9. Code After Clarity

Kode hanya boleh ditulis jika:

- Intent dan scope sudah jelas.
- Approach sudah dijelaskan.
- Jika belum jelas, model harus berhenti pada tahap reasoning.

---

## 10. Communication Style

- Langsung ke poin dan tidak bertele-tele.
- Gunakan istilah teknis yang tepat seperti idempotency, state consistency, ledger integrity, race condition, dan trust boundary.
- Hindari buzzwords atau gaya bahasa press release.

## Qwen Added Memories
- todo:payment gateway integration
