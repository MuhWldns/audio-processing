/**
 * Controller untuk file upload
 */

import fs from "node:fs";
import path from "node:path";
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
  const wallet = await prisma.wallet.findUnique({ where: { userId } });

  if (price.paidUnits > 0 && (!wallet || wallet.balanceTokens < price.tokenCost)) {
    fs.unlink(req.file.path, () => undefined);
    return res.status(402).json({
      error: "Not enough tokens",
      requiredTokens: price.tokenCost,
      balanceTokens: wallet?.balanceTokens ?? 0,
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