export type TopUpRequest = {
  amount: number;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
};

export type TopUpResponse = {
  ok: boolean;
  orderId: string;
  invoiceId: string;
  amount: number;
  paymentUrl?: string;
  qrisImageUrl?: string;
  expiresAt?: string;
};

export type TopUpStatusResponse = {
  ok: boolean;
  paid: boolean;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELED";
  amount: number;
  finalAmount: number | null;
  createdAt: string;
  updatedAt: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function createTopUp(request: TopUpRequest): Promise<TopUpResponse> {
  const response = await fetch(`${apiBaseUrl}/topup/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = errorData?.error || "Failed to create top up";
    throw new Error(errorMessage);
  }

  return (await response.json()) as TopUpResponse;
}

export async function getTopUpStatus(reference: string): Promise<TopUpStatusResponse> {
  const response = await fetch(`${apiBaseUrl}/topup/status/${encodeURIComponent(reference)}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || "Failed to check status");
  }

  return (await response.json()) as TopUpStatusResponse;
}
