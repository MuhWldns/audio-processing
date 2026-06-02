/**
 * Controller untuk history dan download
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../prisma.js";
import { formatHistoryResponse } from "../services/uploadService.js";

const MAX_HISTORY_LIMIT = 100;
const DEFAULT_HISTORY_LIMIT = 50;

/**
 * Handler untuk mendapatkan history upload (paginated)
 */
export const handleGetHistory = async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_HISTORY_LIMIT, 1), MAX_HISTORY_LIMIT);
  const skip = (page - 1) * limit;

  const [uploads, total] = await Promise.all([
    prisma.uploadRecord.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      include: { activityLog: true },
      take: limit,
      skip,
    }),
    prisma.uploadRecord.count({ where: { userId: req.user.id } }),
  ]);

  return res.json({
    uploads: formatHistoryResponse(uploads),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

/**
 * Handler untuk download file dari history
 * Path traversal protected: resolved path must stay within uploadDir
 */
export const handleDownloadHistory = async (req, res) => {
  const uploadDir = path.resolve(process.cwd(), "uploads");

  const upload = await prisma.uploadRecord.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id,
    },
  });

  if (!upload) {
    return res.status(404).json({ error: "History item not found" });
  }

  const storedFileName = upload.metadata?.storedFileName;
  if (!storedFileName || typeof storedFileName !== "string") {
    return res.status(404).json({ error: "Stored file missing" });
  }

  // Path traversal protection
  const filePath = path.resolve(uploadDir, storedFileName);
  if (!filePath.startsWith(uploadDir + path.sep) && filePath !== uploadDir) {
    return res.status(400).json({ error: "Invalid file path" });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File no longer exists" });
  }

  return res.download(filePath, upload.fileName);
};
