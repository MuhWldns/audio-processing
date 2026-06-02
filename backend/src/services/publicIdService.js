export function getYearMonth(date = new Date()) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

export function getTransactionTypeCode(type) {
  const codes = {
    TOP_UP: "TOP",
    PURCHASE: "PUR",
    AUDIO_CHARGE: "AUD",
    REFUND: "REF",
    ADJUSTMENT: "ADJ",
  };
  return codes[type] ?? "ADJ";
}

export function getLicenseTypeCode(type) {
  const codes = {
    PERSONAL: "PER",
    COMMERCIAL: "COM",
    ENTERPRISE: "ENT",
  };
  return codes[type] ?? "PER";
}

export function getProductDomainCode(name) {
  const normalizedName = String(name).toLowerCase();
  if (normalizedName.includes("audio")) {
    return "AUD";
  }
  if (normalizedName.includes("roblox") || normalizedName.includes("rbx")) {
    return "RBX";
  }
  return "SCR";
}

export function getUsageBillingCode(cost) {
  return cost > 0 ? "PAID" : "FREE";
}

export function buildPublicIdScope(prefix, code, date = new Date()) {
  return `${prefix}-${code}-${getYearMonth(date)}`;
}

export async function generatePublicId(tx, prefix, code, date = new Date()) {
  const scope = buildPublicIdScope(prefix, code, date);
  const counter = await tx.publicIdCounter.upsert({
    where: { scope },
    create: { scope, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
  });
  const sequence = counter.nextNumber - 1;
  return `${scope}-${String(sequence).padStart(6, "0")}`;
}
