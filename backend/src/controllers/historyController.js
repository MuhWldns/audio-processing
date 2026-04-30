/**
 * Controller untuk history dan download
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../prisma.js";
import { formatHistoryResponse } from "../services/uploadService.js";

/**
 * Handler untuk mendapatkan history upload
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handleGetHistory = async (req, res) => {
  const uploads = await prisma.uploadRecord.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    include: { activityLog: true },
  });

  return res.json({
    uploads: formatHistoryResponse(uploads),
  });
};

/**
 * Handler untuk download file dari history
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handleDownloadHistory = async (req, res) => {
  const uploadDir = path.join(process.cwd(), "uploads");
  
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

  const filePath = path.join(uploadDir, storedFileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File no longer exists" });
  }

  return res.download(filePath, upload.fileName);
};