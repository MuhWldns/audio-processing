import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;
const apiKey = process.env.UPLOAD_API_KEY || "";
const uploadDir = path.join(__dirname, "..", "uploads");
const allowedExtensions = new Set([".wav", ".mp3", ".ogg"]);
const allowedMimeTypes = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/ogg; codecs=opus"]);
const rateLimitWindowMinutes = process.env.UPLOAD_RATE_WINDOW_MIN ? Number(process.env.UPLOAD_RATE_WINDOW_MIN) : 15;
const rateLimitMax = process.env.UPLOAD_RATE_LIMIT ? Number(process.env.UPLOAD_RATE_LIMIT) : 30;

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

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  }),
);

const uploadLimiter = rateLimit({
  windowMs: rateLimitWindowMinutes * 60 * 1000,
  limit: rateLimitMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many uploads, please try again later." },
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

app.listen(port, () => {
  console.log(`Upload API listening on http://localhost:${port}`);
});
