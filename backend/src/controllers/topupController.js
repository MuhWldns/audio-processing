import { prisma } from "../prisma.js";
import { createBayarPayment, verifyBayarWebhookSignature } from "../services/bayarService.js";
import { sendTopUpSuccessEmail } from "../services/emailService.js";
import { generatePublicId } from "../services/publicIdService.js";

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

  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return res.status(500).json({ error: "Webhook URL not configured" });
  }

  const customerName = req.body?.customer_name;
  const customerEmail = req.body?.customer_email;
  const customerPhone = req.body?.customer_phone;

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

  const metadata = buildTopUpMetadata(paymentData);

  const order = await prisma.$transaction(async (tx) => {
    const publicId = await generatePublicId(tx, "TOP", "IDR");
    return tx.topUpOrder.create({
      data: {
        publicId,
        userId: req.user.id,
        provider: PROVIDER_NAME,
        externalId: invoiceId,
        amountRupiah: amount,
        finalAmount: paymentData?.data?.final_amount ? Number(paymentData.data.final_amount) : null,
        status: "PENDING",
        metadata,
      },
    });
  });

  return res.status(201).json({
    ok: true,
    orderId: order.id,
    publicId: order.publicId,
    invoiceId,
    amount,
    paymentUrl: metadata.paymentUrl,
    qrisImageUrl: metadata.qrisImageUrl,
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
    // Atomic idempotency: find + check status + update in single transaction
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.topUpOrder.findUnique({ where: { externalId: invoiceId } });
      if (!order) {
        return { error: "Order not found", status: 404 };
      }

      if (order.status === "COMPLETED") {
        return { ok: true, alreadyProcessed: true };
      }

      // Lock: immediately mark as COMPLETED to prevent race condition
      await tx.topUpOrder.update({
        where: { id: order.id },
        data: { status: "COMPLETED" },
      });

      const amount = order.amountRupiah;
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

      // Credit wallet
      const user = await tx.user.update({
        where: { id: order.userId },
        data: {
          walletBalance: { increment: amount },
          totalTopUp: { increment: amount },
        },
        select: { walletBalance: true },
      });

      // Record in unified ledger
      const transactionPublicId = await generatePublicId(tx, "TXN", "TOP");
      await tx.walletTransaction.create({
        data: {
          publicId: transactionPublicId,
          userId: order.userId,
          type: "TOP_UP",
          amount,
          balanceAfter: user.walletBalance,
          referenceType: "TOP_UP_ORDER",
          referenceId: order.id,
          description: `Top up Rp ${amount.toLocaleString("id-ID")} via ${PROVIDER_NAME}`,
          metadata: paymentMeta,
        },
      });

      // Create activity log
      await tx.activityLog.create({
        data: {
          userId: order.userId,
          type: "TOP_UP",
          status: "SUCCESS",
          title: "Top up successful",
          description: `Top up Rp ${amount.toLocaleString("id-ID")}`,
          amountRupiah: amount,
          metadata: paymentMeta,
        },
      });

      // Update order metadata
      await tx.topUpOrder.update({
        where: { id: order.id },
        data: {
          finalAmount: req.body?.final_amount ? Number(req.body.final_amount) : null,
          metadata: {
            ...(order.metadata || {}),
            paidAt: req.body?.paid_at,
            paidReffNum: req.body?.paid_reff_num,
            webhookPayload: paymentMeta,
          },
        },
      });

      return { ok: true, userId: order.userId, amount };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    // Send email notification (fire-and-forget)
    if (result.ok && !result.alreadyProcessed) {
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
      OR: [
        { id: reference },
        { externalId: reference },
      ],
    },
      select: {
        id: true,
        publicId: true,
        status: true,
      amountRupiah: true,
      finalAmount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  return res.status(200).json({
    ok: true,
    publicId: order.publicId,
    paid: order.status === "COMPLETED",
    status: order.status,
    amount: order.amountRupiah,
    finalAmount: order.finalAmount,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  });
};
