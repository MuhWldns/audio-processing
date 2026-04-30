/**
 * Middleware untuk autentikasi dan authorization
 */

import { isOAuthReady } from "../services/authService.js";

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
 * Middleware untuk memastikan user sudah login
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const requireAuth = (req, res, next) => {
  if (req.isAuthenticated?.() && req.user) {
    return next();
  }

  return res.status(401).json({ error: "Not authenticated" });
};