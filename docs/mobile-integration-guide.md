# Mobile Integration Guide — Bearer Auth

> **Untuk:** Engineer/agent yang mengintegrasikan Flutter app dengan backend RBX Royale.
> Dokumen ini berisi semua yang perlu Anda tahu agar app bisa login Google/Discord lewat system browser, menyimpan token aman, dan memanggil seluruh endpoint backend yang sudah ada.
>
> **Asumsi:** Anda tahu Flutter dasar, tapi tidak tahu apa-apa soal backend kami.
> Anda **tidak perlu** membaca kode backend untuk menyelesaikan integrasi — semua kontrak ada di dokumen ini.
>
> **Spec backend:** `docs/superpowers/specs/2026-06-14-mobile-oauth-token-auth-design.md`
> **Plan implementasi backend:** `docs/superpowers/plans/2026-06-14-mobile-oauth-token-auth.md`

---

## 1. Apa yang Dibangun

App Flutter login lewat **system browser (Chrome / Safari)**, bukan webview. Setelah user setuju di halaman Google/Discord, browser **redirect ke deep link** `rbxroyale://auth?access=<jwt>&refresh=<token>`. App tangkap kedua token, simpan di secure storage, dan dari sini setiap request kirim header `Authorization: Bearer <jwt>`.

**Mengapa system browser, bukan webview:**
- User sudah login Google/Discord di browser HP-nya — tinggal tap "Izinkan", tidak ketik password
- Google **memblokir** OAuth dari webview (`disallowed_useragent` error). System browser wajib.
- Lebih aman: kredensial user tak pernah lewat app Anda

**Mengapa Bearer JWT, bukan cookie session:**
- Cookie dirancang untuk browser. Flutter bukan browser.
- Bearer JWT bisa di-attach ke request HTTP standar via header.
- Refresh token disimpan di tabel `Session` backend → bisa di-revoke (logout paksa kalau HP hilang).

---

## 2. Backend Contract (kanonik)

### 2.1 Endpoint baru yang perlu Anda panggil

| Method | Path | Tujuan |
| ------ | ---- | ------ |
| GET | `/auth/google?platform=mobile` | Mulai OAuth Google flow (mobile) |
| GET | `/auth/discord?platform=mobile` | Mulai OAuth Discord flow (mobile) |
| POST | `/auth/refresh` | Tukar refresh token → access token baru |
| POST | `/auth/logout-mobile` | Cabut refresh token (logout) |

Semua endpoint lain (`/auth/me`, `/topup/*`, `/store/*`, `/dashboard/*`, `/admin/*`, dst.) **otomatis menerima Bearer JWT** — tidak ada yang khusus mobile.

### 2.2 Base URL produksi

```
https://api-rbx.muhwldns.me
```

### 2.3 Deep link redirect

Backend redirect ke string yang di-set di env `MOBILE_DEEP_LINK_REDIRECT` (default `rbxroyale://auth`).

Format URL setelah login sukses:
```
rbxroyale://auth?access=<JWT>&refresh=<opaque-token>
```

Kalau OAuth gagal (user batal, dst.):
```
rbxroyale://auth?error=oauth_failed
```

### 2.4 `POST /auth/refresh`

**Request:**
```json
{ "refresh": "<opaque-token>" }
```

**Response 200:**
```json
{
  "access": "<new JWT>",
  "refresh": "<new opaque token>",
  "expiresIn": 604800
}
```

`refresh` token **dirotasi setiap kali** — token lama langsung invalid setelah panggilan ini sukses. Simpan yang baru.

**Error:**
- `400 { "error": "refresh required" }` — body field hilang
- `401 { "error": "refresh_invalid" }` — refresh tidak ada / kadaluarsa / sudah dirotasi → app harus paksa user login ulang
- `429` — terlalu sering panggil refresh

### 2.5 `POST /auth/logout-mobile`

**Headers:** `Authorization: Bearer <access-jwt>` (wajib)

**Request:**
```json
{ "refresh": "<refresh-token>" }
```

**Response 200:**
```json
{ "ok": true }
```

Idempotent — selalu 200 walau refresh token tidak ada / sudah dihapus.

### 2.6 Error contract umum (semua endpoint Bearer)

| Status | Body | Arti & app harus apa |
| ------ | ---- | -------------------- |
| 401 | `{"error":"invalid_token"}` | JWT rusak / signature salah / user dihapus → wipe storage, paksa login ulang |
| 401 | `{"error":"token_expired"}` | JWT kadaluarsa → otomatis panggil `/auth/refresh`, ulangi request |
| 401 | `{"error":"refresh_invalid"}` | Khusus `/auth/refresh` → wipe storage, paksa login ulang |
| 403 | `{"error":"forbidden"}` | Endpoint admin, user bukan ADMIN |
| 429 | `{"error":"..."}` | Rate limit, backoff dan coba lagi |

---

## 3. Setup Deep Link

Deep link adalah URI scheme yang OS HP kenali sebagai "buka app saya". String-nya `rbxroyale://`.

### 3.1 Android — `android/app/src/main/AndroidManifest.xml`

Di dalam `<activity android:name=".MainActivity">` tambahkan intent filter:

```xml
<intent-filter android:autoVerify="false">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="rbxroyale" android:host="auth" />
</intent-filter>
```

### 3.2 iOS — `ios/Runner/Info.plist`

Tambahkan di dalam `<dict>` paling atas:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>com.rbxroyale.app</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>rbxroyale</string>
        </array>
    </dict>
</array>
```

### 3.3 Catatan keamanan

Custom scheme **bisa dibajak** app lain yang mendaftarkan scheme sama. Risiko di v1 dimitigasi karena:
- State HMAC mencegah attacker memulai flow dari device sendiri lalu hijack callback
- Token yang lewat deep link berumur pendek (access 7 hari, refresh 30 hari)

Untuk produksi jangka panjang, **App Links / Universal Links** (HTTPS deep link diverifikasi domain) lebih aman. Itu migrasi additive nanti — backend sudah siap (cukup ubah env `MOBILE_DEEP_LINK_REDIRECT`).

---

## 4. Dependencies Flutter

Tambahkan ke `pubspec.yaml`:

```yaml
dependencies:
  flutter_web_auth_2: ^3.1.2          # buka system browser, tangkap deep link
  flutter_secure_storage: ^9.2.2      # simpan token di Keychain/Keystore
  dio: ^5.5.0                          # HTTP client dengan interceptor
  http_parser: ^4.0.2                  # opsional, kalau butuh form parsing
```

`flutter_web_auth_2` butuh sedikit setup native (Android `AndroidManifest.xml` callback activity) — ikuti dokumentasi package-nya. Yang penting untuk integrasi ini: pastikan callback URL scheme yang dipakai adalah **`rbxroyale`** (cocok dengan deep link backend).

---

## 5. Auth Service (Flutter)

Satu kelas yang menangani: login, refresh, logout, dan baca token dari storage. Semua kode di bawah ini sudah lengkap — tinggal copy.

### 5.1 Storage layer

```dart
// lib/auth/auth_storage.dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthStorage {
  static const _accessKey = 'auth_access_token';
  static const _refreshKey = 'auth_refresh_token';
  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<void> save({required String access, required String refresh}) async {
    await _storage.write(key: _accessKey, value: access);
    await _storage.write(key: _refreshKey, value: refresh);
  }

  Future<String?> readAccess() => _storage.read(key: _accessKey);
  Future<String?> readRefresh() => _storage.read(key: _refreshKey);

  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}
```

### 5.2 OAuth flow (login)

```dart
// lib/auth/auth_service.dart
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:dio/dio.dart';

class AuthService {
  static const String baseUrl = 'https://api-rbx.muhwldns.me';
  static const String callbackScheme = 'rbxroyale';
  final AuthStorage storage;
  final Dio dio;

  AuthService(this.storage, this.dio);

  /// Trigger OAuth Google flow. Returns true on success.
  Future<bool> loginWithGoogle() => _oauthLogin('google');

  Future<bool> loginWithDiscord() => _oauthLogin('discord');

  Future<bool> _oauthLogin(String provider) async {
    final url = '$baseUrl/auth/$provider?platform=mobile';
    try {
      final result = await FlutterWebAuth2.authenticate(
        url: url,
        callbackUrlScheme: callbackScheme,
      );
      // result is the deep link the backend redirected to:
      //   rbxroyale://auth?access=<jwt>&refresh=<token>
      // or rbxroyale://auth?error=oauth_failed
      final uri = Uri.parse(result);
      final error = uri.queryParameters['error'];
      if (error != null) return false;
      final access = uri.queryParameters['access'];
      final refresh = uri.queryParameters['refresh'];
      if (access == null || refresh == null) return false;
      await storage.save(access: access, refresh: refresh);
      return true;
    } catch (_) {
      // user cancelled, network error, etc.
      return false;
    }
  }

  /// Try to refresh the access token. Returns true on success.
  /// On `refresh_invalid` (token rotated/expired), wipes storage so the
  /// caller knows to send the user back to the login screen.
  Future<bool> refreshAccessToken() async {
    final refresh = await storage.readRefresh();
    if (refresh == null) return false;
    try {
      final res = await dio.post(
        '$baseUrl/auth/refresh',
        data: {'refresh': refresh},
        options: Options(
          // bypass interceptor — refresh must not loop on 401
          headers: {'X-Skip-Auth-Interceptor': '1'},
        ),
      );
      if (res.statusCode == 200) {
        await storage.save(
          access: res.data['access'] as String,
          refresh: res.data['refresh'] as String,
        );
        return true;
      }
      return false;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        await storage.clear();
      }
      return false;
    }
  }

  Future<void> logout() async {
    final access = await storage.readAccess();
    final refresh = await storage.readRefresh();
    if (access != null && refresh != null) {
      try {
        await dio.post(
          '$baseUrl/auth/logout-mobile',
          data: {'refresh': refresh},
          options: Options(
            headers: {
              'Authorization': 'Bearer $access',
              'X-Skip-Auth-Interceptor': '1',
            },
          ),
        );
      } catch (_) {
        // ignore — local wipe is what matters
      }
    }
    await storage.clear();
  }

  Future<bool> isLoggedIn() async {
    final access = await storage.readAccess();
    return access != null;
  }
}
```

### 5.3 HTTP interceptor (auto-refresh)

Inilah inti UX "user tetap login" — sat access JWT kadaluarsa, app diam-diam panggil `/auth/refresh` lalu retry request.

```dart
// lib/auth/auth_interceptor.dart
import 'package:dio/dio.dart';

class AuthInterceptor extends Interceptor {
  final AuthStorage storage;
  final AuthService auth;
  final Dio dio;
  AuthInterceptor(this.storage, this.auth, this.dio);

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (options.headers['X-Skip-Auth-Interceptor'] == '1') {
      options.headers.remove('X-Skip-Auth-Interceptor');
      return handler.next(options);
    }
    final access = await storage.readAccess();
    if (access != null) {
      options.headers['Authorization'] = 'Bearer $access';
    }
    return handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final response = err.response;
    if (response?.statusCode != 401) return handler.next(err);

    final body = response?.data;
    final code = body is Map ? body['error'] : null;
    if (code != 'token_expired') return handler.next(err);

    // Try refresh, then retry the original request once.
    final ok = await auth.refreshAccessToken();
    if (!ok) return handler.next(err);

    final newAccess = await storage.readAccess();
    final original = err.requestOptions;
    original.headers['Authorization'] = 'Bearer $newAccess';
    try {
      final retried = await dio.fetch(original);
      return handler.resolve(retried);
    } catch (e) {
      return handler.next(err);
    }
  }
}
```

### 5.4 Wiring (main.dart)

```dart
final storage = AuthStorage();
final dio = Dio(BaseOptions(
  baseUrl: 'https://api-rbx.muhwldns.me',
  validateStatus: (s) => s != null && s < 500,
));
final auth = AuthService(storage, dio);
dio.interceptors.add(AuthInterceptor(storage, auth, dio));
```

Setelah ini, **setiap call lewat `dio` akan**:
1. Otomatis kirim Bearer header kalau ada token
2. Sat dapat 401 token_expired → refresh → retry transparan
3. Sat refresh gagal → user dipaksa login ulang (storage sudah ke-wipe oleh `refreshAccessToken`)

---

## 6. Typical UI Flows

### 6.1 First launch / cold start

```dart
final loggedIn = await auth.isLoggedIn();
if (loggedIn) {
  // Optional: validate token by hitting /auth/me — interceptor handles refresh
  try {
    final me = await dio.get('/auth/me');
    // navigate to home with me.data.user
  } on DioException catch (e) {
    if (e.response?.statusCode == 401) {
      // refresh attempted by interceptor failed → token chain dead
      Navigator.pushReplacement(/* to LoginScreen */);
    }
  }
} else {
  // show LoginScreen
}
```

### 6.2 Login screen

```dart
ElevatedButton(
  onPressed: () async {
    final ok = await auth.loginWithGoogle();
    if (ok) {
      Navigator.pushReplacement(/* to HomeScreen */);
    } else {
      // show "Login gagal, coba lagi" toast
    }
  },
  child: const Text('Login dengan Google'),
)
```

System browser akan terbuka, user pilih akun, browser otomatis tertutup, app kebuka kembali dengan `loginWithGoogle()` resolved.

### 6.3 Memanggil endpoint apapun

```dart
// Top-up
final res = await dio.post('/topup/create', data: {
  'amount': 50000,
  'customer_name': user.displayName,
});

// Cek status
final status = await dio.get('/topup/status/${res.data['publicId']}');

// Lihat profil
final me = await dio.get('/auth/me');

// Lihat histori top-up
final history = await dio.get('/dashboard/transactions');
```

Tidak perlu attach Bearer manual — interceptor mengurusnya. Tidak perlu handle 401 secara umum — interceptor refresh + retry.

### 6.4 Logout

```dart
ElevatedButton(
  onPressed: () async {
    await auth.logout();
    Navigator.pushReplacement(/* to LoginScreen */);
  },
  child: const Text('Logout'),
)
```

---

## 7. Top-Up Flow (referensi konkret)

Backend top-up sudah memakai MustikaPay (QRIS, polling). Mobile cukup panggil endpoint biasa — semua logika sama dengan web:

```dart
// 1. Bikin order
final order = await dio.post('/topup/create', data: {'amount': 50000});
final publicId = order.data['publicId'];
final qrisImageUrl = order.data['qrisImageUrl']; // URL ke gambar QR
final expiresAt = order.data['expiresAt'];       // ISO string, ~20 menit

// 2. Tampilkan QR di UI (Image.network atau cached_network_image)

// 3. Polling status atau pakai tombol "Saya sudah bayar"
Future<bool> checkPaid() async {
  final res = await dio.get('/topup/status/$publicId');
  return res.data['paid'] == true; // status === "COMPLETED"
}
```

`qrisImageUrl` dari MustikaPay siap di-render langsung sebagai image (PNG). Tidak perlu generate QR di mobile.

---

## 8. Troubleshooting

| Gejala | Penyebab umum | Solusi |
| ------ | ------------- | ------ |
| Browser kebuka tapi tak balik ke app | Scheme `rbxroyale` belum terdaftar di manifest/Info.plist | Cek §3.1 / §3.2 |
| `loginWithGoogle()` selalu return false tanpa browser kebuka | `flutter_web_auth_2` butuh setup native callback activity | Ikuti README package-nya |
| Setiap request 401 walau baru login | `Authorization` header tidak ter-attach | Cek interceptor terpasang di Dio yang dipakai |
| 401 berulang setelah `/auth/refresh` | Refresh token sudah dirotasi (mungkin race) atau kadaluarsa | App harus paksa login ulang |
| `disallowed_useragent` di Google | Pakai webview, bukan system browser | Wajib `flutter_web_auth_2` (membuka Custom Tabs/SFSafariViewController) |
| Token tetap valid setelah logout | Access JWT tidak bisa di-revoke (stateless). Hanya refresh yang dihapus. | Acceptable. Access kadaluarsa max 7 hari. |
| Login Safari/iOS gagal | `ASWebAuthenticationSession` butuh Apple Universal Links untuk paling aman | Custom scheme tetap jalan, tapi App Links direkomendasi untuk produksi |

---

## 9. Pre-flight Checklist

Sebelum klaim integrasi selesai, verifikasi:

- [ ] Login Google berhasil end-to-end di Android device asli
- [ ] Login Discord berhasil end-to-end di Android device asli
- [ ] Login Google berhasil di iOS (kalau target iOS)
- [ ] Cold start dengan token tersimpan langsung masuk ke home tanpa minta login
- [ ] Cold start dengan refresh token kadaluarsa (>30 hari) memunculkan login screen, bukan error
- [ ] Tunggu access JWT kadaluarsa (atau ubah `ACCESS_TOKEN_TTL_DAYS` di backend dev → 1 menit), pastikan request berikut transparan refresh
- [ ] Logout menghapus token dari secure storage (verifikasi dengan `storage.readAccess() == null`)
- [ ] Logout dipanggil sat HP offline tetap menghapus token lokal (jangan blokir UX karena network gagal)
- [ ] User cancel di consent screen Google → app kembali ke login screen, bukan crash
- [ ] Top-up flow lengkap: buat order → tampilkan QRIS → polling status → COMPLETED
- [ ] Pengujian rate limit: 31 panggilan `/auth/refresh` dalam 1 menit → call ke-31 dapat 429

---

## 10. Yang TIDAK Perlu Anda Lakukan

- **Bikin endpoint baru di backend.** Semua sudah ada.
- **Modifikasi kode backend.** Kalau Anda butuh sesuatu yang belum ada, escalate ke tim backend dengan use case spesifik — jangan tambah endpoint sendiri.
- **Implementasi cookie session.** Mobile pakai Bearer JWT saja.
- **Sign JWT di app.** Backend yang issue token; app hanya menyimpan dan mengirim.
- **Generate QRIS di app.** Backend mengembalikan `qrisImageUrl` siap render.
- **Validasi Bearer di app.** Sat backend menjawab 200 dengan data, anggap user terotentikasi.
- **Refresh token preemptif.** Interceptor refresh sat 401 saja — tidak perlu polling sebelum kadaluarsa.

---

## 11. Referensi Cepat

| Topik | Lokasi |
| ----- | ------ |
| Spec auth lengkap | `docs/superpowers/specs/2026-06-14-mobile-oauth-token-auth-design.md` |
| Plan implementasi backend | `docs/superpowers/plans/2026-06-14-mobile-oauth-token-auth.md` |
| OpenAPI (semua endpoint) | `backend/openapi.yaml` |
| Daftar route + auth | `backend/API_ROUTES.md` |
| Dokumentasi teknis (Indonesia) | `docs/dokumentasi-teknis.md` (§5.1, §6.1, §16) |
| Source signing/verifying | `backend/src/services/authTokenService.js` |

Pertanyaan yang spec/dokumen di atas tidak jawab — eskalasi ke tim backend dengan referensi spec section. Jangan menebak kontrak.

