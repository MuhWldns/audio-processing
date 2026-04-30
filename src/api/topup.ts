export type TopUpRequest = {
  amountTokens: number;
  paymentMethod: string;
  paymentReference?: string;
  memo?: string;
};

export type TopUpResponse = {
  ok: boolean;
  topUpOrder: {
    id: string;
    userId: string;
    walletId: string;
    amountTokens: number;
    paymentMethod: string;
    paymentReference?: string;
    status: string;
    memo?: string;
    createdAt: string;
  };
  transaction: {
    id: string;
    type: string;
    amountTokens: number;
    memo?: string;
    createdAt: string;
  };
  wallet: {
    balanceTokens: number;
    reservedTokens: number;
    lifetimeTopUp: number;
    lifetimeSpent: number;
  };
};

const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";

/**
 * Mock top-up function (for now - backend endpoint not implemented yet)
 * In production, this would call a real API endpoint
 */
export async function processTopUp(request: TopUpRequest): Promise<TopUpResponse> {
  // For now, simulate API call delay and return mock response
  return new Promise((resolve) => {
    setTimeout(() => {
      const mockResponse: TopUpResponse = {
        ok: true,
        topUpOrder: {
          id: `topup-${Date.now()}`,
          userId: "mock-user-id",
          walletId: "mock-wallet-id",
          amountTokens: request.amountTokens,
          paymentMethod: request.paymentMethod,
          paymentReference: request.paymentReference,
          status: "COMPLETED",
          memo: request.memo || `Top up ${request.amountTokens} tokens`,
          createdAt: new Date().toISOString(),
        },
        transaction: {
          id: `tx-${Date.now()}`,
          type: "TOP_UP",
          amountTokens: request.amountTokens,
          memo: request.memo || `Top up ${request.amountTokens} tokens`,
          createdAt: new Date().toISOString(),
        },
        wallet: {
          balanceTokens: 1000 + request.amountTokens, // Mock balance
          reservedTokens: 0,
          lifetimeTopUp: 1500 + request.amountTokens,
          lifetimeSpent: 500,
        },
      };
      resolve(mockResponse);
    }, 1500);
  });
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