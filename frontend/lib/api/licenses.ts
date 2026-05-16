export type License = {
  id: string;
  licenseKey: string;
  licenseType: 'PERSONAL' | 'COMMERCIAL' | 'ENTERPRISE';
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  maxGames: number | null;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  product: {
    id: string;
    name: string;
    slug: string;
    thumbnail: string | null;
    version: string;
  };
  games: Array<{
    id: string;
    gameId: string;
    gameName: string | null;
    addedAt: string;
  }>;
  verificationCount: number;
  createdAt: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function fetchLicenses(): Promise<{ licenses: License[] }> {
  const res = await fetch(`${apiBaseUrl}/licenses`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to fetch licenses');
  }

  return res.json();
}

export async function fetchLicenseDetail(id: string) {
  const res = await fetch(`${apiBaseUrl}/licenses/${encodeURIComponent(id)}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'License not found');
  }

  return res.json();
}

export async function addGameToWhitelist(licenseId: string, gameId: string, gameName?: string) {
  const res = await fetch(`${apiBaseUrl}/licenses/${encodeURIComponent(licenseId)}/whitelist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ gameId, gameName }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to add game');
  }

  return res.json();
}

export async function removeGameFromWhitelist(licenseId: string, gameWhitelistId: string) {
  const res = await fetch(`${apiBaseUrl}/licenses/${encodeURIComponent(licenseId)}/whitelist/${encodeURIComponent(gameWhitelistId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to remove game');
  }

  return res.json();
}

/**
 * Download license script file
 * Backend returns 302 redirect to presigned B2 URL — browser follows automatically
 */
export function downloadLicenseFile(licenseId: string) {
  window.location.href = `${apiBaseUrl}/licenses/${encodeURIComponent(licenseId)}/download`;
}
