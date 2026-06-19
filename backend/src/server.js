import path from "node:path";
import fs from "node:fs";
import { startAutoCanceler } from "./services/mustika/reconcile.js";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";

// Config
import { configurePassport } from "./services/authService.js";

// Middlewares
import { ensureAuthReady, requireAuth, optionalAuth, createUploadLimiter, validateApiKey, validateAudioFile, requireAdmin, asyncHandler } from "./middlewares/index.js";
import { configureMulter } from "./services/uploadService.js";
import { signOAuthState, parseBearerToken } from "./services/authTokenService.js";
import { validate } from "./validators/index.js";
import {
  createTopUpSchema,
  addToCartSchema,
  createProductSchema,
  updateProductSchema,
  createCategorySchema,
  updateCategorySchema,
  addProductFileSchema,
  updateLicenseStatusSchema,
  addGameWhitelistSchema,
  verifyLicenseSchema,
} from "./validators/schemas.js";

// Controllers
import {
  handleGoogleCallback,
  handleDiscordCallback,
  redirectOAuthFailure,
  handleLogout,
  handleGetMe,
  handleRefresh,
  handleMobileLogout,
  handleUpload,
  handleGetHistory,
  handleDownloadHistory,
  handleHealthCheck,
  handleDbHealthCheck,
  handleCreateTopUp,
  handleGetTopUpStatus,
  handleManualCheckTopUp,
  handleMustikaWebhook,
  handleGetProducts,
  handleGetProductDetail,
  handleGetCategories,
  handleGetCart,
  handleAddToCart,
  handleRemoveFromCart,
  handleClearCart,
  handleCheckout,
  handleGetLicenses,
  handleGetLicenseDetail,
  handleAddGameToWhitelist,
  handleRemoveGameFromWhitelist,
  handleDownloadLicenseFiles,
  handleVerifyLicense,
  handleDevLogin,
  handleAdminCreateProduct,
  handleAdminUpdateProduct,
  handleAdminDeleteProduct,
  handleAdminListProducts,
  handleAdminCreateCategory,
  handleAdminUpdateCategory,
  handleAdminDeleteCategory,
  handleAdminListLicenses,
  handleAdminUpdateLicenseStatus,
  handleAdminAnalytics,
  handleAdminAddProductFile,
  handleAdminDeleteProductFile,
  handleAdminActiveLicenses,
  handleAdminLicenseLogs,
  handleAdminKillSwitch,
  handleGetUserTransactions,
  handleAdminListUsers,
  handleAdminChangeUserRole,
  handleAdminAdjustUserBalance,
  handleSetRobloxUserId,
  handleLicenseHandshake,
  handleLicenseHeartbeat,
  handleLicenseEnforce,
} from "./controllers/index.js";

import multer from "multer";

// Config
import { UPLOAD_RATE_LIMIT, DEFAULT_SESSION_MAX_AGE } from "./config/index.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env files from backend root (works regardless of current working directory)
// Precedence:
// 1) host environment variables
// 2) .env.{NODE_ENV} (if present)
// 3) .env (fills missing)
const projectRoot = path.resolve(__dirname, "..");
const requestedNodeEnv = process.env.NODE_ENV || "development";

const envSpecificPath = path.join(projectRoot, `.env.${requestedNodeEnv}`);
if (fs.existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath });
}

const baseEnvPath = path.join(projectRoot, ".env");
// Treat `.env` as local-dev convenience; avoid pulling it in for production.
if (requestedNodeEnv !== "production" && fs.existsSync(baseEnvPath)) {
  dotenv.config({ path: baseEnvPath });
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = requestedNodeEnv;
}

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;

// Environment variables
const apiKey = process.env.UPLOAD_API_KEY || "";
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: SESSION_SECRET is required in production");
    process.exit(1);
  }
  console.warn("WARNING: SESSION_SECRET not set, using insecure default for development only");
}
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: JWT_SECRET is required in production");
    process.exit(1);
  }
  console.warn("WARNING: JWT_SECRET not set, using insecure default for development only");
  process.env.JWT_SECRET = "dev-only-insecure-jwt-secret";
}
const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173";
const uploadDir = path.join(__dirname, "..", "uploads");

// Configure passport
configurePassport();

// Configure multer
const upload = configureMulter(uploadDir);

// Configure rate limiter
const uploadLimiter = createUploadLimiter({
  windowMinutes: process.env.UPLOAD_RATE_WINDOW_MIN ? Number(process.env.UPLOAD_RATE_WINDOW_MIN) : UPLOAD_RATE_LIMIT.WINDOW_MINUTES,
  maxRequests: process.env.UPLOAD_RATE_LIMIT ? Number(process.env.UPLOAD_RATE_LIMIT) : UPLOAD_RATE_LIMIT.MAX_REQUESTS,
});

// Rate limiter for license verification (stricter)
const verifyLicenseLimiter = createUploadLimiter({
  windowMinutes: 1,
  maxRequests: 30,
});

// Rate limiter for checkout (per-user)
const checkoutLimiter = createUploadLimiter({
  windowMinutes: 1,
  maxRequests: 5,
});

// Rate limiter for top-up creation
const topupLimiter = createUploadLimiter({
  windowMinutes: 1,
  maxRequests: 5,
});

// Rate limiter for top-up status checks (per-user, not per-IP, so users behind a
// shared NAT don't block each other). Generous enough for the 3s frontend poll
// plus the "Saya sudah bayar" button, but caps hammering that would trigger
// repeated outbound MustikaPay calls / credit writes.
const topupStatusLimiter = createUploadLimiter({
  windowMinutes: 1,
  maxRequests: 40,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: "Too many status checks, please slow down." },
});

// Rate limiter for /auth/refresh. Keyed by Bearer token prefix when present
// (so distinct mobile clients on a shared NAT don't block each other), falling
// back to req.ip otherwise.
const refreshLimiter = createUploadLimiter({
  windowMinutes: 1,
  maxRequests: 30,
  keyGenerator: (req) => {
    const token = parseBearerToken(req);
    return token ? `bearer:${token.slice(0, 16)}` : req.ip;
  },
  message: { error: "Too many refresh attempts, please slow down." },
});

// Rate limiter for /auth/logout-mobile. Keyed per-user (requireAuth runs first
// and populates req.user), falling back to req.ip for the unauth case.
const logoutMobileLimiter = createUploadLimiter({
  windowMinutes: 1,
  maxRequests: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: "Too many logout attempts." },
});

// Memory-based multer for admin file uploads (goes to B2, not local disk)
const adminFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// Middleware setup
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(
  session({
    secret: sessionSecret || "dev-only-insecure-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: DEFAULT_SESSION_MAX_AGE,
      domain: process.env.COOKIE_DOMAIN || undefined,
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// ==================== ROUTES ====================

// Auth routes
app.get("/auth/google", ensureAuthReady("google"), (req, res, next) => {
  const platform = req.query.platform === "mobile" ? "mobile" : "web";
  const state = signOAuthState({ platform });
  return passport.authenticate("google", { scope: ["email", "profile"], state })(req, res, next);
});
app.get("/auth/google/callback", ensureAuthReady("google"), (req, res, next) => {
  passport.authenticate("google", (err, user) => {
    if (err) return next(err);
    if (!user) return redirectOAuthFailure(req, res);
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      return handleGoogleCallback(req, res);
    });
  })(req, res, next);
});

app.get("/auth/discord", ensureAuthReady("discord"), (req, res, next) => {
  const platform = req.query.platform === "mobile" ? "mobile" : "web";
  const state = signOAuthState({ platform });
  return passport.authenticate("discord", { scope: ["identify", "email"], state })(req, res, next);
});
app.get("/auth/discord/callback", ensureAuthReady("discord"), (req, res, next) => {
  passport.authenticate("discord", (err, user) => {
    if (err) return next(err);
    if (!user) return redirectOAuthFailure(req, res);
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      return handleDiscordCallback(req, res);
    });
  })(req, res, next);
});

app.post("/auth/logout", requireAuth, handleLogout);
app.get("/auth/me", optionalAuth, handleGetMe);
app.post("/auth/refresh", refreshLimiter, asyncHandler(handleRefresh));
app.post("/auth/logout-mobile", requireAuth, logoutMobileLimiter, asyncHandler(handleMobileLogout));

// Upload routes
app.post("/upload", requireAuth, uploadLimiter, validateApiKey(apiKey), upload.single("file"), validateAudioFile(), handleUpload);

// History routes
app.get("/history", requireAuth, handleGetHistory);
app.get("/history/:id/download", requireAuth, handleDownloadHistory);

// User routes (protected)
app.get("/user/transactions", requireAuth, handleGetUserTransactions);
app.put("/user/roblox-id", requireAuth, handleSetRobloxUserId);

// Top up routes
app.post("/topup/create", requireAuth, topupLimiter, validate(createTopUpSchema), asyncHandler(handleCreateTopUp));
app.get("/topup/status/:reference", requireAuth, topupStatusLimiter, asyncHandler(handleGetTopUpStatus));
app.post("/topup/check/:reference", requireAuth, topupStatusLimiter, asyncHandler(handleManualCheckTopUp));
app.post("/webhooks/mustika", handleMustikaWebhook);

// Health check routes
app.get("/health", handleHealthCheck);
app.get("/db-health", handleDbHealthCheck);

// Dev-only routes (only in development, not staging/production)
if (process.env.NODE_ENV === "development") {
  app.post("/auth/dev-login", handleDevLogin);
}

// ==================== STORE ROUTES ====================

// Product routes (public)
app.get("/products", handleGetProducts);
app.get("/products/categories", handleGetCategories);
app.get("/products/:idOrSlug", handleGetProductDetail);

// Cart routes (protected)
app.get("/cart", requireAuth, handleGetCart);
app.post("/cart/add", requireAuth, validate(addToCartSchema), handleAddToCart);
app.delete("/cart/:itemId", requireAuth, handleRemoveFromCart);
app.delete("/cart", requireAuth, handleClearCart);

// Checkout route (protected, rate limited)
app.post("/checkout", requireAuth, checkoutLimiter, handleCheckout);

// License management routes (protected)
app.get("/licenses", requireAuth, handleGetLicenses);
app.get("/licenses/:id", requireAuth, handleGetLicenseDetail);
app.post("/licenses/:id/whitelist", requireAuth, validate(addGameWhitelistSchema), handleAddGameToWhitelist);
app.delete("/licenses/:id/whitelist/:gameWhitelistId", requireAuth, handleRemoveGameFromWhitelist);
app.get("/licenses/:id/download", requireAuth, handleDownloadLicenseFiles);

// License verification (public - called from Roblox games, rate limited)
app.post("/api/verify-license", verifyLicenseLimiter, validate(verifyLicenseSchema), handleVerifyLicense);

// License enforcement (public - called from Roblox asset module, rate limited)
const licenseHandshakeLimiter = createUploadLimiter({ windowMinutes: 1, maxRequests: 10 });
const licenseHeartbeatLimiter = createUploadLimiter({ windowMinutes: 1, maxRequests: 15 });
const licenseEnforceLimiter = createUploadLimiter({ windowMinutes: 1, maxRequests: 5 });

app.post("/api/license/handshake", licenseHandshakeLimiter, handleLicenseHandshake);
app.post("/api/license/heartbeat", licenseHeartbeatLimiter, handleLicenseHeartbeat);
app.post("/api/license/enforce", licenseEnforceLimiter, handleLicenseEnforce);

// ==================== ADMIN ROUTES ====================

// Admin - Products
app.get("/admin/products", requireAuth, requireAdmin, handleAdminListProducts);
app.post("/admin/products", requireAuth, requireAdmin, validate(createProductSchema), handleAdminCreateProduct);
app.put("/admin/products/:id", requireAuth, requireAdmin, validate(updateProductSchema), handleAdminUpdateProduct);
app.delete("/admin/products/:id", requireAuth, requireAdmin, handleAdminDeleteProduct);
app.post("/admin/products/:id/files", requireAuth, requireAdmin, adminFileUpload.single("file"), handleAdminAddProductFile);
app.delete("/admin/products/:productId/files/:fileId", requireAuth, requireAdmin, handleAdminDeleteProductFile);

// Admin - Categories
app.post("/admin/categories", requireAuth, requireAdmin, validate(createCategorySchema), handleAdminCreateCategory);
app.put("/admin/categories/:id", requireAuth, requireAdmin, validate(updateCategorySchema), handleAdminUpdateCategory);
app.delete("/admin/categories/:id", requireAuth, requireAdmin, handleAdminDeleteCategory);

// Admin - Licenses
app.get("/admin/licenses", requireAuth, requireAdmin, handleAdminListLicenses);
app.get("/admin/licenses/active", requireAuth, requireAdmin, handleAdminActiveLicenses);
app.get("/admin/licenses/:id/logs", requireAuth, requireAdmin, handleAdminLicenseLogs);
app.put("/admin/licenses/:id/status", requireAuth, requireAdmin, validate(updateLicenseStatusSchema), handleAdminUpdateLicenseStatus);
app.post("/admin/licenses/:id/kill", requireAuth, requireAdmin, handleAdminKillSwitch);

// Admin - Analytics
app.get("/admin/analytics", requireAuth, requireAdmin, handleAdminAnalytics);

// Admin - Users
app.get("/admin/users", requireAuth, requireAdmin, handleAdminListUsers);
app.put("/admin/users/:id/role", requireAuth, requireAdmin, handleAdminChangeUserRole);
app.post("/admin/users/:id/adjust-balance", requireAuth, requireAdmin, handleAdminAdjustUserBalance);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
  });
});

// Graceful shutdown
import { prisma } from "./prisma.js";

const shutdown = async () => {
  console.log("Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start server
app.listen(port, () => {
  console.log(`Upload API listening on http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
