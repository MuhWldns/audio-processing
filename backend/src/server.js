import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;
const apiKey = process.env.UPLOAD_API_KEY || "";
const uploadDir = path.join(__dirname, "..", "uploads");

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

app.post("/upload", upload.single("file"), (req, res) => {
  const providedKey = req.header("x-api-key");
  if (!apiKey || providedKey !== apiKey) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Missing file" });
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
