import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { prisma } from "../prisma.js";

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

const getRefreshTtlMs = () => {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30;
  return days * 24 * 60 * 60 * 1000;
};

const generateRawToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

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
  const token = generateRawToken();
  const sessionToken = hashToken(token);
  const expiresAt = new Date(Date.now() + getRefreshTtlMs());
  try {
    await prisma.$transaction([
      prisma.session.delete({ where: { id: valid.sessionId } }),
      prisma.session.create({ data: { userId: valid.userId, sessionToken, expiresAt, ipAddress, userAgent } }),
    ]);
  } catch (err) {
    // Concurrent rotation: another request already deleted this session.
    if (err?.code === "P2025") return null;
    throw err;
  }
  return { userId: valid.userId, token, expiresAt };
}

export async function revokeRefreshToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return { count: 0 };
  const sessionToken = hashToken(rawToken);
  return await prisma.session.deleteMany({ where: { sessionToken } });
}

export async function revokeAllSessionsForUser(userId) {
  return await prisma.session.deleteMany({ where: { userId } });
}

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
