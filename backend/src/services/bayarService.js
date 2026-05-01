import crypto from "node:crypto";

const DEFAULT_BASE_URL = "https://www.bayar.gg/api";

const getEnvValue = (value) => (value ? value.trim() : "");

const normalizeBaseUrl = (value) => value.replace(/\/+$/, "");

export const getBayarConfig = () => {
  const apiKey = getEnvValue(process.env.BAYARGG_API_KEY);
  const baseUrl = getEnvValue(process.env.BAYARGG_BASE_URL) || DEFAULT_BASE_URL;
  const webhookSecret = getEnvValue(process.env.BAYARGG_WEBHOOK_SECRET);

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(baseUrl),
    webhookSecret,
  };
};

export const createBayarPayment = async ({
  amount,
  description,
  customerName,
  customerEmail,
  customerPhone,
  callbackUrl,
  paymentMethod = "qris",
}) => {
  const { apiKey, baseUrl } = getBayarConfig();

  if (!apiKey) {
    throw new Error("Bayar API key not configured");
  }

  const payload = {
    amount,
    payment_method: paymentMethod,
  };

  if (description) payload.description = description;
  if (customerName) payload.customer_name = customerName;
  if (customerEmail) payload.customer_email = customerEmail;
  if (customerPhone) payload.customer_phone = customerPhone;
  if (callbackUrl) payload.callback_url = callbackUrl;

  const response = await fetch(`${baseUrl}/create-payment.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bayar create-payment failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error("Bayar create-payment returned success=false");
  }

  return data;
};

export const verifyBayarWebhookSignature = ({ invoiceId, status, finalAmount, timestamp, signature }) => {
  const { webhookSecret } = getBayarConfig();

  if (!webhookSecret) {
    return false;
  }

  if (!invoiceId || !status || !finalAmount || !timestamp || !signature) {
    return false;
  }

  const signatureData = `${invoiceId}|${status}|${finalAmount}|${timestamp}`;
  const expected = crypto.createHmac("sha256", webhookSecret).update(signatureData).digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
};
