const DEFAULT_BASE_URL = "https://mustikapayment.com";

const getEnvValue = (value) => (value ? value.trim() : "");
const normalizeBaseUrl = (value) => value.replace(/\/+$/, "");

export class MustikaHttpError extends Error {
  constructor(action, statusCode, body) {
    super(`MustikaPay ${action} failed: ${statusCode} ${body}`);
    this.name = "MustikaHttpError";
    this.action = action;
    this.statusCode = statusCode;
    this.body = body;
  }
}

export const getMustikaConfig = () => {
  const apiKey = getEnvValue(process.env.MUSTIKAPAY_API_KEY);
  const baseUrl = getEnvValue(process.env.MUSTIKAPAY_BASE_URL) || DEFAULT_BASE_URL;
  return { apiKey, baseUrl: normalizeBaseUrl(baseUrl) };
};

const requireApiKey = () => {
  const config = getMustikaConfig();
  if (!config.apiKey) {
    throw new Error("MustikaPay API key not configured");
  }
  return config;
};

const readNonOkBody = async (response) => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

export const createQris = async ({ amount, productName, customerName, expiry = 20, redirectUrl } = {}) => {
  const { apiKey, baseUrl } = requireApiKey();

  const body = new URLSearchParams();
  body.set("amount", String(amount));
  if (productName) body.set("product_name", productName);
  if (customerName) body.set("customer_name", customerName);
  if (expiry) body.set("expiry", String(expiry));
  if (redirectUrl) body.set("redirect_url", redirectUrl);

  const response = await fetch(`${baseUrl}/api/v1/create/qris`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Api-Key": apiKey,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new MustikaHttpError("create-qris", response.status, await readNonOkBody(response));
  }

  const data = await response.json();
  if (data.status !== "success") {
    throw new Error(`MustikaPay create-qris returned status=${data.status} (expected status=success)`);
  }
  if (!data.ref_no) {
    throw new Error("MustikaPay create-qris missing ref_no");
  }

  return {
    refNo: data.ref_no,
    qrUrl: data.qr_url,
    paymentLink: data.payment_link,
    amount: data.amount == null ? undefined : Number(data.amount),
    raw: data,
  };
};

export const checkQrisStatus = async (refNo) => {
  const { apiKey, baseUrl } = requireApiKey();
  const url = `${baseUrl}/api/v1/check/qris?ref_no=${encodeURIComponent(refNo)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "X-Api-Key": apiKey },
  });

  if (!response.ok) {
    throw new MustikaHttpError("check-qris", response.status, await readNonOkBody(response));
  }

  const data = await response.json();
  return {
    refNo: data.ref_no,
    status: data.status,
    amount: data.amount == null ? undefined : Number(data.amount),
    netAmount: data.net_amount == null ? undefined : Number(data.net_amount),
    issuer: data.issuer,
    payor: data.payor,
    settleAt: data.settle_at,
    timestamp: data.timestamp,
    receiptUrl: data.receipt_url,
    raw: data,
  };
};