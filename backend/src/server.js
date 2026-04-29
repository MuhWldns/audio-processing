import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import session from "express-session";
import passport from "passport";
import { prisma } from "./prisma.js";
import { buildMePayload, configurePassport, handleOAuthLogin, isOAuthReady } from "./auth.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;
const apiKey = process.env.UPLOAD_API_KEY || "";
const sessionSecret = process.env.SESSION_SECRET || "replace-me";
const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173";
const uploadDir = path.join(__dirname, "..", "uploads");
const allowedExtensions = new Set([".wav", ".mp3", ".ogg"]);
const allowedMimeTypes = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/ogg; codecs=opus"]);
const rateLimitWindowMinutes = process.env.UPLOAD_RATE_WINDOW_MIN ? Number(process.env.UPLOAD_RATE_WINDOW_MIN) : 15;
const rateLimitMax = process.env.UPLOAD_RATE_LIMIT ? Number(process.env.UPLOAD_RATE_LIMIT) : 30;

configurePassport();

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const stamp = Date.now();
    cb(null, `${stamp}-${safeName}`);
  },
});

const upload = multer({ storage });

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
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

const uploadLimiter = rateLimit({
  windowMs: rateLimitWindowMinutes * 60 * 1000,
  limit: rateLimitMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many uploads, please try again later." },
});

const ensureAuthReady = (provider) => (_req, res, next) => {
  if (!isOAuthReady(provider)) {
    return res.status(503).json({
      error: `${provider} auth is not configured`,
    });
  }

  return next();
};

const requireAuth = (req, res, next) => {
  if (req.isAuthenticated?.() && req.user) {
    return next();
  }

  return res.status(401).json({ error: "Not authenticated" });
};

app.get("/auth/google", ensureAuthReady("google"), passport.authenticate("google", { scope: ["email", "profile"] }));

app.get("/auth/google/callback", ensureAuthReady("google"), passport.authenticate("google", { failureRedirect: `${frontendUrl}/?login=failed` }), async (req, res) => {
  if (req.user) {
    await handleOAuthLogin({ userId: req.user.id, provider: "GOOGLE", providerLabel: "Google" });
  }

  return res.redirect(`${frontendUrl}/studio?login=success`);
});

app.get("/auth/discord", ensureAuthReady("discord"), passport.authenticate("discord"));

app.get("/auth/discord/callback", ensureAuthReady("discord"), passport.authenticate("discord", { failureRedirect: `${frontendUrl}/?login=failed` }), async (req, res) => {
  if (req.user) {
    await handleOAuthLogin({ userId: req.user.id, provider: "DISCORD", providerLabel: "Discord" });
  }

  return res.redirect(`${frontendUrl}/studio?login=success`);
});

app.post("/auth/logout", requireAuth, async (req, res, next) => {
  const userId = req.user.id;

  req.logout((error) => {
    if (error) {
      return next(error);
    }

    req.session.destroy(async () => {
      await prisma.activityLog.create({
        data: {
          userId,
          type: "LOGOUT",
          status: "SUCCESS",
          title: "Signed out",
          description: "User signed out",
        },
      });

      res.clearCookie("connect.sid");
      return res.json({ ok: true });
    });
  });
});

app.get("/auth/me", async (req, res) => {
  if (!req.user) {
    return res.status(200).json({ user: null });
  }

  const me = await buildMePayload(req.user.id);
  return res.json({ user: me });
});

app.post("/upload", uploadLimiter, upload.single("file"), (req, res) => {
  const providedKey = req.header("x-api-key");
  if (!apiKey || providedKey !== apiKey) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Missing file" });
  }

  const extension = path.extname(req.file.originalname).toLowerCase();
  const isAllowed = allowedExtensions.has(extension) && allowedMimeTypes.has(req.file.mimetype);
  if (!isAllowed) {
    fs.unlink(req.file.path, () => undefined);
    return res.status(400).json({ error: "Unsupported file type" });
  }

  return res.status(201).json({
    message: "Thanks for using ",
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/db-health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, database: "up" });
  } catch {
    res.status(500).json({ ok: false, database: "down" });
  }
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Upload API listening on http://localhost:${port}`);
});
