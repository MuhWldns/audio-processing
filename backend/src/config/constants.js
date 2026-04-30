/**
 * Application constants
 */

export const DEFAULT_DAILY_FREE_AUDIO_LIMIT = 3;
export const DEFAULT_PAID_AUDIO_TOKEN_COST = 1;
export const DEFAULT_SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 hari

export const ALLOWED_EXTENSIONS = new Set([".wav", ".mp3", ".ogg"]);
export const ALLOWED_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/ogg; codecs=opus",
]);

export const UPLOAD_RATE_LIMIT = {
  WINDOW_MINUTES: 15,
  MAX_REQUESTS: 30,
};

export const AUTH_PROVIDERS = {
  GOOGLE: "GOOGLE",
  DISCORD: "DISCORD",
};

export const ACTIVITY_TYPES = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  AUDIO_UPLOAD: "AUDIO_UPLOAD",
  TOKEN_TOP_UP: "TOKEN_TOP_UP",
  TOKEN_RESERVE: "TOKEN_RESERVE",
  TOKEN_SETTLE: "TOKEN_SETTLE",
  TOKEN_REFUND: "TOKEN_REFUND",
};

export const TOKEN_TRANSACTION_TYPES = {
  TOP_UP: "TOP_UP",
  RESERVE: "RESERVE",
  SETTLE: "SETTLE",
  REFUND: "REFUND",
};