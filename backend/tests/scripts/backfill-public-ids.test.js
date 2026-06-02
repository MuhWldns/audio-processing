import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "../../src/prisma.js";
import { runBackfill } from "../../scripts/backfill-public-ids.js";

describe("backfill-public-ids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  test("backfills nullable public ids using model-specific order fields and codes", async () => {
    const createdAt = new Date("2024-01-05T00:00:00.000Z");
    const rowsByModel = {
      user: [{ id: "user-1", createdAt }],
      topUpOrder: [{ id: "top-1", createdAt }],
      walletTransaction: [{ id: "txn-1", type: "AUDIO_CHARGE", createdAt }],
      purchase: [{ id: "pur-1", licenseType: "COMMERCIAL", purchasedAt: createdAt }],
      license: [{ id: "lic-1", licenseType: "ENTERPRISE", createdAt }],
      product: [{ id: "prd-1", createdAt, category: { slug: "audio-tools", name: "Audio Tools" } }],
      usageEvent: [{ id: "use-1", costRupiah: 0, createdAt }],
      uploadRecord: [{ id: "upl-1", fileFormat: "mp", createdAt }],
    };

    for (const [modelName, rows] of Object.entries(rowsByModel)) {
      prisma[modelName].findMany.mockResolvedValue(rows);
      prisma[modelName].update.mockImplementation(({ data }) => Promise.resolve(data));
    }
    prisma.publicIdCounter.upsert.mockImplementation(({ where }) =>
      Promise.resolve({ scope: where.scope, nextNumber: 2 }),
    );

    const result = await runBackfill(prisma);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { publicId: null },
      orderBy: { createdAt: "asc" },
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { publicId: null },
      orderBy: { createdAt: "asc" },
      include: { category: { select: { slug: true, name: true } } },
    });
    expect(prisma.purchase.findMany).toHaveBeenCalledWith({
      where: { publicId: null },
      orderBy: { purchasedAt: "asc" },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(8);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { publicId: "ACC-IDN-2401-000001" } });
    expect(prisma.topUpOrder.update).toHaveBeenCalledWith({ where: { id: "top-1" }, data: { publicId: "TOP-IDR-2401-000001" } });
    expect(prisma.walletTransaction.update).toHaveBeenCalledWith({ where: { id: "txn-1" }, data: { publicId: "TXN-AUD-2401-000001" } });
    expect(prisma.purchase.update).toHaveBeenCalledWith({ where: { id: "pur-1" }, data: { publicId: "PUR-COM-2401-000001" } });
    expect(prisma.license.update).toHaveBeenCalledWith({ where: { id: "lic-1" }, data: { publicId: "LIC-ENT-2401-000001" } });
    expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: "prd-1" }, data: { publicId: "PRD-AUD-2401-000001" } });
    expect(prisma.usageEvent.update).toHaveBeenCalledWith({ where: { id: "use-1" }, data: { publicId: "USE-FREE-2401-000001" } });
    expect(prisma.uploadRecord.update).toHaveBeenCalledWith({ where: { id: "upl-1" }, data: { publicId: "UPL-MPX-2401-000001" } });
    expect(result).toEqual({ scanned: 8, updated: 8 });
    expect(console.log).toHaveBeenCalledWith("Backfill complete: scanned 8 rows, updated 8 publicIds.");
  });
});
