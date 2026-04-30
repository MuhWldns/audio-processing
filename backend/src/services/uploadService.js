/**
 * Service untuk business logic file upload
 */

import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { prisma } from "../prisma.js";

/**
 * Konfigurasi multer untuk file upload
 * @param {string} uploadDir - Direktori untuk menyimpan file
 * @returns {Object} Multer instance
 */
export const configureMulter = (uploadDir) => {
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

  return multer({ storage });
};

/**
 * Simpan upload record ke database
 * @param {Object} params - Upload parameters
 * @param {string} params.userId - ID user
 * @param {Object} params.file - File object dari multer
 * @param {Object} params.priceData - Price calculation data
 * @param {number} params.priceData.tokenCost - Token cost
 * @param {number} params.priceData.freeCovered - Free units covered
 * @param {number} params.priceData.paidUnits - Paid units
 * @param {number} params.nextFreeUsedToday - Free audio count setelah update
 * @param {Object} params.quotaUser - User dengan quota data
 * @returns {Promise<Object>} Upload record dan activity
 */
export const saveUploadRecord = async ({ userId, file, priceData, nextFreeUsedToday, quotaUser }) => {
  const storedFileName = file.filename;
  const fileName = file.originalname;
  const fileFormat = path.extname(file.originalname).toLowerCase().replace(".", "");

  return await prisma.$transaction(async (tx) => {
    if (priceData.paidUnits > 0) {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      
      if (wallet) {
        const updatedWallet = await tx.wallet.update({
          where: { userId },
          data: {
            balanceTokens: {
              decrement: priceData.tokenCost,
            },
            lifetimeSpent: {
              increment: priceData.tokenCost,
            },
          },
        });

        await tx.tokenTransaction.create({
          data: {
            userId,
            walletId: updatedWallet.id,
            type: "SETTLE",
            amountTokens: -priceData.tokenCost,
            referenceType: "UPLOAD_RECORD",
            referenceId: storedFileName,
            memo: `Audio upload: ${fileName}`,
          },
        });
      }
    }

    const activity = await tx.activityLog.create({
      data: {
        userId,
        type: "AUDIO_UPLOAD",
        status: "SUCCESS",
        title: "Audio uploaded",
        description: `Saved ${fileName}`,
        amountTokens: priceData.tokenCost,
        fileName,
        fileFormat,
        metadata: {
          storedFileName,
          downloadName: fileName,
          tokenCost: priceData.tokenCost,
          freeCovered: priceData.freeCovered,
          paidUnits: priceData.paidUnits,
        },
      },
    });

    const uploadRecord = await tx.uploadRecord.create({
      data: {
        userId,
        fileName,
        source: "studio",
        fileFormat,
        status: "COMPLETED",
        activityLogId: activity.id,
        metadata: {
          storedFileName,
          downloadName: fileName,
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          tokenCost: priceData.tokenCost,
          freeCovered: priceData.freeCovered,
          paidUnits: priceData.paidUnits,
          freeAudioUsedToday: nextFreeUsedToday,
          freeAudioDailyLimit: quotaUser.freeAudioDailyLimit,
        },
      },
    });

    return { uploadRecord, activity };
  });
};

/**
 * Format upload response untuk client
 * @param {Object} uploadRecord - Upload record dari database
 * @param {Object} activity - Activity log
 * @returns {Object} Formatted response
 */
export const formatUploadResponse = (uploadRecord, activity) => ({
  ok: true,
  upload: {
    id: uploadRecord.id,
    fileName: uploadRecord.fileName,
    fileFormat: uploadRecord.fileFormat,
    createdAt: uploadRecord.createdAt,
    tokenCost: uploadRecord.metadata?.tokenCost ?? 0,
    freeCovered: uploadRecord.metadata?.freeCovered ?? 0,
    paidUnits: uploadRecord.metadata?.paidUnits ?? 0,
  },
});

/**
 * Format history response untuk client
 * @param {Array} uploads - Upload records dari database
 * @returns {Array} Formatted history items
 */
export const formatHistoryResponse = (uploads) => {
  return uploads.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    fileFormat: item.fileFormat,
    status: item.status,
    source: item.source,
    durationSec: item.durationSec,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    metadata: item.metadata,
    activity: item.activityLog
      ? {
          id: item.activityLog.id,
          title: item.activityLog.title,
          description: item.activityLog.description,
          amountTokens: item.activityLog.amountTokens,
          createdAt: item.activityLog.createdAt,
        }
      : null,
  }));
};