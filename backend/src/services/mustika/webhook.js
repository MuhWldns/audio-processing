import { prisma } from "../../prisma.js";
import { checkQrisStatus } from "./client.js";
import { creditVerifiedTopUp } from "./credit.js";

const MUSTIKA_PROVIDER = "mustika";

export const extractWebhookRefNo = (payload) => {
  const refNo = payload?.reference || payload?.data?.ref_no;
  return typeof refNo === "string" && refNo.trim() ? refNo.trim() : null;
};

export const shouldProcessWebhook = (payload) => {
  return payload?.status === "success" && payload?.service === "QRIS";
};

const buildProviderMeta = ({ payload, check }) => ({
  ref_no: check.refNo,
  net_amount: check.netAmount,
  issuer: check.issuer,
  payor: check.payor,
  settle_at: check.settleAt,
  timestamp: check.timestamp,
  receipt_url: check.receiptUrl,
  webhookStatus: payload?.status,
  webhookService: payload?.service,
  webhookAmount: payload?.amount,
  webhookTimestamp: payload?.timestamp,
  webhookProviderRef: payload?.data?.provider_ref,
  webhookRrn: payload?.data?.rrn,
  providerRaw: check.raw,
});

export async function processMustikaWebhook(payload) {
  if (!shouldProcessWebhook(payload)) {
    return { processed: false, reason: "ignored_event" };
  }

  const refNo = extractWebhookRefNo(payload);
  if (!refNo) {
    console.warn("[mustika webhook] missing ref_no", { status: payload?.status, service: payload?.service });
    return { processed: false, reason: "missing_ref_no" };
  }

  const order = await prisma.topUpOrder.findUnique({ where: { externalId: refNo } });
  if (!order) {
    console.warn(`[mustika webhook] order not found for ref_no ${refNo}`);
    return { processed: false, reason: "order_not_found" };
  }

  if (order.provider !== MUSTIKA_PROVIDER) {
    console.warn(`[mustika webhook] ref_no ${refNo} belongs to provider ${order.provider}, not mustika`);
    return { processed: false, reason: "provider_mismatch" };
  }

  if (order.status === "COMPLETED") {
    return { processed: true, credited: false, reason: "already_completed" };
  }

  const check = await checkQrisStatus(refNo);
  if (check.status !== "success") {
    console.warn(`[mustika webhook] provider status for ${refNo} is ${check.status}, not success`);
    return { processed: false, reason: `provider_status_${check.status}` };
  }

  if (check.refNo !== order.externalId) {
    console.warn(`[mustika webhook] ref_no mismatch for order ${order.id}: check=${check.refNo} order=${order.externalId}`);
    return { processed: false, reason: "ref_no_mismatch" };
  }

  if (check.amount !== order.amountRupiah) {
    console.warn(`[mustika webhook] amount mismatch for order ${order.id}: check=${check.amount} order=${order.amountRupiah}`);
    return { processed: false, reason: "amount_mismatch" };
  }

  const credit = await creditVerifiedTopUp(order.id, {
    verifyAmount: check.amount,
    finalAmount: check.amount,
    checkedVia: "mustika-webhook",
    providerMeta: buildProviderMeta({ payload, check }),
  });

  return { processed: true, credited: Boolean(credit.credited) };
}