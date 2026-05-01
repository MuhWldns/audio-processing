import path from "node:path";
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
import { ensureAuthReady, requireAuth, createUploadLimiter, validateApiKey, validateAudioFile } from "./middlewares/index.js";
import { configureMulter } from "./services/uploadService.js";

// Controllers
import {
  handleGoogleCallback,
  handleDiscordCallback,
  handleLogout,
  handleGetMe,
  handleUpload,
  handleGetHistory,
  handleDownloadHistory,
  handleHealthCheck,
  handleDbHealthCheck,
  handleCreateTopUp,
  handleBayarWebhook,
} from "./controllers/index.js";

// Config
import { UPLOAD_RATE_LIMIT, DEFAULT_SESSION_MAX_AGE } from "./config/index.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;

// Environment variables
const apiKey = process.env.UPLOAD_API_KEY || "";
const sessionSecret = process.env.SESSION_SECRET || "replace-me";
const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173";
const uploadDir = path.join(__dirname, "..", "uploads");

// Configure passport
configurePassport();

// Configure multer
const upload = configureMulter(uploadDir);

// Configure rate limiter
const uploadLimiter = createUploadLimiter({
  windowMinutes: process.env.UPLOAD_RATE_WINDOW_MIN
    ? Number(process.env.UPLOAD_RATE_WINDOW_MIN)
    : UPLOAD_RATE_LIMIT.WINDOW_MINUTES,
  maxRequests: process.env.UPLOAD_RATE_LIMIT
    ? Number(process.env.UPLOAD_RATE_LIMIT)
    : UPLOAD_RATE_LIMIT.MAX_REQUESTS,
});

// Middleware setup
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: DEFAULT_SESSION_MAX_AGE,
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// ==================== ROUTES ====================

// Auth routes
app.get("/auth/google", ensureAuthReady("google"), passport.authenticate("google", { scope: ["email", "profile"] }));
app.get(
  "/auth/google/callback",
  ensureAuthReady("google"),
  passport.authenticate("google", { failureRedirect: `${frontendUrl}/?login=failed` }),
  handleGoogleCallback,
);

app.get("/auth/discord", ensureAuthReady("discord"), passport.authenticate("discord", { scope: ["identify", "email"] }));
app.get(
  "/auth/discord/callback",
  ensureAuthReady("discord"),
  passport.authenticate("discord", { failureRedirect: `${frontendUrl}/?login=failed` }),
  handleDiscordCallback,
);

app.post("/auth/logout", requireAuth, handleLogout);
app.get("/auth/me", handleGetMe);

// Upload routes
app.post(
  "/upload",
  requireAuth,
  uploadLimiter,
  validateApiKey(apiKey),
  upload.single("file"),
  validateAudioFile(),
  handleUpload,
);

// History routes
app.get("/history", requireAuth, handleGetHistory);
app.get("/history/:id/download", requireAuth, handleDownloadHistory);

// Top up routes
app.post("/topup/create", requireAuth, handleCreateTopUp);
app.post("/webhooks/bayar", handleBayarWebhook);

// Health check routes
app.get("/health", handleHealthCheck);
app.get("/db-health", handleDbHealthCheck);

// Error handling middleware (basic)
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
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
