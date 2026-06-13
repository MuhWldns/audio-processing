/**
 * Middleware untuk rate limiting
 */

import rateLimit from "express-rate-limit";

/**
 * Konfigurasi rate limiter untuk upload
 * @param {Object} options - Opsi konfigurasi
 * @param {number} options.windowMinutes - Window time dalam menit
 * @param {number} options.maxRequests - Maksimum request dalam window
 * @returns {Object} Rate limiter middleware
 */
export const createUploadLimiter = ({ windowMinutes = 15, maxRequests = 30, keyGenerator, message } = {}) => {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: maxRequests,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: message || { error: "Too many uploads, please try again later." },
    ...(keyGenerator ? { keyGenerator } : {}),
  });
};