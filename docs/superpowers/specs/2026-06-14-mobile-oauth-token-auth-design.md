# Mobile OAuth + Token-Based Auth Design

**Status:** Draft (brainstorming complete, awaiting user review)
**Date:** 2026-06-14
**Author:** Claude (with MuhWldns)
**Related:** Builds on the existing passport/express-session auth in `backend/src/services/authService.js` and the unused `Session` model in `backend/prisma/schema.prisma`.

## Goal

Let a Flutter app log in with Google/Discord through the system browser (Chrome/Safari) and call existing backend endpoints with a Bearer token, without disrupting the current cookie-based web auth and without changing the database schema.

## Non-Goals

- Replacing or refactoring the existing web cookie session.
- Multi-device session management UI.
- Two-factor auth.
- Native Google/Discord SDK integration in Flutter (out of repo scope).
- Universal Links / App Links (custom scheme `rbxroyale://` is acceptable for v1).

## Constraints

- **No schema changes.** The database report is final. The existing `Session` model in `schema.prisma` is reused as-is.
- Web auth (cookie `connect.sid`) must keep working unchanged.
- Backend domain stays at `api-rbx.muhwldns.me`. No new DNS, no new domain.
- Money-handling endpoints (top-up, wallet, checkout) must stay safe — the new auth path must be at least as strict as the existing cookie path.

## Summary

The backend gains a second auth path that runs in parallel with the existing cookie session. After OAuth completes, the callback detects whether the request came from a mobile app (via the OAuth `state` parameter) and either redirects to the web frontend (existing behavior) or issues an access JWT plus a refresh token and redirects to a deep link `rbxroyale://auth?access=…&refresh=…`. The Flutter app stores both in secure storage. Every authenticated request sends `Authorization: Bearer <jwt>`. The `requireAuth` middleware accepts either a valid Bearer token or a valid cookie session. Refresh tokens live in the existing `Session` table and can be revoked.

## Architecture

```
                       ┌─────────────────────┐
                       │  Browser (web)      │
                       │  rbxroyale.dev      │
                       └─────────┬───────────┘
                                 │ cookie connect.sid
                                 │
┌─────────────┐                  ▼
│  Flutter    │       ┌─────────────────────┐
│  App        │──┐    │     Backend         │
└─────────────┘  │    │  api-rbx.muhwldns.me│
                 │    │                     │
   header        └───▶│   requireAuth:      │
   Authorization:     │   - bearer? ✓       │
   Bearer <jwt>       │   - cookie? ✓       │
                      └──────────┬──────────┘
                                 │
                                 ▼
                      ┌─────────────────────┐
                      │   Database          │
                      │  - User             │
                      │  - OAuthAccount     │  (existing)
                      │  - Session          │  (existing, now used)
                      └─────────────────────┘
```

### Two auth paths, one middleware

`requireAuth` (in `backend/src/middlewares/auth.js`) is the single gate. It runs in this order on every protected request:

1. If `Authorization: Bearer <token>` present → verify the JWT via `tokenService.verifyAccessToken`. If valid, set `req.user = { id, role }` and continue.
2. Else, fall back to the existing `req.isAuthenticated()` cookie check.
3. If neither succeeds → 401.

Bearer takes precedence so a stray cookie cannot override an explicit token. Controllers do not change — they still read `req.user.id` exactly as today.

### OAuth callback split

Both `handleGoogleCallback` and `handleDiscordCallback` parse the OAuth `state` parameter that passport round-trips through Google/Discord. If `state.platform === "mobile"`, the callback issues tokens and redirects to the deep link. Otherwise it preserves the current behavior (`res.redirect(FRONTEND_URL/?login=success)`).

The `state` parameter is HMAC-signed with `JWT_SECRET` so an attacker cannot forge a state that hijacks the callback into redirecting to a malicious deep link.

## Components

### New files

| File | Responsibility |
| ---- | -------------- |
| `backend/src/services/tokenService.js` | Issue/verify access JWTs. Issue/validate/rotate/revoke refresh tokens stored in the `Session` table. Pure module, all DB access via Prisma client passed in or imported. |
| `backend/tests/services/tokenService.test.js` | Unit tests for tokenService. |
| `backend/tests/routes/mobileAuth.test.js` | Integration tests for the mobile callback branch, `/auth/refresh`, `/auth/logout-mobile`, and Bearer-token access to existing endpoints. |

### Modified files

| File | Change |
| ---- | ------ |
| `backend/src/middlewares/auth.js` | `requireAuth` checks `Authorization: Bearer` first; falls back to cookie. |
| `backend/src/controllers/authController.js` | Branch in `handleGoogleCallback`/`handleDiscordCallback` for mobile state. Add `handleRefresh` and `handleMobileLogout`. |
| `backend/src/services/authService.js` | OAuth strategies pass through `state` (sign on entry, verify on callback). No change to user upsert logic. |
| `backend/src/server.js` | Register `POST /auth/refresh` and `POST /auth/logout-mobile`. Wire the new rate limiter. |
| `backend/.env.example` | Add `JWT_SECRET`, `MOBILE_DEEP_LINK_REDIRECT`, `ACCESS_TOKEN_TTL_DAYS`, `REFRESH_TOKEN_TTL_DAYS`. |
| `backend/openapi.yaml` | Document `/auth/refresh`, `/auth/logout-mobile`, the `?platform=mobile` query on `/auth/google` and `/auth/discord`, and the `bearerAuth` security scheme. |

### New dependency

- `jsonwebtoken` — Node-standard JWT library. Used only inside `tokenService.js`.

### Reused as-is

- `Session` model (`schema.prisma:117-130`) — `sessionToken` (unique), `expiresAt`, `ipAddress`, `userAgent`, `userId`. Already in the final schema, just unused until now.
- `User` and `OAuthAccount` — no change.
- `createUploadLimiter` — used to add per-user limits on `/auth/refresh`.

## Token Model

### Access token (JWT)

- Signed with `JWT_SECRET`, algorithm **HS256** (locked explicitly in `verify` to prevent `alg: none` attacks).
- Payload: `{ sub: userId, role, iat, exp }`. Nothing else — no email, no Google tokens, no PII.
- TTL: 7 days (`ACCESS_TOKEN_TTL_DAYS=7`).
- Stateless. No DB hit on verify.
- Cannot be revoked before expiry — that is the deliberate trade-off, mitigated by the 7-day cap and refresh-token revocation.

### Refresh token (opaque, in `Session`)

- 32 random bytes from `crypto.randomBytes(32)`, base64url-encoded.
- Stored in `Session.sessionToken` as **SHA-256 hash** (constant-time comparison on validate). If the DB leaks, the raw token is not usable.
- TTL: 30 days (`REFRESH_TOKEN_TTL_DAYS=30`), written to `Session.expiresAt`.
- `Session.userId`, `Session.ipAddress`, `Session.userAgent` populated at issue time. IP/UA are forensic fields, not validated on use (mobile networks change IPs).
- Validate = lookup row by hash, check not expired, return `userId`.

### Rotation and reuse detection

Every successful `/auth/refresh`:

1. Validate the incoming refresh.
2. Issue a new access JWT.
3. **Delete** the old `Session` row.
4. Insert a new `Session` row with a new random refresh token.
5. Return both new tokens.

If a client ever presents a refresh token that does not exist (already rotated or never existed), the server **deletes all `Session` rows for that user** as a stolen-token signal. The user is forced to log in again. This is RFC 6819 §5.2.2.3 reuse detection.

To distinguish "rotated" from "never existed", a refresh token's hash is checked against `Session`. If absent and the JWT in the prior access token is still verifiable and points to a real user, treat it as reuse and revoke that user's sessions. (If we cannot prove which user, we cannot revoke — the attacker gets one free attempt only, since we delete the legitimate row on rotation.)

### Token transport

| Token | Transport | Stored on device |
| ----- | --------- | ---------------- |
| Access JWT | `Authorization: Bearer <jwt>` header on every request | `flutter_secure_storage` |
| Refresh | Body of `POST /auth/refresh` only | `flutter_secure_storage` |

Refresh token is never sent on regular requests. It only travels to `/auth/refresh` and `/auth/logout-mobile`.

## Deep Link

### Scheme

`rbxroyale://auth` — custom URI scheme, registered by the Flutter app in `AndroidManifest.xml` (Android) and `Info.plist` (iOS). The scheme is unrelated to the backend's `muhwldns.me` domain.

### Backend's role

The backend treats the deep link as an opaque redirect URL pulled from `MOBILE_DEEP_LINK_REDIRECT` env var. Backend code never references the literal string `rbxroyale://`; this keeps the scheme switchable without code changes.

### Redirect formats

| Outcome | Redirect URL |
| ------- | ------------ |
| Success | `${MOBILE_DEEP_LINK_REDIRECT}?access=<jwt>&refresh=<token>` |
| OAuth failure (cancelled, denied) | `${MOBILE_DEEP_LINK_REDIRECT}?error=oauth_failed` |
| State signature mismatch | redirect to web `FRONTEND_URL/?login=failed` (treat as forged) |

The deep link query string never contains user data — only opaque tokens or an error code.

### Custom-scheme caveat (acknowledged risk)

Custom schemes can be hijacked by another app on the same device that registers the same scheme. The window is small (between OAuth success and the OS picking the target app) and Android disambiguates with a chooser dialog, but it is not zero. Mitigations baked into this design:

- Refresh token must be paired with a fresh access JWT to be useful — a leaked deep link alone gives an attacker only the access window of that one issuance.
- HMAC-signed `state` prevents an attacker from initiating a flow with their own session.

If the custom-scheme risk later proves material, the next step is App Links / Universal Links (HTTPS deep links verified by `assetlinks.json` / `apple-app-site-association` hosted on the domain). That migration is purely additive and does not require redesigning this spec — only swapping `MOBILE_DEEP_LINK_REDIRECT` to a domain-verified HTTPS URL.

## Configuration

New environment variables (added to `.env.example`, must be set in `.env.production`):

```
# JWT signing secret (required in production; server exits if unset, mirroring SESSION_SECRET)
JWT_SECRET=

# Where the OAuth callback redirects mobile clients after issuing tokens
MOBILE_DEEP_LINK_REDIRECT=rbxroyale://auth

# Token lifetimes
ACCESS_TOKEN_TTL_DAYS=7
REFRESH_TOKEN_TTL_DAYS=30
```

`JWT_SECRET` follows the same fail-closed rule as `SESSION_SECRET`: missing in production = `process.exit(1)` at startup. Development can fall back to a warned default.

No changes to existing env vars. No changes to Google/Discord console (the same callback URL is reused; mobile vs web is signaled in `state`, not in the redirect URI).

## Data Flows

### Flow A — First-time mobile login

```
1. App taps "Login with Google"
2. App opens system browser →
     GET https://api-rbx.muhwldns.me/auth/google?platform=mobile
3. Backend route handler signs state HMAC{platform:"mobile", nonce} and
   calls passport.authenticate("google", { state, scope: [...] })
4. Browser → Google → user consents
5. Google → GET /auth/google/callback?code=…&state=…
6. Passport verifies state HMAC and exchanges code for profile.
   Verify callback upserts User + OAuthAccount (existing logic, untouched).
7. handleGoogleCallback runs:
     - parses state → platform === "mobile"
     - access  = tokenService.issueAccessToken(user.id, user.role)
     - refresh = await tokenService.issueRefreshToken(user.id, req.ip, req.get("user-agent"))
     - res.redirect(`${MOBILE_DEEP_LINK_REDIRECT}?access=<jwt>&refresh=<token>`)
8. OS sees rbxroyale:// scheme → launches Flutter app
9. App stores both tokens in flutter_secure_storage
10. App calls GET /auth/me with Authorization: Bearer <access>
11. requireAuth verifies JWT, sets req.user, /auth/me returns profile
12. App lands on home screen
```

### Flow B — Authenticated request (token still fresh)

```
1. App needs data, e.g. GET /topup/status/abc
2. App attaches Authorization: Bearer <access JWT>
3. requireAuth sees Bearer header → verifies JWT signature + expiry
4. req.user = { id: payload.sub, role: payload.role }
5. Controller runs unchanged
```

### Flow C — Silent refresh (access JWT expired)

```
1. App calls GET /topup/status/abc → 401 { error: "token_expired" }
2. App's HTTP interceptor catches 401, reads stored refresh, then:
     POST /auth/refresh   Body: { refresh: "<token>" }
3. handleRefresh:
     - tokenService.validateRefreshToken(token)
       → SELECT Session WHERE sessionToken = sha256(token) AND expiresAt > NOW()
     - If not found → reuse-detection: if we can identify the user from a
       prior access token, delete all their Sessions; return 401 refresh_invalid
     - If found:
        - DELETE old Session row
        - INSERT new Session with new random refresh
        - access  = issueAccessToken(session.userId, user.role)
        - return { access, refresh }  // both new
4. App stores the new pair, retries the original request
5. User notices nothing
```

### Flow D — Mobile logout

```
1. App taps Logout
2. POST /auth/logout-mobile  (Authorization: Bearer ...)
   Body: { refresh: "<token>" }
3. handleMobileLogout:
     - DELETE Session row matching sha256(refresh)  (idempotent)
     - returns 200 { ok: true }
4. App wipes flutter_secure_storage
5. Done. The access JWT remains technically valid until its expiry, but the
   app no longer holds it. Acceptable given the 7-day cap.
```

## API Endpoints

### New: `POST /auth/refresh`

Request:
```json
{ "refresh": "<token>" }
```

Response 200:
```json
{
  "access": "<new JWT>",
  "refresh": "<new opaque token>",
  "expiresIn": 604800
}
```

Errors:
- 400 `{ error: "refresh required" }` — body missing the field
- 401 `{ error: "refresh_invalid" }` — not found, expired, or rotated
- 429 — per-user rate limit hit

Rate limit: per-user (or per-IP fallback for unauthenticated calls), 30/min, mirroring `topupStatusLimiter`.

### New: `POST /auth/logout-mobile`

Auth: `Authorization: Bearer <access>` required (so we know who is logging out, even if their refresh is missing).

Request:
```json
{ "refresh": "<token>" }
```

Response 200:
```json
{ "ok": true }
```

Idempotent — succeeds whether or not the row exists. Rate limit: per-user, 10/min.

### Extended: `GET /auth/google` and `GET /auth/discord`

Adds optional `?platform=mobile` query parameter. When present, the route handler signs a `state` HMAC carrying `{platform: "mobile", nonce}` and passes it to `passport.authenticate(..., { state })`. When absent, the existing web flow runs unchanged.

### Extended: `GET /auth/google/callback` and `GET /auth/discord/callback`

The callback handler:

1. Verifies `state` HMAC. If invalid → redirect to `FRONTEND_URL/?login=failed`. (Forged state: refuse to redirect to a deep link.)
2. Parses `state.platform`.
3. Mobile branch: issue tokens, redirect to `MOBILE_DEEP_LINK_REDIRECT?access=…&refresh=…`.
4. Web branch (default): existing behavior — `res.redirect(${FRONTEND_URL}/?login=success)`.

OAuth failure (user denied, etc.) on the mobile branch redirects to `MOBILE_DEEP_LINK_REDIRECT?error=oauth_failed` so the app can show a clean message.

### Unchanged but bearer-aware: every endpoint with `requireAuth`

`/auth/me`, `/auth/logout`, `/topup/*`, `/cart/*`, `/checkout`, `/licenses/*`, `/admin/*`, `/dashboard/*`, `/profile/*`, `/user/*`, `/upload`, `/history*` — all become reachable via `Authorization: Bearer` automatically once `requireAuth` is extended. **Zero controller code changes.**

`requireAdmin` keeps working as before — it reads `req.user.role`, which is now populated from the JWT payload.

## Error Handling

| Scenario | Backend response | App expected behavior |
| -------- | ---------------- | --------------------- |
| User cancels Google consent | `redirect ${MOBILE_DEEP_LINK_REDIRECT}?error=cancelled` | Show "Login cancelled" |
| Google token exchange fails (`invalid_grant`, network) | `redirect ${MOBILE_DEEP_LINK_REDIRECT}?error=oauth_failed` | Show "Login failed, try again" |
| `Authorization: Bearer` header malformed | 401 `{error:"invalid_token"}` | Wipe storage, force re-login |
| JWT signature invalid | 401 `{error:"invalid_token"}` | Wipe storage, force re-login |
| JWT expired | 401 `{error:"token_expired"}` | Auto-call `/auth/refresh` |
| Refresh token not found / expired | 401 `{error:"refresh_invalid"}` | Wipe storage, force re-login |
| Refresh token reuse detected | 401 `{error:"refresh_invalid"}` + delete all user's Sessions | Force re-login (session revoked) |
| Cookie session valid AND Bearer present | Bearer wins; cookie ignored | n/a (won't happen in practice) |
| `requireAdmin` denies non-admin Bearer user | 403 `{error:"forbidden"}` | Same as cookie path |
| `state` HMAC fails on callback | redirect to `FRONTEND_URL/?login=failed` (treat as forged) | n/a |

**Errors are surfaced as JSON**, never as HTML. The Flutter HTTP client only needs to parse the `error` string to decide between "refresh", "force re-login", and "show message".

## Security

Items deliberately included:

1. **`JWT_SECRET` required in production** — server `process.exit(1)` at startup if unset. Mirrors the existing `SESSION_SECRET` pattern.
2. **Algorithm pinned to HS256** — `jwt.verify(token, secret, { algorithms: ["HS256"] })`. Defends against `alg: none` and confused-deputy attacks.
3. **Refresh tokens hashed at rest** — SHA-256 in `Session.sessionToken`, constant-time comparison on validate. DB leak does not yield usable tokens.
4. **Rotation + reuse detection** — every refresh issues a new token and deletes the old; reuse of a rotated token revokes the entire user's sessions.
5. **Forensic metadata** — `Session.ipAddress` and `Session.userAgent` recorded at issue, not validated on use.
6. **No OAuth provider tokens in JWT** — payload stays minimal (`{ sub, role, iat, exp }`). Google/Discord tokens stay in `OAuthAccount`.
7. **Per-user rate limits** — `/auth/refresh` (30/min) and `/auth/logout-mobile` (10/min) protect against bruteforce and runaway clients.
8. **Deep link payload contains only opaque tokens** — no email, name, balance, or PII.
9. **HMAC-signed OAuth state** — prevents an attacker from crafting a callback that hijacks the mobile flow into redirecting their tokens to a deep link they own.
10. **Bearer takes precedence over cookie** — explicit caller intent is honored; a leaked or stale cookie cannot piggyback when the client is sending a token.
11. **`/auth/logout-mobile` requires Bearer auth** — anonymous logout calls cannot enumerate or invalidate other users' sessions.

Deliberately deferred (YAGNI for v1):

- Multi-device session listing UI ("see all devices logged in").
- Refresh token family/lineage tracking with explicit chain IDs (simple rotation + reuse detection covers the common case).
- Device fingerprinting (mobile networks make it unreliable).
- App Links / Universal Links migration (additive future step).
- 2FA / step-up auth.

## Testing

Tests follow the existing project conventions: `vitest` + `supertest`, fixtures under `backend/tests/`, Prisma client mocked via `tests/helpers/mockPrisma.js`.

### Unit — `tests/services/tokenService.test.js`

- Sign access token → verify returns the same payload.
- Token past `exp` → verify throws with code `token_expired`.
- Token with tampered signature → verify throws `invalid_token`.
- Token with `alg: none` header → rejected.
- `issueRefreshToken` → inserts a `Session` row with hashed token, correct `expiresAt`.
- `validateRefreshToken` with a valid raw token → returns `{ userId, sessionId }`.
- `validateRefreshToken` with an expired token → returns null.
- `validateRefreshToken` with a token whose row was deleted → returns null.
- `rotateRefreshToken` → old session deleted, new session row exists with different hash.
- Reuse path: presenting a token that was already rotated → all sessions for that user are deleted.

### Integration — `tests/routes/mobileAuth.test.js`

- Web callback (no `platform` in state) → redirects to `FRONTEND_URL`.
- Mobile callback (state.platform === "mobile") → redirects to `rbxroyale://auth?access=…&refresh=…`.
- Forged state (bad HMAC) → redirects to `FRONTEND_URL/?login=failed`, no tokens leaked.
- `POST /auth/refresh` with valid token → 200, returns new pair.
- `POST /auth/refresh` with unknown token → 401 `refresh_invalid`.
- `POST /auth/refresh` with already-rotated token → 401 + DB shows zero `Session` rows for that user.
- `POST /auth/logout-mobile` with valid Bearer + refresh → 200, row deleted.
- `POST /auth/logout-mobile` with stale refresh → still 200 (idempotent).
- `/auth/refresh` rate limit triggers after 30 hits in a window.

### Regression — extends `tests/routes/auth.test.js`

- Existing cookie-based `/auth/me` test still passes unchanged.
- New: cookie-based `/topup/create` still works (no Bearer header).
- New: Bearer-token `/auth/me` returns the same payload as cookie `/auth/me`.
- New: Bearer-token `/topup/create` accepted exactly like the cookie path.
- New: Bearer-token `/admin/products` for a non-admin user → 403 (requireAdmin still strict).
- New: Bearer-token `/admin/products` for an admin user → 200.

### Manual smoke (pre-merge)

- `bun test` — all green.
- `bunx prisma generate` — runs cleanly, schema unchanged.
- `curl` round-trip: hit `/auth/google?platform=mobile`, follow to a stub callback, decode resulting JWT, call `/auth/me` with `Authorization: Bearer …`.

### Out of scope

- Flutter app behavior, secure storage, deep link interception (separate workstream).
- Live Google/Discord OAuth round-trip in CI (mocked at the verify-callback boundary).

## Risks and Trade-offs

| Risk | Trade-off accepted | Mitigation |
| ---- | ------------------ | ---------- |
| JWT cannot be revoked before expiry | 7-day max exposure window if a token leaks | Short-ish access TTL; refresh rotation; reuse detection |
| Custom-scheme deep link can be hijacked by a malicious app | Acceptable for v1 launch | HMAC-signed state, opaque tokens only in URL; can upgrade to App Links later without redesign |
| Two parallel auth paths increase surface area | Both paths are simple and converge at `requireAuth` | Both paths covered by tests; cookie path is unchanged from today |
| Bearer + cookie precedence rule could surprise | Documented; Bearer wins | Tests assert this explicitly |
| Refresh-token reuse signal is best-effort (only fires when we can identify the user) | One free reuse for an attacker | Acceptable; combined with rotation, attacker has at most one valid window |

## Open Questions

None at design time. All decisions are recorded in this document.

## Self-Review Checklist

- [x] Spec coverage: every item raised in brainstorming (token model, TTLs, deep link, mobile vs web detection, rotation, error mapping, tests) is in this document.
- [x] No placeholders, TBDs, or vague requirements.
- [x] Internal consistency: TTLs (7d access / 30d refresh) match across summary, token model, env vars, and API examples.
- [x] Scope is one implementation plan: backend-only, no schema migration, single feature surface.
- [x] No ambiguity: the Bearer-vs-cookie precedence, rotation behavior, and reuse-detection trigger are all spelled out.
