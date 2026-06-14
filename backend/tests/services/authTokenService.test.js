import { describe, it, expect, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { mockPrisma, resetAllMocks } from "../helpers/mockPrisma.js";
import { signAccessToken, verifyAccessToken, issueRefreshToken, validateRefreshToken, rotateRefreshToken, revokeRefreshToken, revokeAllSessionsForUser } from "../../src/services/authTokenService.js";

describe("authTokenService — access JWT", () => {
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

describe("authTokenService — refresh tokens", () => {
  beforeEach(() => {
    resetAllMocks();
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

  it("rotateRefreshToken deletes the old row and creates a new one", async () => {
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
