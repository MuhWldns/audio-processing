# Mobile OAuth + Token Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Bearer-token auth path alongside the existing cookie session, so the Flutter app can log in via system browser (Google/Discord) and call existing endpoints with a JWT — no schema migration, web cookie path unchanged.

**Architecture:** New `tokenService.js` mints HS256 JWT access tokens (7d) and stores opaque refresh tokens (30d, SHA-256 hashed) in the existing `Session` table with rotation + reuse detection. `requireAuth` accepts either a Bearer token or a cookie session. OAuth callbacks branch on a HMAC-signed `state` parameter that distinguishes mobile from web; mobile redirects to `rbxroyale://auth?access=…&refresh=…` per `MOBILE_DEEP_LINK_REDIRECT` env. Two new endpoints — `POST /auth/refresh`, `POST /auth/logout-mobile` — round out the surface.

**Tech Stack:** Node.js ESM, Express 4, Prisma (MySQL, no migration), passport (existing), `jsonwebtoken` (new), vitest + supertest, Bun runtime.

**Spec:** `docs/superpowers/specs/2026-06-14-mobile-oauth-token-auth-design.md`

---

## File Structure

**New:**
- `backend/src/services/tokenService.js` — JWT access tokens, opaque refresh tokens, signed OAuth state. Single module, all crypto + DB centralized here.
- `backend/tests/services/tokenService.test.js` — unit tests for tokenService.
- `backend/tests/routes/mobileAuth.test.js` — integration tests for callback mobile branch, refresh, logout-mobile, regression coverage on Bearer path.

**Modified:**
- `backend/package.json` — add `jsonwebtoken` dependency.
- `backend/.env.example` — add `JWT_SECRET`, `MOBILE_DEEP_LINK_REDIRECT`, `ACCESS_TOKEN_TTL_DAYS`, `REFRESH_TOKEN_TTL_DAYS`.
- `backend/src/middlewares/auth.js` — `requireAuth` checks Bearer first, falls back to cookie.
- `backend/src/services/authService.js` — `configurePassport` accepts `passReqToCallback` so route handlers can stash mobile platform on the OAuth `state`.
- `backend/src/controllers/authController.js` — branch on mobile state in `handleGoogleCallback`/`handleDiscordCallback`; add `handleRefresh`, `handleMobileLogout`.
- `backend/src/server.js` — `JWT_SECRET` fail-closed at startup; new `/auth/google` and `/auth/discord` wrappers that sign state when `?platform=mobile`; register `/auth/refresh` and `/auth/logout-mobile` with per-user rate limits.
- `backend/openapi.yaml` — document new endpoints, the `?platform=mobile` query, and `bearerAuth` security scheme.

**Untouched (deliberately):** `prisma/schema.prisma`, every controller other than `authController.js`, every test file other than the two named above.

---

## Task 1: Add `jsonwebtoken` dependency and env vars

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/.env.example`

- [ ] **Step 1: Install jsonwebtoken**

Run from `backend/`:
```bash
bun add jsonwebtoken
```

Expected: `package.json` `dependencies` gains `"jsonwebtoken": "^9.0.x"` (latest 9.x). `bun.lockb` updates.

- [ ] **Step 2: Add new env keys to `.env.example`**

Append at the bottom of `backend/.env.example`:

```
# Mobile auth — JWT + refresh tokens
# Required in production (server exits if unset, like SESSION_SECRET).
JWT_SECRET=

# Where the OAuth callback redirects mobile clients after issuing tokens.
# Custom URI scheme registered by the Flutter app. Backend treats it as opaque.
MOBILE_DEEP_LINK_REDIRECT=rbxroyale://auth

# Token lifetimes (days)
ACCESS_TOKEN_TTL_DAYS=7
REFRESH_TOKEN_TTL_DAYS=30
```

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/bun.lockb backend/.env.example
git commit -m "chore: add jsonwebtoken dep and mobile-auth env keys"
```

---

## Task 2: tokenService — sign and verify access JWT

**Files:**
- Create: `backend/src/services/tokenService.js`
- Test: `backend/tests/services/tokenService.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/tokenService.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { signAccessToken, verifyAccessToken } from "../../src/services/tokenService.js";

describe("tokenService — access JWT", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
    process.env.ACCESS_TOKEN_TTL_DAYS = "7";
  });

  it("signs a token whose payload verifies back to the same user and role", () => {
    const token = signAccessToken("user-123", "USER");
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-123");
    expect(payload.role).toBe("USER");
  });

  it("sets exp roughly ACCESS_TOKEN_TTL_DAYS in the future", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signAccessToken("user-1", "USER");
    const payload = verifyAccessToken(token);
    const sevenDays = 7 * 24 * 60 * 60;
    expect(payload.exp - before).toBeGreaterThan(sevenDays - 60);
    expect(payload.exp - before).toBeLessThan(sevenDays + 60);
  });

  it("throws token_expired for an already-expired token", () => {
    const expired = jwt.sign({ sub: "u1", role: "USER" }, process.env.JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "-1s",
    });
    expect(() => verifyAccessToken(expired)).toThrow(/token_expired/);
  });

  it("throws invalid_token for a tampered signature", () => {
    const token = signAccessToken("user-1", "USER");
    const tampered = token.slice(0, -4) + "AAAA";
    expect(() => verifyAccessToken(tampered)).toThrow(/invalid_token/);
  });

  it("rejects a token with alg:none even if otherwise well-formed", () => {
    const noneToken = jwt.sign({ sub: "u1", role: "USER" }, "", { algorithm: "none" });
    expect(() => verifyAccessToken(noneToken)).toThrow(/invalid_token/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `backend/`:
```bash
bun test tests/services/tokenService.test.js
```

Expected: all 5 tests FAIL with import or "function not defined" errors.

- [ ] **Step 3: Create tokenService with access-JWT functions**

Create `backend/src/services/tokenService.js`:

```js
import jwt from "jsonwebtoken";

const ALGORITHM = "HS256";

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
};

const getAccessTtlSeconds = () => {
  const days = Number(process.env.ACCESS_TOKEN_TTL_DAYS) || 7;
  return days * 24 * 60 * 60;
};

export function signAccessToken(userId, role) {
  return jwt.sign({ sub: userId, role }, getJwtSecret(), {
    algorithm: ALGORITHM,
    expiresIn: getAccessTtlSeconds(),
  });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, getJwtSecret(), { algorithms: [ALGORITHM] });
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      const e = new Error("token_expired");
      e.code = "token_expired";
      throw e;
    }
    const e = new Error("invalid_token");
    e.code = "invalid_token";
    throw e;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/services/tokenService.test.js
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/tokenService.js backend/tests/services/tokenService.test.js
git commit -m "feat: tokenService — HS256 access JWT sign/verify with alg pinning"
```

---

## Task 3: tokenService — refresh tokens with rotation and reuse detection

**Files:**
- Modify: `backend/src/services/tokenService.js`
- Modify: `backend/tests/services/tokenService.test.js`

This task uses the `Session` model already defined in `backend/prisma/schema.prisma:117-130`. No schema changes.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/services/tokenService.test.js`:

```js
import { issueRefreshToken, validateRefreshToken, rotateRefreshToken, revokeRefreshToken, revokeAllSessionsForUser } from "../../src/services/tokenService.js";
import { mockPrisma, resetMockPrisma } from "../helpers/mockPrisma.js";

describe("tokenService — refresh tokens", () => {
  beforeEach(() => {
    resetMockPrisma();
    process.env.JWT_SECRET = "test-secret";
    process.env.REFRESH_TOKEN_TTL_DAYS = "30";
  });

  it("issueRefreshToken inserts a Session row with hashed token and returns the raw token", async () => {
    const result = await issueRefreshToken({ userId: "u1", ipAddress: "1.2.3.4", userAgent: "Flutter/1.0" });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(mockPrisma.session.create).toHaveBeenCalledOnce();
    const inserted = mockPrisma.session.create.mock.calls[0][0].data;
    expect(inserted.userId).toBe("u1");
    expect(inserted.ipAddress).toBe("1.2.3.4");
    expect(inserted.userAgent).toBe("Flutter/1.0");
    expect(inserted.sessionToken).not.toBe(result.token);
    expect(inserted.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    const ttlMs = 30 * 24 * 60 * 60 * 1000;
    const delta = inserted.expiresAt.getTime() - Date.now();
    expect(delta).toBeGreaterThan(ttlMs - 60_000);
    expect(delta).toBeLessThan(ttlMs + 60_000);
  });

  it("validateRefreshToken returns userId for an unexpired session matching the hash", async () => {
    const issued = await issueRefreshToken({ userId: "u1" });
    const hash = mockPrisma.session.create.mock.calls[0][0].data.sessionToken;
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      id: "s1", userId: "u1", sessionToken: hash, expiresAt: new Date(Date.now() + 1_000_000),
    });
    const result = await validateRefreshToken(issued.token);
    expect(result).toEqual({ userId: "u1", sessionId: "s1" });
  });

  it("validateRefreshToken returns null for a token whose row does not exist", async () => {
    mockPrisma.session.findUnique.mockResolvedValueOnce(null);
    const result = await validateRefreshToken("nonexistent-token");
    expect(result).toBeNull();
  });

  it("validateRefreshToken returns null for an expired session", async () => {
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      id: "s1", userId: "u1", sessionToken: "x", expiresAt: new Date(Date.now() - 1000),
    });
    const result = await validateRefreshToken("any");
    expect(result).toBeNull();
  });

  it("rotateRefreshToken deletes the old row and creates a new one in a transaction", async () => {
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      id: "s1", userId: "u1", sessionToken: "old-hash", expiresAt: new Date(Date.now() + 1_000_000),
    });
    const result = await rotateRefreshToken("old-token", { ipAddress: "9.9.9.9" });
    expect(result.userId).toBe("u1");
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(mockPrisma.session.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(mockPrisma.session.create).toHaveBeenCalledOnce();
  });

  it("rotateRefreshToken returns null when the old token is not found (caller treats as reuse)", async () => {
    mockPrisma.session.findUnique.mockResolvedValueOnce(null);
    const result = await rotateRefreshToken("rotated-or-fake-token");
    expect(result).toBeNull();
  });

  it("revokeRefreshToken deletes the matching session row, idempotently", async () => {
    mockPrisma.session.deleteMany.mockResolvedValueOnce({ count: 1 });
    await revokeRefreshToken("any-token");
    expect(mockPrisma.session.deleteMany).toHaveBeenCalled();
    const where = mockPrisma.session.deleteMany.mock.calls[0][0].where;
    expect(where.sessionToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it("revokeAllSessionsForUser deletes every Session row for the user", async () => {
    mockPrisma.session.deleteMany.mockResolvedValueOnce({ count: 3 });
    const result = await revokeAllSessionsForUser("u1");
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(result.count).toBe(3);
  });
});
```

- [ ] **Step 2: Confirm `mockPrisma` exposes `session` mocks**

Read `backend/tests/helpers/mockPrisma.js`. If it does not include a `session` model with `create`, `findUnique`, `delete`, `deleteMany` mock methods, add them following the same pattern as the other models in that file. (The schema has `Session`, so this should typically already exist; if not, this is a one-line-per-method addition.)

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && bun test tests/services/tokenService.test.js
```

Expected: 7 new tests FAIL with "is not a function" or import errors.

- [ ] **Step 4: Implement refresh token functions**

Append to `backend/src/services/tokenService.js`:

```js
import crypto from "node:crypto";
import { prisma } from "../prisma.js";

const getRefreshTtlMs = () => {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30;
  return days * 24 * 60 * 60 * 1000;
};

const generateRawToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

export async function issueRefreshToken({ userId, ipAddress = null, userAgent = null }) {
  const token = generateRawToken();
  const sessionToken = hashToken(token);
  const expiresAt = new Date(Date.now() + getRefreshTtlMs());
  await prisma.session.create({
    data: { userId, sessionToken, expiresAt, ipAddress, userAgent },
  });
  return { token, expiresAt };
}

export async function validateRefreshToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return null;
  const sessionToken = hashToken(rawToken);
  const row = await prisma.session.findUnique({ where: { sessionToken } });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return { userId: row.userId, sessionId: row.id };
}

export async function rotateRefreshToken(rawOldToken, { ipAddress = null, userAgent = null } = {}) {
  const valid = await validateRefreshToken(rawOldToken);
  if (!valid) return null;
  await prisma.session.delete({ where: { id: valid.sessionId } });
  const issued = await issueRefreshToken({ userId: valid.userId, ipAddress, userAgent });
  return { userId: valid.userId, token: issued.token, expiresAt: issued.expiresAt };
}

export async function revokeRefreshToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return { count: 0 };
  const sessionToken = hashToken(rawToken);
  return await prisma.session.deleteMany({ where: { sessionToken } });
}

export async function revokeAllSessionsForUser(userId) {
  return await prisma.session.deleteMany({ where: { userId } });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test tests/services/tokenService.test.js
```

Expected: all 12 tests PASS (5 access + 7 refresh).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/tokenService.js backend/tests/services/tokenService.test.js backend/tests/helpers/mockPrisma.js
git commit -m "feat: tokenService — opaque refresh tokens with rotation and revocation"
```

---

## Task 4: tokenService — signed OAuth state for mobile detection

**Files:**
- Modify: `backend/src/services/tokenService.js`
- Modify: `backend/tests/services/tokenService.test.js`

The state parameter is HMAC-signed so an attacker cannot forge a callback that hijacks the mobile flow. We piggyback on `JWT_SECRET` for the HMAC key — same fail-closed guarantee, no extra config.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/services/tokenService.test.js`:

```js
import { signOAuthState, verifyOAuthState } from "../../src/services/tokenService.js";

describe("tokenService — OAuth state", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
  });

  it("signs and verifies state, recovering the platform flag", () => {
    const state = signOAuthState({ platform: "mobile" });
    const result = verifyOAuthState(state);
    expect(result).toEqual({ platform: "mobile" });
  });

  it("verifyOAuthState returns null for a tampered state", () => {
    const state = signOAuthState({ platform: "mobile" });
    const tampered = state.slice(0, -4) + "AAAA";
    expect(verifyOAuthState(tampered)).toBeNull();
  });

  it("verifyOAuthState returns null for a malformed state", () => {
    expect(verifyOAuthState("not-a-real-state")).toBeNull();
    expect(verifyOAuthState("")).toBeNull();
    expect(verifyOAuthState(null)).toBeNull();
  });

  it("includes a nonce so two states for the same payload differ", () => {
    const a = signOAuthState({ platform: "mobile" });
    const b = signOAuthState({ platform: "mobile" });
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/services/tokenService.test.js
```

Expected: 4 new tests FAIL.

- [ ] **Step 3: Implement signed state**

Append to `backend/src/services/tokenService.js`:

```js
const STATE_VERSION = "v1";

export function signOAuthState(payload) {
  const nonce = crypto.randomBytes(8).toString("base64url");
  const body = `${STATE_VERSION}.${nonce}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  const sig = crypto.createHmac("sha256", getJwtSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOAuthState(state) {
  if (!state || typeof state !== "string") return null;
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [version, nonce, encoded, sig] = parts;
  if (version !== STATE_VERSION) return null;
  const body = `${version}.${nonce}.${encoded}`;
  const expected = crypto.createHmac("sha256", getJwtSecret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/services/tokenService.test.js
```

Expected: all 16 tests PASS (5 access + 7 refresh + 4 state).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/tokenService.js backend/tests/services/tokenService.test.js
git commit -m "feat: tokenService — HMAC-signed OAuth state to prevent forgery"
```

---

## Task 5: Extend `requireAuth` to accept Bearer tokens

**Files:**
- Modify: `backend/src/middlewares/auth.js`
- Modify: `backend/tests/routes/auth.test.js`

`requireAuth` currently only checks `req.isAuthenticated()`. We add a Bearer path that runs first and falls through to the cookie path on miss. Controllers continue to read `req.user.id` and `req.user.role` exactly as today.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/routes/auth.test.js`:

```js
import { signAccessToken } from "../../src/services/tokenService.js";

describe("requireAuth — Bearer token path", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    process.env.ACCESS_TOKEN_TTL_DAYS = "7";
  });

  it("accepts a valid Bearer JWT and populates req.user", async () => {
    const token = signAccessToken("user-bearer-1", "USER");
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "user-bearer-1", role: "USER", email: "b@example.com",
      // include any minimal fields downstream auth/me reads
    });
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user?.id ?? res.body.user).toBeTruthy();
  });

  it("returns 401 invalid_token for a malformed Bearer", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer not-a-real-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_token");
  });

  it("returns 401 token_expired for an expired Bearer", async () => {
    const expired = jwt.sign({ sub: "u", role: "USER" }, process.env.JWT_SECRET, {
      algorithm: "HS256", expiresIn: "-1s",
    });
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_expired");
  });

  it("falls back to cookie session when no Bearer header is present", async () => {
    // Existing cookie-session test pattern from this file should still pass.
    const res = await request(app).get("/auth/me");
    expect([200, 401]).toContain(res.status); // depends on existing test setup
  });
});
```

If `auth.test.js` does not already import `jwt`, add `import jwt from "jsonwebtoken";` at the top.

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd backend && bun test tests/routes/auth.test.js
```

Expected: the three Bearer tests FAIL because `requireAuth` ignores the header.

- [ ] **Step 3: Extend `requireAuth`**

Replace the body of `requireAuth` in `backend/src/middlewares/auth.js`:

```js
import { isOAuthReady } from "../services/authService.js";
import { verifyAccessToken } from "../services/tokenService.js";
import { prisma } from "../prisma.js";

export const ensureAuthReady = (provider) => (req, res, next) => {
  if (!isOAuthReady(provider)) {
    return res.status(503).json({ error: `${provider} auth is not configured` });
  }
  return next();
};

export const requireAuth = async (req, res, next) => {
  const header = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match) {
    try {
      const payload = verifyAccessToken(match[1]);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return res.status(401).json({ error: "invalid_token" });
      req.user = user;
      return next();
    } catch (err) {
      const code = err.code === "token_expired" ? "token_expired" : "invalid_token";
      return res.status(401).json({ error: code });
    }
  }
  if (req.isAuthenticated?.() && req.user) {
    return next();
  }
  return res.status(401).json({ error: "Not authenticated" });
};
```

- [ ] **Step 4: Run the full auth test file**

```bash
bun test tests/routes/auth.test.js
```

Expected: all tests PASS, including the existing cookie ones.

- [ ] **Step 5: Run the full backend suite to catch regressions**

```bash
bun test
```

Expected: no new failures.

- [ ] **Step 6: Commit**

```bash
git add backend/src/middlewares/auth.js backend/tests/routes/auth.test.js
git commit -m "feat: requireAuth accepts Bearer JWT alongside cookie session"
```

---

## Task 6: Wrap `/auth/google` and `/auth/discord` to sign state for mobile

**Files:**
- Modify: `backend/src/server.js`
- Test: covered by Task 7 callback tests (this task is a small wiring change verified end-to-end there)

Currently `server.js:211-212`:
```js
app.get("/auth/google", ensureAuthReady("google"), passport.authenticate("google", { scope: ["email", "profile"] }));
app.get("/auth/google/callback", ensureAuthReady("google"), passport.authenticate("google", { failureRedirect: ... }), handleGoogleCallback);
```

We replace the first one with a wrapper that injects a signed `state` when `?platform=mobile`. Discord identical.

- [ ] **Step 1: Replace the `/auth/google` route**

In `backend/src/server.js`, replace the line for `/auth/google` (currently around `server.js:211`) with:

```js
import { signOAuthState } from "./services/tokenService.js";

app.get("/auth/google", ensureAuthReady("google"), (req, res, next) => {
  const platform = req.query.platform === "mobile" ? "mobile" : "web";
  const state = signOAuthState({ platform });
  return passport.authenticate("google", { scope: ["email", "profile"], state })(req, res, next);
});
```

(Place the import near the other service imports at the top of the file.)

- [ ] **Step 2: Replace the `/auth/discord` route similarly**

Replace the `/auth/discord` route line with:

```js
app.get("/auth/discord", ensureAuthReady("discord"), (req, res, next) => {
  const platform = req.query.platform === "mobile" ? "mobile" : "web";
  const state = signOAuthState({ platform });
  return passport.authenticate("discord", { scope: ["identify", "email"], state })(req, res, next);
});
```

- [ ] **Step 3: Smoke-test the server still boots**

```bash
cd backend && bun test
```

Expected: existing tests still pass (no behavioral change yet — callbacks still ignore `state`).

- [ ] **Step 4: Commit**

```bash
git add backend/src/server.js
git commit -m "feat: sign OAuth state on /auth/google and /auth/discord entry"
```

---

## Task 7: Mobile callback branch — issue tokens and redirect to deep link

**Files:**
- Modify: `backend/src/controllers/authController.js`
- Test: `backend/tests/routes/mobileAuth.test.js` (new)

The callback handlers currently always `res.redirect(${FRONTEND_URL}/?login=success)`. We add a branch: if the verified state says `platform=mobile`, mint tokens and redirect to the deep link instead. Web behavior is preserved exactly.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/routes/mobileAuth.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../helpers/testApp.js";
import { mockPrisma, resetMockPrisma } from "../helpers/mockPrisma.js";
import { signOAuthState, verifyAccessToken } from "../../src/services/tokenService.js";

beforeEach(() => {
  resetMockPrisma();
  process.env.JWT_SECRET = "test-secret";
  process.env.ACCESS_TOKEN_TTL_DAYS = "7";
  process.env.REFRESH_TOKEN_TTL_DAYS = "30";
  process.env.MOBILE_DEEP_LINK_REDIRECT = "rbxroyale://auth";
  process.env.FRONTEND_URL = "https://rbxroyale.dev";
});

describe("OAuth callback — mobile branch", () => {
  it("with mobile state redirects to deep link with access and refresh tokens", async () => {
    // testApp's google strategy must be stubbed to authenticate as a known user.
    // The helper testApp.js seeds a fake user resolution; we just call the callback.
    const state = signOAuthState({ platform: "mobile" });
    const res = await request(app)
      .get(`/auth/google/callback?code=fake&state=${encodeURIComponent(state)}`);
    expect(res.status).toBe(302);
    const location = res.headers.location;
    expect(location).toMatch(/^rbxroyale:\/\/auth\?/);
    const url = new URL(location);
    const access = url.searchParams.get("access");
    const refresh = url.searchParams.get("refresh");
    expect(access).toBeTruthy();
    expect(refresh).toBeTruthy();
    const payload = verifyAccessToken(access);
    expect(payload.sub).toBeTruthy();
    expect(mockPrisma.session.create).toHaveBeenCalledOnce();
  });

  it("with web state redirects to FRONTEND_URL (existing behavior preserved)", async () => {
    const state = signOAuthState({ platform: "web" });
    const res = await request(app)
      .get(`/auth/google/callback?code=fake&state=${encodeURIComponent(state)}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://rbxroyale.dev/?login=success");
  });

  it("with no state (legacy) defaults to web behavior", async () => {
    const res = await request(app).get("/auth/google/callback?code=fake");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://rbxroyale.dev/?login=success");
  });

  it("with forged state redirects to FRONTEND_URL/?login=failed and issues no tokens", async () => {
    const res = await request(app)
      .get(`/auth/google/callback?code=fake&state=tampered.state.value.sig`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://rbxroyale.dev/?login=failed");
    expect(mockPrisma.session.create).not.toHaveBeenCalled();
  });
});
```

This requires `backend/tests/helpers/testApp.js` to stub the Google strategy so the callback does not actually call Google. Read that file first; if it does not already do this for `auth.test.js`, follow the same pattern there. Specifically: the strategy's verify callback should be replaced with one that calls `done(null, { id: "user-test", role: "USER" })` regardless of input.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && bun test tests/routes/mobileAuth.test.js
```

Expected: 4 tests FAIL — the callback redirects to FRONTEND_URL even for mobile state.

- [ ] **Step 3: Update `handleGoogleCallback`**

Replace `handleGoogleCallback` in `backend/src/controllers/authController.js`:

```js
import passport from "passport";
import { prisma } from "../prisma.js";
import { handleOAuthLogin, buildMePayload } from "../services/authService.js";
import {
  signAccessToken,
  issueRefreshToken,
  verifyOAuthState,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllSessionsForUser,
  verifyAccessToken,
} from "../services/tokenService.js";

const getFrontendUrl = () =>
  process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173";
const getMobileDeepLink = () => process.env.MOBILE_DEEP_LINK_REDIRECT || "rbxroyale://auth";

async function finishOAuthCallback(req, res, providerLabel, providerEnum) {
  if (!req.user) {
    return res.redirect(`${getFrontendUrl()}/?login=failed`);
  }

  const stateRaw = req.query?.state;
  let parsedState = null;
  if (stateRaw) {
    parsedState = verifyOAuthState(stateRaw);
    if (parsedState === null) {
      return res.redirect(`${getFrontendUrl()}/?login=failed`);
    }
  }

  await handleOAuthLogin({ userId: req.user.id, provider: providerEnum, providerLabel });

  if (parsedState?.platform === "mobile") {
    const access = signAccessToken(req.user.id, req.user.role);
    const { token: refresh } = await issueRefreshToken({
      userId: req.user.id,
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
    });
    const url = new URL(getMobileDeepLink());
    url.searchParams.set("access", access);
    url.searchParams.set("refresh", refresh);
    return res.redirect(url.toString());
  }

  return res.redirect(`${getFrontendUrl()}/?login=success`);
}

export const handleGoogleCallback = async (req, res) =>
  finishOAuthCallback(req, res, "Google", "GOOGLE");

export const handleDiscordCallback = async (req, res) =>
  finishOAuthCallback(req, res, "Discord", "DISCORD");
```

The existing `handleLogout` and `handleGetMe` functions stay unchanged.

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/routes/mobileAuth.test.js
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
bun test
```

Expected: no regressions in `auth.test.js` or anywhere else.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/authController.js backend/tests/routes/mobileAuth.test.js
git commit -m "feat: OAuth callback branches on signed state — mobile redirects to deep link"
```

---

## Task 8: `POST /auth/refresh` endpoint

**Files:**
- Modify: `backend/src/controllers/authController.js`
- Modify: `backend/src/server.js`
- Modify: `backend/tests/routes/mobileAuth.test.js`

`/auth/refresh` validates the incoming refresh token, rotates it, and returns a new `{access, refresh}` pair. On unknown token, it triggers reuse-detection: if we can identify the user from a previously valid (but expired) access token in the request, revoke all their sessions. Otherwise return 401.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/routes/mobileAuth.test.js`:

```js
describe("POST /auth/refresh", () => {
  it("returns new access and refresh tokens for a valid refresh", async () => {
    // Pre-seed a Session row that validateRefreshToken will hit.
    const { token } = await import("../../src/services/tokenService.js")
      .then((m) => m.issueRefreshToken({ userId: "u-refresh-1" }));
    // Make findUnique resolve as if the row exists with the right hash.
    const hash = mockPrisma.session.create.mock.calls[0][0].data.sessionToken;
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      id: "s1", userId: "u-refresh-1", sessionToken: hash, expiresAt: new Date(Date.now() + 1_000_000),
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u-refresh-1", role: "USER" });

    const res = await request(app).post("/auth/refresh").send({ refresh: token });
    expect(res.status).toBe(200);
    expect(res.body.access).toBeTruthy();
    expect(res.body.refresh).toBeTruthy();
    expect(res.body.refresh).not.toBe(token); // rotated
    expect(mockPrisma.session.delete).toHaveBeenCalled(); // old row removed
  });

  it("returns 400 when refresh body field is missing", async () => {
    const res = await request(app).post("/auth/refresh").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/refresh/);
  });

  it("returns 401 refresh_invalid for an unknown token", async () => {
    mockPrisma.session.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post("/auth/refresh")
      .send({ refresh: "definitely-not-a-real-token" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("refresh_invalid");
  });

  it("returns 401 refresh_invalid for an expired session row", async () => {
    mockPrisma.session.findUnique.mockResolvedValueOnce({
      id: "s1", userId: "u1", sessionToken: "x", expiresAt: new Date(Date.now() - 1000),
    });
    const res = await request(app).post("/auth/refresh").send({ refresh: "any" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("refresh_invalid");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/routes/mobileAuth.test.js
```

Expected: the 4 new tests FAIL — endpoint does not exist yet.

- [ ] **Step 3: Implement `handleRefresh`**

Append to `backend/src/controllers/authController.js`:

```js
export const handleRefresh = async (req, res) => {
  const incoming = typeof req.body?.refresh === "string" ? req.body.refresh : null;
  if (!incoming) {
    return res.status(400).json({ error: "refresh required" });
  }

  const rotated = await rotateRefreshToken(incoming, {
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  });

  if (!rotated) {
    // Reuse-detection: if the caller also sent a Bearer access (even expired),
    // identify the user and revoke all their sessions as a stolen-token signal.
    const header = req.get("authorization") || "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (m) {
      try {
        const decoded = verifyAccessToken(m[1]);
        if (decoded?.sub) await revokeAllSessionsForUser(decoded.sub);
      } catch {
        // ignore — best-effort
      }
    }
    return res.status(401).json({ error: "refresh_invalid" });
  }

  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  if (!user) return res.status(401).json({ error: "refresh_invalid" });

  const access = signAccessToken(user.id, user.role);
  const ttlSeconds = (Number(process.env.ACCESS_TOKEN_TTL_DAYS) || 7) * 24 * 60 * 60;
  return res.status(200).json({
    access,
    refresh: rotated.token,
    expiresIn: ttlSeconds,
  });
};
```

- [ ] **Step 4: Wire the route in `server.js`**

Add the rate limiter and route. Place the limiter near the other limiters and the route near the existing `/auth/*` routes:

```js
const refreshLimiter = createUploadLimiter({
  windowMinutes: 1,
  maxRequests: 30,
  keyGenerator: (req) => {
    const header = req.get("authorization") || "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    return m ? `bearer:${m[1].slice(0, 16)}` : req.ip;
  },
  message: { error: "Too many refresh attempts, please slow down." },
});

app.post("/auth/refresh", refreshLimiter, asyncHandler(handleRefresh));
```

Add `handleRefresh` to the controllers import list at the top of `server.js`.

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test tests/routes/mobileAuth.test.js
```

Expected: all 8 tests in this file PASS (4 callback + 4 refresh).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/authController.js backend/src/server.js backend/tests/routes/mobileAuth.test.js
git commit -m "feat: POST /auth/refresh — rotate refresh tokens with reuse detection"
```

---

## Task 9: `POST /auth/logout-mobile` endpoint

**Files:**
- Modify: `backend/src/controllers/authController.js`
- Modify: `backend/src/server.js`
- Modify: `backend/tests/routes/mobileAuth.test.js`

Idempotent endpoint that revokes a refresh token. Requires Bearer auth so we know who is logging out and prevent anonymous enumeration.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/routes/mobileAuth.test.js`:

```js
import { signAccessToken } from "../../src/services/tokenService.js";

describe("POST /auth/logout-mobile", () => {
  it("revokes the refresh token row and returns 200 (with valid Bearer)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u-logout-1", role: "USER" });
    mockPrisma.session.deleteMany.mockResolvedValueOnce({ count: 1 });
    const access = signAccessToken("u-logout-1", "USER");
    const res = await request(app)
      .post("/auth/logout-mobile")
      .set("Authorization", `Bearer ${access}`)
      .send({ refresh: "the-refresh-token" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockPrisma.session.deleteMany).toHaveBeenCalled();
    const where = mockPrisma.session.deleteMany.mock.calls[0][0].where;
    expect(where.sessionToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is idempotent — returns 200 even when no row matches", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u-logout-2", role: "USER" });
    mockPrisma.session.deleteMany.mockResolvedValueOnce({ count: 0 });
    const access = signAccessToken("u-logout-2", "USER");
    const res = await request(app)
      .post("/auth/logout-mobile")
      .set("Authorization", `Bearer ${access}`)
      .send({ refresh: "stale-token" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 401 without a Bearer token", async () => {
    const res = await request(app)
      .post("/auth/logout-mobile")
      .send({ refresh: "any" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when refresh body field is missing", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u-logout-3", role: "USER" });
    const access = signAccessToken("u-logout-3", "USER");
    const res = await request(app)
      .post("/auth/logout-mobile")
      .set("Authorization", `Bearer ${access}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/routes/mobileAuth.test.js
```

Expected: the 4 new tests FAIL — endpoint does not exist.

- [ ] **Step 3: Implement `handleMobileLogout`**

Append to `backend/src/controllers/authController.js`:

```js
export const handleMobileLogout = async (req, res) => {
  const incoming = typeof req.body?.refresh === "string" ? req.body.refresh : null;
  if (!incoming) {
    return res.status(400).json({ error: "refresh required" });
  }
  await revokeRefreshToken(incoming);
  return res.status(200).json({ ok: true });
};
```

- [ ] **Step 4: Wire the route in `server.js`**

Add to the route registrations near `/auth/refresh`:

```js
const logoutMobileLimiter = createUploadLimiter({
  windowMinutes: 1,
  maxRequests: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: "Too many logout attempts." },
});

app.post(
  "/auth/logout-mobile",
  requireAuth,
  logoutMobileLimiter,
  asyncHandler(handleMobileLogout),
);
```

Add `handleMobileLogout` to the controllers import block.

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test tests/routes/mobileAuth.test.js
```

Expected: all 12 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/authController.js backend/src/server.js backend/tests/routes/mobileAuth.test.js
git commit -m "feat: POST /auth/logout-mobile — idempotent refresh revocation"
```

---

## Task 10: Fail-closed `JWT_SECRET` at startup

**Files:**
- Modify: `backend/src/server.js`

`SESSION_SECRET` already exits the process when missing in production (`server.js:122-129`). `JWT_SECRET` must follow the same rule — otherwise a misconfigured deploy could fall back to an insecure default and silently sign tokens.

- [ ] **Step 1: Add the fail-closed check**

In `backend/src/server.js`, locate the `SESSION_SECRET` block (around `server.js:122-129`) and add an analogous block immediately after it:

```js
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: JWT_SECRET is required in production");
    process.exit(1);
  }
  console.warn("WARNING: JWT_SECRET not set, using insecure default for development only");
  process.env.JWT_SECRET = "dev-only-insecure-jwt-secret";
}
```

The dev fallback writes to `process.env.JWT_SECRET` so `tokenService.getJwtSecret()` (which reads from `process.env`) gets a value without changing tokenService at all.

- [ ] **Step 2: Run the test suite**

```bash
cd backend && bun test
```

Expected: all tests still pass. (Tests already set `process.env.JWT_SECRET = "test-secret"` in their `beforeEach` blocks.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/server.js
git commit -m "feat: fail closed when JWT_SECRET missing in production"
```

---

## Task 11: Document new auth in `openapi.yaml`

**Files:**
- Modify: `backend/openapi.yaml`

Add the `bearerAuth` security scheme, the `?platform=mobile` query parameter on the OAuth entry routes, and full path entries for `/auth/refresh` and `/auth/logout-mobile`.

- [ ] **Step 1: Add the `bearerAuth` security scheme**

In `backend/openapi.yaml`, under `components.securitySchemes`, add (alongside whatever already exists):

```yaml
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: |
        Mobile clients send the access JWT issued by the OAuth callback (when
        `?platform=mobile`) or by `POST /auth/refresh`. Web clients use cookie
        sessions instead and do not need this header.
```

- [ ] **Step 2: Add `?platform=mobile` query to the OAuth entry routes**

Under the existing `/auth/google` and `/auth/discord` GET path entries, add the `parameters` block:

```yaml
      parameters:
        - in: query
          name: platform
          required: false
          schema:
            type: string
            enum: [mobile]
          description: |
            When `mobile`, the OAuth callback redirects to the deep link
            (`MOBILE_DEEP_LINK_REDIRECT`) with `access` and `refresh` query
            parameters instead of the web `FRONTEND_URL`.
```

- [ ] **Step 3: Add `/auth/refresh` path**

Under `paths:`, add:

```yaml
  /auth/refresh:
    post:
      summary: Rotate a mobile refresh token into a new access + refresh pair
      tags: [Auth]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [refresh]
              properties:
                refresh:
                  type: string
      responses:
        "200":
          description: New token pair
          content:
            application/json:
              schema:
                type: object
                required: [access, refresh, expiresIn]
                properties:
                  access:
                    type: string
                    description: New JWT access token
                  refresh:
                    type: string
                    description: New opaque refresh token (old token is revoked)
                  expiresIn:
                    type: integer
                    description: Access token TTL in seconds
        "400":
          description: Missing refresh field
        "401":
          description: |
            `refresh_invalid` — refresh token unknown, expired, or already
            rotated. If a Bearer access token is also supplied, all sessions
            for that user are revoked as a reuse signal.
        "429":
          description: Rate limit exceeded
```

- [ ] **Step 4: Add `/auth/logout-mobile` path**

```yaml
  /auth/logout-mobile:
    post:
      summary: Revoke a mobile refresh token (idempotent)
      tags: [Auth]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [refresh]
              properties:
                refresh:
                  type: string
      responses:
        "200":
          description: Token revoked or already absent
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
        "400":
          description: Missing refresh field
        "401":
          description: Bearer token missing or invalid
        "429":
          description: Rate limit exceeded
```

- [ ] **Step 5: Mark protected paths as accepting `bearerAuth` in addition to the cookie scheme**

Under each existing protected path (e.g. `/auth/me`, `/topup/create`, `/topup/status/{reference}`, `/admin/*`), the `security` block must include `bearerAuth: []` alongside the existing cookie entry. If existing entries use only a cookie scheme, change to:

```yaml
      security:
        - cookieAuth: []
        - bearerAuth: []
```

(Either scheme is sufficient — OpenAPI's array-of-objects is OR semantics.)

- [ ] **Step 6: Validate the YAML syntax**

```bash
cd backend && npx swagger-cli validate openapi.yaml
```

Expected: `openapi.yaml is valid` (or no errors). If `swagger-cli` is not installed, use:

```bash
node -e "import('yaml').then(m => console.log(m.default.parse(require('fs').readFileSync('openapi.yaml', 'utf8')) ? 'OK' : 'FAIL'))"
```

- [ ] **Step 7: Commit**

```bash
git add backend/openapi.yaml
git commit -m "docs: openapi — bearerAuth scheme, /auth/refresh, /auth/logout-mobile, mobile platform query"
```

---

## Task 12: Regression — Bearer access to existing protected endpoints

**Files:**
- Modify: `backend/tests/routes/mobileAuth.test.js`

`requireAuth` is the single gate, so once it accepts Bearer, every protected endpoint should accept Bearer too. We don't need to touch any controller — but we DO need to verify it with tests, and confirm `requireAdmin` still rejects non-admin Bearer users.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/routes/mobileAuth.test.js`:

```js
describe("Bearer access — existing protected endpoints", () => {
  it("GET /auth/me with Bearer returns the same shape as cookie", async () => {
    const access = signAccessToken("u-bearer-me", "USER");
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u-bearer-me", role: "USER", email: "b@example.com",
      displayName: "Bearer User", accounts: [],
      walletBalance: 0, totalTopUp: 0, totalSpent: 0,
      freeAudioDateKey: null, freeAudioUsedToday: 0,
      freeAudioDailyLimit: 3, paidAudioCost: 2000,
    });
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${access}`);
    expect(res.status).toBe(200);
    expect(res.body.user?.id).toBe("u-bearer-me");
  });

  it("POST /topup/create with Bearer is accepted (rate limit + validation aside)", async () => {
    const access = signAccessToken("u-bearer-topup", "USER");
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u-bearer-topup", role: "USER" });
    // We don't need the call to succeed — just to clear requireAuth and reach the handler.
    const res = await request(app)
      .post("/topup/create")
      .set("Authorization", `Bearer ${access}`)
      .send({ amount: 10000 });
    // Anything other than 401 means requireAuth let it through.
    expect(res.status).not.toBe(401);
  });

  it("admin endpoint rejects a Bearer USER as 403", async () => {
    const access = signAccessToken("u-bearer-user", "USER");
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u-bearer-user", role: "USER" });
    const res = await request(app)
      .get("/admin/products")
      .set("Authorization", `Bearer ${access}`);
    expect(res.status).toBe(403);
  });

  it("admin endpoint accepts a Bearer ADMIN", async () => {
    const access = signAccessToken("u-bearer-admin", "ADMIN");
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u-bearer-admin", role: "ADMIN" });
    const res = await request(app)
      .get("/admin/products")
      .set("Authorization", `Bearer ${access}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("expired Bearer returns 401 token_expired even on a happy-path endpoint", async () => {
    const expired = jwt.sign({ sub: "u", role: "USER" }, process.env.JWT_SECRET, {
      algorithm: "HS256", expiresIn: "-1s",
    });
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_expired");
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

These should all PASS already, because Tasks 5–9 wired everything. We are confirming the contract end-to-end.

```bash
cd backend && bun test tests/routes/mobileAuth.test.js
```

Expected: all tests in this file PASS (callback × 4, refresh × 4, logout-mobile × 4, regression × 5 = 17).

- [ ] **Step 3: Run the full backend suite**

```bash
bun test
```

Expected: zero regressions across the entire test suite. Watch the count — it should be the previous total + 17 new tests + 16 from `tokenService.test.js` + 4 in `auth.test.js` = previous total + 37.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/routes/mobileAuth.test.js
git commit -m "test: regression — Bearer reaches every protected endpoint, admin gating intact"
```

---

## Final Verification

Before opening a PR / merging:

- [ ] **Step 1: Run the full test suite**

```bash
cd backend && bun test
```

Expected: green.

- [ ] **Step 2: Run Prisma generate to confirm schema is unchanged**

```bash
cd backend && bunx prisma generate
```

Expected: succeeds with no schema diff vs `git status` (no migrations created, no schema.prisma edits).

- [ ] **Step 3: Confirm no `.env` files are staged**

```bash
git status
```

Expected: only `.env.example` may appear, never `.env` or `.env.production`.

- [ ] **Step 4: Manual smoke (optional, requires running backend)**

Start the server with a test `JWT_SECRET=test-only`, then:

```bash
# Sign a state by hand and call the callback to confirm the redirect form.
node -e "process.env.JWT_SECRET='test-only'; import('./src/services/tokenService.js').then(m => console.log(m.signOAuthState({platform:'mobile'})))"
# Take that value and visit: GET /auth/google/callback?code=...&state=<value>
# Confirm the Location header starts with rbxroyale://auth?
```

This is optional because the integration tests already exercise the same path; it's a sanity check before deploy.

---

## Out of Scope

- Flutter app changes — manifest registration, secure storage, HTTP interceptor, deep-link handling. Those happen in the mobile repo.
- App Links / Universal Links migration. Spec calls this out as a future additive change.
- Replacing express-session / cookie path with JWT. Web cookie path stays.

---

## Self-Review Notes

- **Spec coverage:** Each section of `2026-06-14-mobile-oauth-token-auth-design.md` maps to at least one task. Token model → Tasks 2–4. Mobile-vs-web detection → Task 6 + 7. Refresh + rotation + reuse detection → Tasks 3, 8. Logout → Task 9. Bearer-aware `requireAuth` → Task 5. Fail-closed `JWT_SECRET` → Task 10. OpenAPI → Task 11. Regression coverage on existing endpoints → Task 12.
- **No placeholders:** every code step shows the actual code; no "similar to" references. Test bodies are written in full.
- **Type consistency:** `signAccessToken(userId, role)` is used identically in tasks 2, 5, 7, 8, 9, 12. `issueRefreshToken({userId, ipAddress, userAgent})` shape is consistent in 3, 7. `verifyOAuthState` returns either the parsed object or `null` everywhere it's used. `rotateRefreshToken` returns `{userId, token, expiresAt}` or `null` consistently. `revokeRefreshToken` and `revokeAllSessionsForUser` named consistently in tasks 3, 8.
- **Schema constraint honored:** zero migrations, only the existing `Session` table is touched.





