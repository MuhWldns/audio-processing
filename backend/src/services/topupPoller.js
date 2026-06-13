// backend/src/services/topupPoller.js
import { prisma } from "../prisma.js";
import { checkMustikaStatus } from "./mustikaService.js";
import { creditTopUpOrder } from "./databaseService.js";

const MUSTIKA_PROVIDER = "mustika";
const MUSTIKA_EXPIRY_MS = 20 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 3 * 60 * 1000;

export async function pollPendingMustikaOrders() {
  const apiKey = (process.env.MUSTIKAPAY_API_KEY || "").trim();
  if (!apiKey) {
    return { skipped: true, checked: 0 };
  }

  const pendingCount = await prisma.topUpOrder.count({
    where: { provider: MUSTIKA_PROVIDER, status: "PENDING" },
  });
  if (pendingCount === 0) {
    return { checked: 0 };
  }

  const orders = await prisma.topUpOrder.findMany({
    where: { provider: MUSTIKA_PROVIDER, status: "PENDING" },
    select: { id: true, externalId: true, amountRupiah: true, createdAt: true, metadata: true },
  });

  let checked = 0;
  for (const order of orders) {
    checked += 1;
    const isExpired = Date.now() - new Date(order.createdAt).getTime() > MUSTIKA_EXPIRY_MS;
    try {
      const check = await checkMustikaStatus(order.externalId);
      if (check.status === "success") {
        await creditTopUpOrder(order.id, {
          verifyAmount: check.amount,
          finalAmount: check.amount,
          providerName: MUSTIKA_PROVIDER,
          paymentMeta: { ref_no: order.externalId, checkedVia: "poller" },
        });
      } else if (check.status === "expired" || isExpired) {
        await prisma.topUpOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "CANCELED" } });
      }
    } catch (err) {
      console.error(`[poller] order ${order.id} check failed:`, err.message);
    }
  }

  return { checked };
}

export function startTopUpPoller(intervalMs = DEFAULT_INTERVAL_MS) {
  const timer = setInterval(() => {
    pollPendingMustikaOrders().catch((err) => {
      console.error("[poller] run failed:", err.message);
    });
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}
