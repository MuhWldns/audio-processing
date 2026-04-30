/**
 * Middleware untuk validasi file upload
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Konfigurasi file upload yang diperbolehkan
 */
export const ALLOWED_EXTENSIONS = new Set([".wav", ".mp3", ".ogg"]);
export const ALLOWED_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/ogg; codecs=opus",
]);

/**
 * Middleware untuk validasi API key upload
 * @param {string} apiKey - API key yang valid
 * @returns {Function} Express middleware
 */
export const validateApiKey = (apiKey) => (req, res, next) => {
  const providedKey = req.header("x-api-key");
  if (!apiKey || providedKey !== apiKey) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
};

/**
 * Middleware untuk validasi file audio
 * @param {Object} options - Opsi konfigurasi
 * @param {Set<string>} options.allowedExtensions - Ekstensi yang diperbolehkan
 * @param {Set<string>} options.allowedMimeTypes - MIME types yang diperbolehkan
 * @returns {Function} Express middleware
 */
export const validateAudioFile = ({ allowedExtensions = ALLOWED_EXTENSIONS, allowedMimeTypes = ALLOWED_MIME_TYPES } = {}) => (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "Missing file" });
  }

  const extension = path.extname(req.file.originalname).toLowerCase();
  const isAllowed = allowedExtensions.has(extension) && allowedMimeTypes.has(req.file.mimeType || req.file.mimetype);

  if (!isAllowed) {
    // Clean up uploaded file if invalid
    if (req.file.path && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => undefined);
    }
    return res.status(400).json({ error: "Unsupported file type" });
  }

  next();
};