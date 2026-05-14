/**
 * Controller untuk file upload
 */

import fs from "node:fs";
import { prisma } from "../prisma.js";
import { ensureDailyAudioQuota, getAudioUsagePrice } from "../services/authService.js";
import { saveUploadRecord, formatUploadResponse } from "../services/uploadService.js";

/**
 * Handler untuk upload file audio
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handleUpload = async (req, res) => {
  const userId = req.user.id;
  const quotaUser = await ensureDailyAudioQuota(userId);

  if (!quotaUser) {
    fs.unlink(req.file.path, () => undefined);
    return res.status(404).json({ error: "User not found" });
  }

  const price = getAudioUsagePrice(quotaUser, 1);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletBalance: true },
  });

  if (price.paidUnits > 0 && (!user || user.walletBalance < price.cost)) {
    fs.unlink(req.file.path, () => undefined);
    return res.status(402).json({
      error: "Insufficient balance",
      required: price.cost,
      balance: user?.walletBalance ?? 0,
      freeRemaining: price.freeRemaining,
    });
  }

  const result = await saveUploadRecord({
    userId,
    file: req.file,
    priceData: price,
    nextFreeUsedToday: quotaUser.freeAudioUsedToday + price.freeCovered,
    quotaUser,
  });

  return res.status(201).json(formatUploadResponse(result.uploadRecord, result.activity));
};
