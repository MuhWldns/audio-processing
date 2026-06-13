import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma.js";
import { formatHistoryResponse, formatUploadResponse, saveUploadRecord } from "../../src/services/uploadService.js";

describe("uploadService", () => {
  beforeEach(() => {
    Object.values(prisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method?.mockReset === "function") method.mockReset();
        });
      }
    });

    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    prisma.publicIdCounter.upsert.mockResolvedValue({ nextNumber: 2 });
    prisma.user.findUnique
      .mockResolvedValueOnce({ walletBalance: 10000 })
      .mockResolvedValueOnce({ walletBalance: 8000 });
    prisma.user.update.mockResolvedValue({});
    prisma.walletTransaction.create.mockResolvedValue({ id: "wallet-transaction-1" });
    prisma.usageEvent.create.mockResolvedValue({ id: "usage-event-1", publicId: "USE-PAID-2606-000001" });
    prisma.activityLog.create.mockResolvedValue({ id: "activity-1" });
    prisma.uploadRecord.create.mockImplementation(async ({ data }) => ({ id: "upload-1", ...data }));
  });

  it("should generate publicIds for usage event, upload record, and audio wallet transaction", async () => {
    await saveUploadRecord({
      userId: "user-test-123",
      file: {
        filename: "stored.wav",
        originalname: "voice.wav",
        mimetype: "audio/wav",
        size: 1234,
      },
      priceData: { paidUnits: 1, cost: 2000, freeCovered: 0 },
      nextFreeUsedToday: 1,
      quotaUser: { freeAudioDailyLimit: 3 },
    });

    expect(prisma.usageEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicId: expect.stringMatching(/^USE-PAID-\d{4}-000001$/),
        userId: "user-test-123",
        exportFormat: "wav",
        costRupiah: 2000,
      }),
    });
    expect(prisma.uploadRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicId: expect.stringMatching(/^UPL-WAV-\d{4}-000001$/),
      }),
    });
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicId: expect.stringMatching(/^TXN-AUD-\d{4}-000001$/),
      }),
    });
  });

  it("should bound upload publicId format code to three uppercase characters", async () => {
    await saveUploadRecord({
      userId: "user-test-123",
      file: {
        filename: "stored.flac",
        originalname: "voice.flac",
        mimetype: "audio/flac",
        size: 1234,
      },
      priceData: { paidUnits: 0, cost: 0, freeCovered: 1 },
      nextFreeUsedToday: 1,
      quotaUser: { freeAudioDailyLimit: 3 },
    });

    expect(prisma.uploadRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicId: expect.stringMatching(/^UPL-FLA-\d{4}-000001$/),
      }),
    });
  });

  it("should include upload publicId in history responses", () => {
    const result = formatHistoryResponse([
      {
        id: "upload-1",
        publicId: "UPL-WAV-2606-000001",
        fileName: "track.wav",
        fileFormat: "wav",
        status: "COMPLETED",
        source: "editor",
        durationSec: 12,
        createdAt: new Date("2026-06-01T00:00:00Z"),
        updatedAt: new Date("2026-06-01T00:00:00Z"),
        metadata: {},
        activityLog: null,
      },
    ]);

    expect(result[0].publicId).toBe("UPL-WAV-2606-000001");
  });

  it("should include upload and usage publicIds in immediate upload response", async () => {
    const { uploadRecord, usageEvent } = await saveUploadRecord({
      userId: "user-test-123",
      file: {
        filename: "stored.wav",
        originalname: "voice.wav",
        mimetype: "audio/wav",
        size: 1234,
      },
      priceData: { paidUnits: 1, cost: 2000, freeCovered: 0 },
      nextFreeUsedToday: 1,
      quotaUser: { freeAudioDailyLimit: 3 },
    });

    const result = formatUploadResponse(uploadRecord, null, usageEvent);

    expect(result.upload.publicId).toMatch(/^UPL-WAV-\d{4}-000001$/);
    expect(result.upload.usageEventPublicId).toMatch(/^USE-PAID-\d{4}-000001$/);
  });
});
