import { prisma } from "../../prisma.js";
import { generatePublicId } from "../publicIdService.js";

const TOP_UP_REFERENCE_TYPE = "TOP_UP_ORDER";
const MUSTIKA_PROVIDER = "mustika";

const normalizeProviderMeta = ({ checkedVia, providerMeta }) => ({
  ...(providerMeta || {}),
  checkedVia,
  provider: MUSTIKA_PROVIDER,
});

export async function creditVerifiedTopUp(orderId, { verifyAmount, finalAmount, checkedVia, providerMeta = {} } = {}) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.topUpOrder.findUnique({ where: { id: orderId } });
    if (!order) return { credited: false, notFound: true };
    if (order.status === "COMPLETED") return { credited: false, alreadyProcessed: true, userId: order.userId };

    if (!Number.isFinite(verifyAmount) || verifyAmount !== order.amountRupiah) {
      throw new Error(`Top-up amount verification failed: provider ${verifyAmount} != order ${order.amountRupiah}`);
    }

    const wasCanceled = order.status === "CANCELED";
    const claim = await tx.topUpOrder.updateMany({
      where: { id: order.id, status: { in: ["PENDING", "CANCELED"] } },
      data: { status: "COMPLETED" },
    });

    if (claim.count === 0) {
      return { credited: false, alreadyProcessed: true, userId: order.userId };
    }

    const amount = order.amountRupiah;
    const paymentMeta = normalizeProviderMeta({ checkedVia, providerMeta });

    const user = await tx.user.update({
      where: { id: order.userId },
      data: { walletBalance: { increment: amount }, totalTopUp: { increment: amount } },
      select: { walletBalance: true },
    });

    const transactionPublicId = await generatePublicId(tx, "TXN", "TOP");
    await tx.walletTransaction.create({
      data: {
        publicId: transactionPublicId,
        userId: order.userId,
        type: "TOP_UP",
        amount,
        balanceAfter: user.walletBalance,
        referenceType: TOP_UP_REFERENCE_TYPE,
        referenceId: order.id,
        description: `Top up Rp ${amount.toLocaleString("id-ID")} via MustikaPay`,
        metadata: paymentMeta,
      },
    });

    await tx.activityLog.create({
      data: {
        userId: order.userId,
        type: "TOP_UP",
        status: "SUCCESS",
        title: wasCanceled ? "Top up successful (late payment)" : "Top up successful",
        description: `Top up Rp ${amount.toLocaleString("id-ID")}`,
        amountRupiah: amount,
        metadata: paymentMeta,
      },
    });

    await tx.topUpOrder.update({
      where: { id: order.id },
      data: {
        finalAmount: typeof finalAmount === "number" ? finalAmount : amount,
        metadata: { ...(order.metadata || {}), ...paymentMeta },
      },
    });

    if (wasCanceled) {
      console.warn(`[topup] REVIVED canceled order ${order.id} after MustikaPay verified payment — user ${order.userId} credited ${amount}`);
    }

    return { credited: true, userId: order.userId, amount, revivedAfterCancel: wasCanceled };
  });
}