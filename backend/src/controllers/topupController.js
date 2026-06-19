import { prisma } from "../prisma.js";
import { createMustikaQris, checkMustikaStatus } from "../services/mustikaService.js";
import { creditTopUpOrder } from "../services/databaseService.js";
import { generatePublicId } from "../services/publicIdService.js";

const MIN_TOPUP_AMOUNT = 1000;
const MAX_QRIS_AMOUNT = 500000;
const MUSTIKA_PROVIDER = "mustika";
const MUSTIKA_EXPIRY_MIN = 20;
const MUSTIKA_EXPIRY_MS = 20 * 60 * 1000;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const buildStatusResponse = (order, status = order.status) => {
  const meta = order.metadata || {};
  return {
    ok: true,
    publicId: order.publicId,
    paid: status === "COMPLETED",
    status,
    amount: order.amountRupiah,
    finalAmount: order.finalAmount,
    qrisImageUrl: meta.qrUrl || meta.qrisImageUrl || null,
    paymentUrl: meta.paymentLink || meta.paymentUrl || null,
    expiresAt: meta.expiresAt || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

export const handleCreateTopUp = async (req, res) => {
  const amount = toNumber(req.body?.amount);

  if (!Number.isInteger(amount)) {
    return res.status(400).json({ error: "Amount must be an integer" });
  }

  if (amount < MIN_TOPUP_AMOUNT) {
    return res.status(400).json({ error: "Amount must be at least 1000" });
  }

  if (amount > MAX_QRIS_AMOUNT) {
    return res.status(400).json({ error: "Amount exceeds QRIS limit" });
  }

  const customerName = req.body?.customer_name;
  const redirectUrl = `${process.env.FRONTEND_URL || ""}/topup`;
  const expiresAt = new Date(Date.now() + MUSTIKA_EXPIRY_MIN * 60 * 1000).toISOString();

  const payment = await createMustikaQris({
    amount,
    productName: `Top up Rp ${amount.toLocaleString("id-ID")}`,
    customerName,
    expiry: MUSTIKA_EXPIRY_MIN,
    redirectUrl,
  });

  const order = await prisma.$transaction(async (tx) => {
    const publicId = await generatePublicId(tx, "TOP", "IDR");
    return tx.topUpOrder.create({
      data: {
        publicId,
        userId: req.user.id,
        provider: MUSTIKA_PROVIDER,
        externalId: payment.refNo,
        amountRupiah: amount,
        finalAmount: null,
        status: "PENDING",
        metadata: {
          qrUrl: payment.qrUrl,
          paymentLink: payment.paymentLink,
          expiresAt,
        },
      },
    });
  });

  return res.status(201).json({
    ok: true,
    orderId: order.id,
    publicId: order.publicId,
    invoiceId: payment.refNo,
    amount,
    paymentUrl: payment.paymentLink,
    qrisImageUrl: payment.qrUrl,
    expiresAt,
  });
};

export const handleGetTopUpStatus = async (req, res) => {
  const { reference } = req.params;

  if (!reference) {
    return res.status(400).json({ error: "Reference is required" });
  }

  const order = await prisma.topUpOrder.findFirst({
    where: {
      userId: req.user.id,
      OR: [{ id: reference }, { externalId: reference }],
    },
    select: {
      id: true,
      publicId: true,
      provider: true,
      externalId: true,
      status: true,
      amountRupiah: true,
      finalAmount: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  let status = order.status;

  // Active confirmation for pending MustikaPay orders (no trusted webhook)
  if (status === "PENDING" && order.provider === MUSTIKA_PROVIDER) {
    const ageMs = Date.now() - new Date(order.createdAt).getTime();
    try {
      const check = await checkMustikaStatus(order.externalId);
      if (check.status === "success") {
        await creditTopUpOrder(order.id, {
          verifyAmount: check.amount,
          requireAmountMatch: true,
          finalAmount: check.amount,
          providerName: MUSTIKA_PROVIDER,
          paymentMeta: { ref_no: order.externalId, checkedVia: "status-endpoint" },
        });
        status = "COMPLETED";
      } else if (check.status === "expired") {
        await prisma.topUpOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "CANCELED" } });
        status = "CANCELED";
      } else if (ageMs > MUSTIKA_EXPIRY_MS) {
        console.warn(`[topup] order ${order.id} past local expiry but provider still '${check.status}' — leaving PENDING`);
      }
    } catch (err) {
      console.error("[topup] MustikaPay status check failed:", err.message);
    }
  }

  return res.status(200).json(buildStatusResponse(order, status));
};