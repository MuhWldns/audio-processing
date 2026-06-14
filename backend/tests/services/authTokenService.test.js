import { describe, it, expect, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { signAccessToken, verifyAccessToken } from "../../src/services/authTokenService.js";

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
