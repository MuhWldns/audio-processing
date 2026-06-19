import { prisma } from "../../prisma.js";
import { checkQrisStatus } from "./client.js";
import { creditVerifiedTopUp } from "./credit.js";

export const MANUAL_CHECK_COOLDOWN_MS = 30 * 1000;
export const AUTO_CANCEL_AFTER_MS = 25 * 60 * 1000;
const DEFAULT_AUTO_CANCEL_INTERVAL_MS = 5 * 60 * 1000;
const MUSTIKA_PROVIDER = "mustika";

const manualCheckCooldowns = new Map();

export const resetManualCheckCooldowns = () => {
  manualCheckCooldowns.clear();
};

const findUserOrder = (userId, reference) => prisma.topUpOrder.findFirst({
  where: {
    userId,
    OR: [{ id: reference }, { externalId: reference }],
  },
});

const buildProviderMeta = (check) => ({
  ref_no: check.refNo,
  net_amount: check.netAmount,
  issuer: check.issuer,
  payor: check.payor,
  settle_at: check.settleAt,
  timestamp: check.timestamp,
  receipt_url: check.receiptUrl,
  providerStatus: check.status,
  providerRaw: check.raw,
});

const cooldownKeyFor = (order) => order.externalId || order.id;

const getCooldownRemainingMs = (key, now) => {
  const last = manualCheckCooldowns.get(key);
  if (!last) return 0;
  return Math.max(0, MANUAL_CHECK_COOLDOWN_MS - (now - last));
};

export async function manualCheckTopUp({ userId, reference, now = Date.now() }) {
  const order = await findUserOrder(userId, reference);
  if (!order) {
    return { ok: false, statusCode: 404, error: "Order not found" };
  }

  if (order.status === "COMPLETED") {
    return { ok: true, status: "COMPLETED", paid: true, order };
  }
  if (order.status === "CANCELED") {
    return { ok: true, status: "CANCELED", paid: false, order };
  }

  const key = cooldownKeyFor(order);
  const cooldownRemainingMs = getCooldownRemainingMs(key, now);
  if (cooldownRemainingMs > 0) {
    return { ok: true, status: order.status, paid: false, cooldownRemainingMs, order };
  }
  manualCheckCooldowns.set(key, now);

  const check = await checkQrisStatus(order.externalId);

  if (check.status === "expired") {
    await prisma.topUpOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "CANCELED", metadata: { ...(order.metadata || {}), checkedVia: "manual-check", providerStatus: "expired" } },
    });
    return { ok: true, status: "CANCELED", paid: false, order: { ...order, status: "CANCELED" } };
  }

  if (check.status !== "success") {
    return { ok: true, status: order.status, paid: false, order };
  }

  if (check.refNo !== order.externalId || check.amount !== order.amountRupiah) {
    console.warn(`[mustika manual-check] verification mismatch for order ${order.id}: ref=${check.refNo}/${order.externalId} amount=${check.amount}/${order.amountRupiah}`);
    return { ok: false, statusCode: 409, error: "Payment verification mismatch" };
  }

  await creditVerifiedTopUp(order.id, {
    verifyAmount: check.amount,
    finalAmount: check.amount,
    checkedVia: "manual-check",
    providerMeta: buildProviderMeta(check),
  });

  return { ok: true, status: "COMPLETED", paid: true, order: { ...order, status: "COMPLETED", finalAmount: check.amount } };
}

export async function cancelExpiredOrders(now = new Date()) {
  const cutoff = new Date(now.getTime() - AUTO_CANCEL_AFTER_MS);
  const result = await prisma.topUpOrder.updateMany({
    where: {
      provider: MUSTIKA_PROVIDER,
      status: "PENDING",
      createdAt: { lt: cutoff },
    },
    data: { status: "CANCELED" },
  });
  return { canceled: result.count };
}

export function startAutoCanceler(intervalMs = DEFAULT_AUTO_CANCEL_INTERVAL_MS) {
  console.log(`[reconcile] auto-cancel started (${intervalMs}ms interval, expiry ${AUTO_CANCEL_AFTER_MS}ms)`);
  const timer = setInterval(() => {
    cancelExpiredOrders().catch((err) => {
      console.error("[reconcile] auto-cancel run failed:", err.message);
    });
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}