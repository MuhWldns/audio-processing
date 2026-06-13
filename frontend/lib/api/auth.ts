export type AuthUser = {
  id: string;
  publicId?: string | null;
  email: string | null;
  username: string | null;
  fullName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  lastLoginProvider: "GOOGLE" | "DISCORD" | null;
  role: "USER" | "ADMIN";
  robloxUserId: string | null;
  // Wallet (single source of truth, in Rupiah)
  walletBalance: number;
  totalTopUp: number;
  totalSpent: number;
  // Audio quota
  freeAudio: {
    dateKey: string;
    usedToday: number;
    dailyLimit: number;
    paidAudioCost: number;
  };
  providers: Array<"GOOGLE" | "DISCORD">;
};

type MeResponse = {
  user: AuthUser | null;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

export function getGoogleLoginUrl(): string {
  return authUrls.google;
}

export function getDiscordLoginUrl(): string {
  return authUrls.discord;
}
