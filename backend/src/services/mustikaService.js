const DEFAULT_BASE_URL = "https://mustikapayment.com";

const getEnvValue = (value) => (value ? value.trim() : "");
const normalizeBaseUrl = (value) => value.replace(/\/+$/, "");

export const getMustikaConfig = () => {
  const apiKey = getEnvValue(process.env.MUSTIKAPAY_API_KEY);
  const baseUrl = getEnvValue(process.env.MUSTIKAPAY_BASE_URL) || DEFAULT_BASE_URL;
  return { apiKey, baseUrl: normalizeBaseUrl(baseUrl) };
};

export const createMustikaQris = async ({
  amount,
  productName,
  customerName,
  expiry = 20,
  redirectUrl,
}) => {
  const { apiKey, baseUrl } = getMustikaConfig();
  if (!apiKey) {
    throw new Error("MustikaPay API key not configured");
  }

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
    const errorText = await response.text();
    throw new Error(`MustikaPay create-qris failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (data.status !== "success") {
    throw new Error(`MustikaPay create-qris returned status=${data.status} (expected status=success)`);
  }

  return {
    refNo: data.ref_no,
    qrUrl: data.qr_url,
    paymentLink: data.payment_link,
    amount: data.amount,
  };
};

// Placeholder — implemented in a later task. Exported so the test file's import resolves.
export const checkMustikaStatus = async () => {
  throw new Error("checkMustikaStatus not implemented yet");
};
