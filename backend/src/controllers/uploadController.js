/**
 * Controller untuk file upload
 * Aligned with current schema: User.walletBalance + Rupiah pricing
 */

import fs from "node:fs";
import { prisma } from "../prisma.js";
import { ensureDailyAudioQuota, getAudioUsagePrice } from "../services/authService.js";
import { saveUploadRecord, formatUploadResponse } from "../services/uploadService.js";

/**
 * Handler untuk upload file audio
 */
export const handleUpload = async (req, res) => {
  const userId = req.user.id;
  const quotaUser = await ensureDailyAudioQuota(userId);

  if (!quotaUser) {
    fs.unlink(req.file.path, () => undefined);
    return res.status(404).json({ error: "User not found" });
  }

  const price = getAudioUsagePrice(quotaUser, 1);

  // Check balance if paid units required
  if (price.paidUnits > 0 && price.cost > 0) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true },
    });

    if (!user || user.walletBalance < price.cost) {
      fs.unlink(req.file.path, () => undefined);
      return res.status(402).json({
        error: "Insufficient balance",
        required: price.cost,
        balance: user?.walletBalance ?? 0,
        freeRemaining: price.freeRemaining,
      });
    }
  }

  try {
    const result = await saveUploadRecord({
      userId,
      file: req.file,
      priceData: price,
      nextFreeUsedToday: quotaUser.freeAudioUsedToday + price.freeCovered,
      quotaUser,
    });

    return res.status(201).json(formatUploadResponse(result.uploadRecord, result.activity));
  } catch (err) {
    fs.unlink(req.file.path, () => undefined);

    if (err.message === "Insufficient balance") {
      return res.status(402).json({ error: "Insufficient balance" });
    }

    console.error("[upload] Error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
};
