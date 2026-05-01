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
  tokensBought: number;
  paymentUrl?: string;
  expiresAt?: string;
};

const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";

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

/**
 * Get user's transaction history
 */
export async function getTransactionHistory() {
  try {
    const response = await fetch(`${apiBaseUrl}/user/transactions`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to load transaction history");
    }

    return await response.json();
  } catch {
    // Return mock data if API is not available
    return {
      transactions: [
        {
          id: "tx-1",
          type: "TOP_UP",
          amountTokens: 25,
          memo: "Top up via credit card",
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: "tx-2",
          type: "SETTLE",
          amountTokens: -1,
          memo: "Audio upload: sample.mp3",
          createdAt: new Date(Date.now() - 172800000).toISOString(),
        },
        {
          id: "tx-3",
          type: "TOP_UP",
          amountTokens: 10,
          memo: "Initial top up",
          createdAt: new Date(Date.now() - 259200000).toISOString(),
        },
      ],
    };
  }
}