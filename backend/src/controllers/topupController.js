import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { createBayarPayment, verifyBayarWebhookSignature } from "../services/bayarService.js";

const MIN_TOPUP_AMOUNT = 1000;
const MAX_QRIS_AMOUNT = 500000;
const PAYMENT_METHOD = "qris";
const PROVIDER_NAME = "bayar.gg";

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
    invoiceId: paymentData?.payment?.invoice_id,
    paymentMethod: paymentData?.payment?.payment_method,
    expiresAt: paymentData?.payment?.expires_at,
    paymentUrl: paymentData?.payment_url,
    uniqueCode: paymentData?.payment?.unique_code,
    finalAmount: paymentData?.payment?.final_amount,
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

  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return res.status(500).json({ error: "Webhook URL not configured" });
  }

  const customerName = req.body?.customer_name;
  const customerEmail = req.body?.customer_email;
  const customerPhone = req.body?.customer_phone;

  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
  if (!wallet) {
    return res.status(404).json({ error: "Wallet not found" });
  }

  const paymentData = await createBayarPayment({
    amount,
    description: `Top up ${amount}`,
    customerName,
    customerEmail,
    customerPhone,
    callbackUrl: webhookUrl,
    paymentMethod: PAYMENT_METHOD,
  });

  const invoiceId = paymentData?.payment?.invoice_id;
  if (!invoiceId) {
    return res.status(502).json({ error: "Payment gateway did not return invoice ID" });
  }

  const tokensBought = amount;
  const metadata = buildTopUpMetadata(paymentData);

  const order = await prisma.topUpOrder.create({
    data: {
      userId: req.user.id,
      walletId: wallet.id,
      provider: PROVIDER_NAME,
      externalId: invoiceId,
      currency: "IDR",
      amountPaid: new Prisma.Decimal(amount),
      tokensBought,
      status: "PENDING",
      metadata,
    },
  });

  return res.status(201).json({
    ok: true,
    orderId: order.id,
    invoiceId,
    amount,
    tokensBought,
    paymentUrl: metadata.paymentUrl,
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

  const order = await prisma.topUpOrder.findUnique({ where: { externalId: invoiceId } });
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  if (order.status === "COMPLETED") {
    return res.status(200).json({ ok: true, alreadyProcessed: true });
  }

  const tokensBought = order.tokensBought;
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

  const updatedMetadata = buildTopUpMetadata(
    {
      payment: {
        invoice_id: invoiceId,
        payment_method: PAYMENT_METHOD,
        expires_at: order.metadata?.expiresAt,
        unique_code: req.body?.unique_code,
        final_amount: req.body?.final_amount,
      },
      payment_url: order.metadata?.paymentUrl,
    },
    order.metadata || {},
  );

  await prisma.$transaction(async (tx) => {
    const activity = await tx.activityLog.create({
      data: {
        userId: order.userId,
        type: "TOP_UP",
        status: "SUCCESS",
        title: "Top up successful",
        description: `Top up Rp ${tokensBought.toLocaleString("id-ID")}`,
        amountTokens: tokensBought,
        metadata: paymentMeta,
      },
    });

    await tx.topUpTransaction.create({
      data: {
        userId: order.userId,
        amountRupiah: tokensBought,
        paymentGateway: PROVIDER_NAME,
        paymentId: invoiceId,
        status: "completed",
        metadata: paymentMeta,
      },
    });

    await tx.wallet.update({
      where: { id: order.walletId },
      data: {
        balanceTokens: { increment: tokensBought },
        lifetimeTopUp: { increment: tokensBought },
      },
    });

    await tx.tokenTransaction.create({
      data: {
        userId: order.userId,
        walletId: order.walletId,
        type: "TOP_UP",
        amountTokens: tokensBought,
        referenceType: "TOP_UP_ORDER",
        referenceId: order.id,
        memo: `Top up ${tokensBought}`,
        metadata: paymentMeta,
      },
    });

    await tx.topUpOrder.update({
      where: { id: order.id },
      data: {
        status: "COMPLETED",
        activityLogId: activity.id,
        metadata: {
          ...updatedMetadata,
          paidAt: req.body?.paid_at,
          paidReffNum: req.body?.paid_reff_num,
          finalAmount: req.body?.final_amount,
          status,
        },
      },
    });
  });

  return res.status(200).json({ ok: true });
};
