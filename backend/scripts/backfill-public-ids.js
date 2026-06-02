import { prisma } from "../src/prisma.js";
import {
  generatePublicId,
  getLicenseTypeCode,
  getProductDomainCode,
  getTransactionTypeCode,
  getUsageBillingCode,
} from "../src/services/publicIdService.js";

const backfillModels = [
  { name: "user", prefix: "ACC", code: () => "IDN" },
  { name: "topUpOrder", prefix: "TOP", code: () => "IDR" },
  { name: "walletTransaction", prefix: "TXN", code: (row) => getTransactionTypeCode(row.type) },
  { name: "purchase", prefix: "PUR", code: (row) => getLicenseTypeCode(row.licenseType), dateField: "purchasedAt", orderField: "purchasedAt" },
  { name: "license", prefix: "LIC", code: (row) => getLicenseTypeCode(row.licenseType) },
  {
    name: "product",
    prefix: "PRD",
    code: (row) => getProductDomainCode(row.category?.slug || row.category?.name),
    include: { category: { select: { slug: true, name: true } } },
  },
  { name: "usageEvent", prefix: "USE", code: (row) => getUsageBillingCode(row.costRupiah) },
  { name: "uploadRecord", prefix: "UPL", code: (row) => String(row.fileFormat || "BIN").toUpperCase().padEnd(3, "X").slice(0, 3) },
];

export async function runBackfill(client = prisma) {
  let scanned = 0;
  let updated = 0;

  for (const model of backfillModels) {
    const rows = await client[model.name].findMany({
      where: { publicId: null },
      orderBy: { [model.orderField || "createdAt"]: "asc" },
      ...(model.include ? { include: model.include } : {}),
    });

    scanned += rows.length;
    console.log(`${model.name}: found ${rows.length} rows missing publicId.`);

    for (const row of rows) {
      await client.$transaction(async (tx) => {
        const publicId = await generatePublicId(tx, model.prefix, model.code(row), row[model.dateField || "createdAt"]);
        await tx[model.name].update({ where: { id: row.id }, data: { publicId } });
      });
      updated += 1;
    }

    console.log(`${model.name}: updated ${rows.length} rows.`);
  }

  console.log(`Backfill complete: scanned ${scanned} rows, updated ${updated} publicIds.`);
  return { scanned, updated };
}

if (import.meta.main) {
  try {
    await runBackfill(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
