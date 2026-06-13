import { prisma } from "../prisma.js";
import { createBayarPayment, verifyBayarWebhookSignature } from "../services/bayarService.js";
import { createMustikaQris, checkMustikaStatus } from "../services/mustikaService.js";
import { creditTopUpOrder } from "../services/databaseService.js";
import { sendTopUpSuccessEmail } from "../services/emailService.js";
import { generatePublicId } from "../services/publicIdService.js";

const MIN_TOPUP_AMOUNT = 1000;
const MAX_QRIS_AMOUNT = 500000;
const PAYMENT_METHOD = "qris";
const PROVIDER_NAME = "bayar.gg";
const MUSTIKA_PROVIDER = "mustika";
const MUSTIKA_EXPIRY_MIN = 20;
const MUSTIKA_EXPIRY_MS = 20 * 60 * 1000;
const getTopUpProvider = () => (process.env.TOPUP_PROVIDER || "bayar.gg").trim();

const getWebhookUrl = () => {
  const value = process.env.BAYARGG_WEBHOOK_URL ? process.env.BAYARGG_WEBHOOK_URL.trim() : "";
  return value || "";
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const buildTopUpMetadata = (paymentData, existing = {}) => {
  return {
    ...existing,
    invoiceId: paymentData?.data?.invoice_id,
    paymentMethod: paymentData?.data?.payment_method,
    expiresAt: paymentData?.data?.expires_at,
    paymentUrl: paymentData?.data?.payment_url,
    uniqueCode: paymentData?.data?.unique_code,
    finalAmount: paymentData?.data?.final_amount,
    qrisImageUrl: paymentData?.data?.qris_static_image_url,
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
  const customerEmail = req.body?.customer_email;
  const customerPhone = req.body?.customer_phone;
  const provider = getTopUpProvider();

  let externalId;
  let providerName;
  let metadata;

  if (provider === MUSTIKA_PROVIDER) {
    const redirectUrl = `${process.env.FRONTEND_URL || ""}/topup`;
    const payment = await createMustikaQris({
      amount,
      productName: `Top up Rp ${amount.toLocaleString("id-ID")}`,
      customerName,
      expiry: MUSTIKA_EXPIRY_MIN,
      redirectUrl,
    });
    const expiresAt = new Date(Date.now() + MUSTIKA_EXPIRY_MIN * 60 * 1000).toISOString();
    externalId = payment.refNo;
    providerName = MUSTIKA_PROVIDER;
    metadata = {
      qrUrl: payment.qrUrl,
      paymentLink: payment.paymentLink,
      expiresAt,
    };
  } else {
    const webhookUrl = getWebhookUrl();
    if (!webhookUrl) {
      return res.status(500).json({ error: "Webhook URL not configured" });
    }
    const paymentData = await createBayarPayment({
      amount,
      description: `Top up Rp ${amount.toLocaleString("id-ID")}`,
      customerName,
      customerEmail,
      customerPhone,
      callbackUrl: webhookUrl,
      paymentMethod: PAYMENT_METHOD,
    });
    const invoiceId = paymentData?.data?.invoice_id;
    if (!invoiceId) {
      return res.status(502).json({ error: "Payment gateway did not return invoice ID" });
    }
    externalId = invoiceId;
    providerName = PROVIDER_NAME;
    metadata = buildTopUpMetadata(paymentData);
  }

  const order = await prisma.$transaction(async (tx) => {
    const publicId = await generatePublicId(tx, "TOP", "IDR");
    return tx.topUpOrder.create({
      data: {
        publicId,
        userId: req.user.id,
        provider: providerName,
        externalId,
        amountRupiah: amount,
        finalAmount: null,
        status: "PENDING",
        metadata,
      },
    });
  });

  return res.status(201).json({
    ok: true,
    orderId: order.id,
    publicId: order.publicId,
    invoiceId: externalId,
    amount,
    paymentUrl: metadata.paymentLink || metadata.paymentUrl,
    qrisImageUrl: metadata.qrUrl || metadata.qrisImageUrl,
    expiresAt: metadata.expiresAt,
  });
};

export const handleBayarWebhook = async (req, res) => {
  const signature = req.header("x-webhook-signature") || "";
  const timestamp = req.header("x-webhook-timestamp") || "";
  const invoiceId = req.body?.invoice_id;
  const status = req.body?.status;
  const finalAmount = req.body?.final_amount;

  const signatureValid = verifyBayarWebhookSignature({
    invoiceId,
    status,
    finalAmount,
    timestamp,
    signature,
  });

  if (!signatureValid) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  if (status !== "paid") {
    return res.status(200).json({ ok: true, ignored: true });
  }

  try {
    const order = await prisma.topUpOrder.findUnique({ where: { externalId: invoiceId } });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const paymentMeta = {
      invoiceId,
      status,
      amount: req.body?.amount,
      finalAmount: req.body?.final_amount,
      uniqueCode: req.body?.unique_code,
      paidAt: req.body?.paid_at,
      paidReffNum: req.body?.paid_reff_num,
      customerName: req.body?.customer_name,
      customerEmail: req.body?.customer_email,
      customerPhone: req.body?.customer_phone,
    };

    const result = await creditTopUpOrder(order.id, {
      finalAmount: req.body?.final_amount != null ? Number(req.body.final_amount) : undefined,
      providerName: PROVIDER_NAME,
      paymentMeta,
    });

    if (result.notFound) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (result.credited) {
      const user = await prisma.user.findUnique({
        where: { id: result.userId },
        select: { email: true, displayName: true, walletBalance: true },
      });
      if (user) {
        sendTopUpSuccessEmail(user, result.amount, user.walletBalance).catch(() => {});
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[webhook] Error processing payment:", err);
    return res.status(500).json({ error: "Failed to process payment" });
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
      } else if (check.status === "expired" || ageMs > MUSTIKA_EXPIRY_MS) {
        await prisma.topUpOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "CANCELED" } });
        status = "CANCELED";
      }
      // otherwise (pending and within window): stay PENDING
    } catch (err) {
      console.error("[topup] MustikaPay status check failed:", err.message);
      // leave as PENDING; next poll / button retry will reconcile
    }
  }

  const meta = order.metadata || {};
  return res.status(200).json({
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
  });
};
