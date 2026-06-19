import { prisma } from "../prisma.js";
import { createQris } from "../services/mustika/client.js";
import { processMustikaWebhook } from "../services/mustika/webhook.js";
import { manualCheckTopUp } from "../services/mustika/reconcile.js";
import { generatePublicId } from "../services/publicIdService.js";

const MIN_TOPUP_AMOUNT = 1000;
const MAX_QRIS_AMOUNT = 500000;
const MUSTIKA_PROVIDER = "mustika";
const MUSTIKA_EXPIRY_MIN = 20;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const buildExpiresAt = () => new Date(Date.now() + MUSTIKA_EXPIRY_MIN * 60 * 1000).toISOString();

const buildStatusResponse = (order, status = order.status) => {
  const meta = order.metadata || {};
  return {
    ok: true,
    publicId: order.publicId,
    paid: status === "COMPLETED",
    status,
    amount: order.amountRupiah,
    finalAmount: order.finalAmount,
    qrisImageUrl: meta.qrUrl || null,
    paymentUrl: meta.paymentLink || null,
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
  const expiresAt = buildExpiresAt();

  const order = await prisma.$transaction(async (tx) => {
    const publicId = await generatePublicId(tx, "TOP", "IDR");
    return tx.topUpOrder.create({
      data: {
        publicId,
        userId: req.user.id,
        provider: MUSTIKA_PROVIDER,
        externalId: null,
        amountRupiah: amount,
        finalAmount: null,
        status: "PENDING",
        metadata: { expiresAt },
      },
    });
  });

  try {
    const payment = await createQris({
      amount,
      productName: `Top up Rp ${amount.toLocaleString("id-ID")}`,
      customerName,
      expiry: MUSTIKA_EXPIRY_MIN,
      redirectUrl,
    });

    const metadata = {
      ...(order.metadata || {}),
      qrUrl: payment.qrUrl,
      paymentLink: payment.paymentLink,
      expiresAt,
      createRaw: payment.raw,
    };

    const updated = await prisma.topUpOrder.update({
      where: { id: order.id },
      data: { externalId: payment.refNo, metadata },
    });

    return res.status(201).json({
      ok: true,
      orderId: updated.id,
      publicId: updated.publicId,
      invoiceId: payment.refNo,
      amount,
      paymentUrl: payment.paymentLink,
      qrisImageUrl: payment.qrUrl,
      expiresAt,
    });
  } catch (err) {
    await prisma.topUpOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "FAILED", metadata: { ...(order.metadata || {}), createError: err.message } },
    });
    throw err;
  }
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

  return res.status(200).json(buildStatusResponse(order));
};

export const handleManualCheckTopUp = async (req, res) => {
  const { reference } = req.params;

  if (!reference) {
    return res.status(400).json({ error: "Reference is required" });
  }

  const result = await manualCheckTopUp({ userId: req.user.id, reference });

  if (!result.ok) {
    return res.status(result.statusCode).json({ error: result.error });
  }

  return res.status(200).json(result);
};

export const handleMustikaWebhook = async (req, res) => {
  res.status(200).json({ status: "received" });

  processMustikaWebhook(req.body).catch((err) => {
    console.error("[mustika webhook] processing failed:", err);
  });
};