import { beforeEach, describe, expect, test } from "vitest";
import { mockPrisma, resetAllMocks } from "../helpers/mockPrisma.js";
import {
  buildPublicIdScope,
  generatePublicId,
  getLicenseTypeCode,
  getProductDomainCode,
  getTransactionTypeCode,
  getUsageBillingCode,
  getYearMonth,
} from "../../src/services/publicIdService.js";

describe("publicIdService", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  test("maps transaction types to public id prefixes", () => {
    expect(getTransactionTypeCode("TOP_UP")).toBe("TOP");
    expect(getTransactionTypeCode("PURCHASE")).toBe("PUR");
    expect(getTransactionTypeCode("AUDIO_CHARGE")).toBe("AUD");
    expect(getTransactionTypeCode("REFUND")).toBe("REF");
    expect(getTransactionTypeCode("ADJUSTMENT")).toBe("ADJ");
    expect(getTransactionTypeCode("UNKNOWN")).toBe("ADJ");
  });

  test("maps license types to public id codes", () => {
    expect(getLicenseTypeCode("PERSONAL")).toBe("PER");
    expect(getLicenseTypeCode("COMMERCIAL")).toBe("COM");
    expect(getLicenseTypeCode("ENTERPRISE")).toBe("ENT");
    expect(getLicenseTypeCode("UNKNOWN")).toBe("PER");
  });

  test("maps product domains from names", () => {
    expect(getProductDomainCode("Audio Processing Pack")).toBe("AUD");
    expect(getProductDomainCode("Roblox Admin Script")).toBe("RBX");
    expect(getProductDomainCode("RBX Utility Script")).toBe("RBX");
    expect(getProductDomainCode("General Script Pack")).toBe("SCR");
  });

  test("maps usage billing status from cost", () => {
    expect(getUsageBillingCode(1)).toBe("PAID");
    expect(getUsageBillingCode(0)).toBe("FREE");
    expect(getUsageBillingCode(-1)).toBe("FREE");
  });

  test("builds public id scope with YYMM", () => {
    const date = new Date("2026-06-02T10:00:00.000Z");

    expect(getYearMonth(date)).toBe("2606");
    expect(buildPublicIdScope("PUR", "COM", date)).toBe("PUR-COM-2606");
  });

  test("generates public id from upserted counter", async () => {
    mockPrisma.publicIdCounter.upsert.mockResolvedValue({
      scope: "PUR-COM-2606",
      nextNumber: 8,
    });

    await expect(
      generatePublicId(
        mockPrisma,
        "PUR",
        "COM",
        new Date("2026-06-02T10:00:00.000Z"),
      ),
    ).resolves.toBe("PUR-COM-2606-000007");
    expect(mockPrisma.publicIdCounter.upsert).toHaveBeenCalledWith({
      where: { scope: "PUR-COM-2606" },
      create: { scope: "PUR-COM-2606", nextNumber: 2 },
      update: { nextNumber: { increment: 1 } },
    });
  });

  test("generates public id using custom date for backfill", async () => {
    mockPrisma.publicIdCounter.upsert.mockResolvedValue({
      scope: "PUR-COM-2401",
      nextNumber: 2,
    });

    await expect(
      generatePublicId(
        mockPrisma,
        "PUR",
        "COM",
        new Date("2024-01-05T00:00:00.000Z"),
      ),
    ).resolves.toBe("PUR-COM-2401-000001");
    expect(mockPrisma.publicIdCounter.upsert).toHaveBeenCalledWith({
      where: { scope: "PUR-COM-2401" },
      create: { scope: "PUR-COM-2401", nextNumber: 2 },
      update: { nextNumber: { increment: 1 } },
    });
  });
});
