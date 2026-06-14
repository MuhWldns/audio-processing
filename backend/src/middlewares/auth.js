/**
 * Middleware untuk autentikasi dan authorization
 */

import { isOAuthReady } from "../services/authService.js";
import { verifyAccessToken } from "../services/authTokenService.js";
import { prisma } from "../prisma.js";

/**
 * Middleware untuk memastikan OAuth provider sudah dikonfigurasi
 * @param {string} provider - Nama provider ('google' atau 'discord')
 * @returns {Function} Express middleware
 */
export const ensureAuthReady = (provider) => (req, res, next) => {
  if (!isOAuthReady(provider)) {
    return res.status(503).json({
      error: `${provider} auth is not configured`,
    });
  }

  return next();
};

/**
 * Middleware untuk memastikan user sudah login.
 *
 * Accepts either:
 *   1. An `Authorization: Bearer <jwt>` header (mobile / API clients), or
 *   2. A passport cookie session (web).
 *
 * The Bearer path is checked first; on miss it falls through to the cookie
 * session check. Controllers continue to read `req.user.id` and `req.user.role`.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const requireAuth = async (req, res, next) => {
  const header = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match) {
    let payload;
    try {
      payload = verifyAccessToken(match[1]);
    } catch (err) {
      const code = err?.code === "token_expired" ? "token_expired" : "invalid_token";
      return res.status(401).json({ error: code });
    }
    try {
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return res.status(401).json({ error: "invalid_token" });
      req.user = user;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  if (req.isAuthenticated?.() && req.user) {
    return next();
  }

  return res.status(401).json({ error: "Not authenticated" });
};
