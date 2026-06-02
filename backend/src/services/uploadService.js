/**
 * Service untuk business logic file upload
 * Aligned with current schema: User.walletBalance + WalletTransaction ledger
 */

import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { prisma } from "../prisma.js";
import { debitWallet } from "./databaseService.js";
import { generatePublicId, getUsageBillingCode } from "./publicIdService.js";

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
 * Uses unified Rupiah wallet (User.walletBalance) and WalletTransaction ledger
 */
export const saveUploadRecord = async ({ userId, file, priceData, nextFreeUsedToday, quotaUser }) => {
  const storedFileName = file.filename;
  const fileName = file.originalname;
  const fileFormat = path.extname(file.originalname).toLowerCase().replace(".", "");

  return await prisma.$transaction(async (tx) => {
    const usageEventPublicId = await generatePublicId(tx, "USE", getUsageBillingCode(priceData.cost));
    const uploadRecordPublicId = await generatePublicId(tx, "UPL", String(fileFormat || "BIN").toUpperCase().slice(0, 3));
    const usageEvent = await tx.usageEvent.create({
      data: {
        publicId: usageEventPublicId,
        userId,
        status: "COMPLETED",
        audioDurationSec: 0,
        exportFormat: fileFormat,
        costRupiah: priceData.cost,
        completedAt: new Date(),
        metadata: {
          storedFileName,
          downloadName: fileName,
          freeCovered: priceData.freeCovered,
          paidUnits: priceData.paidUnits,
        },
      },
    });

    // Debit wallet if paid units > 0
    if (priceData.paidUnits > 0 && priceData.cost > 0) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { walletBalance: true },
      });

      if (!user || user.walletBalance < priceData.cost) {
        throw new Error("Insufficient balance");
      }

      // Deduct from wallet
      await tx.user.update({
        where: { id: userId },
        data: {
          walletBalance: { decrement: priceData.cost },
          totalSpent: { increment: priceData.cost },
        },
      });

      // Record in unified ledger
      const updatedUser = await tx.user.findUnique({
        where: { id: userId },
        select: { walletBalance: true },
      });

      const walletTransactionPublicId = await generatePublicId(tx, "TXN", "AUD");
      await tx.walletTransaction.create({
        data: {
          publicId: walletTransactionPublicId,
          userId,
          type: "AUDIO_CHARGE",
          amount: -priceData.cost,
          balanceAfter: updatedUser.walletBalance,
          referenceType: "UPLOAD_RECORD",
          referenceId: storedFileName,
          description: `Audio upload: ${fileName}`,
          metadata: {
            freeCovered: priceData.freeCovered,
            paidUnits: priceData.paidUnits,
            costRupiah: priceData.cost,
          },
        },
      });
    }

    // Update free audio usage counter
    await tx.user.update({
      where: { id: userId },
      data: {
        freeAudioUsedToday: nextFreeUsedToday,
      },
    });

    // Create activity log
    const activity = await tx.activityLog.create({
      data: {
        userId,
        type: "AUDIO_UPLOAD",
        status: "SUCCESS",
        title: "Audio uploaded",
        description: `Saved ${fileName}`,
        amountRupiah: priceData.cost,
        fileName,
        fileFormat,
        metadata: {
          storedFileName,
          downloadName: fileName,
          costRupiah: priceData.cost,
          freeCovered: priceData.freeCovered,
          paidUnits: priceData.paidUnits,
        },
      },
    });

    // Create upload record
    const uploadRecord = await tx.uploadRecord.create({
      data: {
        publicId: uploadRecordPublicId,
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
          costRupiah: priceData.cost,
          freeCovered: priceData.freeCovered,
          paidUnits: priceData.paidUnits,
          freeAudioUsedToday: nextFreeUsedToday,
          freeAudioDailyLimit: quotaUser.freeAudioDailyLimit,
        },
      },
    });

    return { uploadRecord, activity, usageEvent };
  });
};

/**
 * Format upload response untuk client
 */
export const formatUploadResponse = (uploadRecord, activity, usageEvent) => ({
  ok: true,
  upload: {
    id: uploadRecord.id,
    publicId: uploadRecord.publicId,
    usageEventPublicId: usageEvent?.publicId,
    fileName: uploadRecord.fileName,
    fileFormat: uploadRecord.fileFormat,
    createdAt: uploadRecord.createdAt,
    costRupiah: uploadRecord.metadata?.costRupiah ?? 0,
    freeCovered: uploadRecord.metadata?.freeCovered ?? 0,
    paidUnits: uploadRecord.metadata?.paidUnits ?? 0,
  },
});

/**
 * Format history response untuk client
 */
export const formatHistoryResponse = (uploads) => {
  return uploads.map((item) => ({
    id: item.id,
    publicId: item.publicId,
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
          amountRupiah: item.activityLog.amountRupiah,
          createdAt: item.activityLog.createdAt,
        }
      : null,
  }));
};
