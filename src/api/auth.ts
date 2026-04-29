export type AuthUser = {
  id: string;
  email: string | null;
  username: string | null;
  fullName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  lastLoginProvider: "GOOGLE" | "DISCORD" | null;
  wallet: {
    balanceTokens: number;
    reservedTokens: number;
    lifetimeTopUp: number;
    lifetimeSpent: number;
  } | null;
  freeAudio: {
    dateKey: string;
    usedToday: number;
    dailyLimit: number;
    paidAudioTokenCost: number;
  };
  providers: Array<"GOOGLE" | "DISCORD">;
};

type MeResponse = {
  user: AuthUser | null;
};

const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const authUrls = {
  google: `${apiBaseUrl}/auth/google`,
  discord: `${apiBaseUrl}/auth/discord`,
  me: `${apiBaseUrl}/auth/me`,
  logout: `${apiBaseUrl}/auth/logout`,
};

export async function fetchCurrentUser() {
  const response = await fetch(authUrls.me, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to load session");
  }

  return (await response.json()) as MeResponse;
}

export async function logoutUser() {
  const response = await fetch(authUrls.logout, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Logout failed");
  }

  return (await response.json()) as { ok: boolean };
}
