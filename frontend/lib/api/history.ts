export type UploadHistoryItem = {
  id: string;
  fileName: string;
  fileFormat: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELED";
  source: string | null;
  durationSec: number | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
  activity: {
    id: string;
    title: string;
    description: string | null;
    amountTokens: number | null;
    createdAt: string;
  } | null;
};

type HistoryResponse = {
  uploads: UploadHistoryItem[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const historyUrls = {
  list: `${apiBaseUrl}/history`,
  download: (id: string) => `${apiBaseUrl}/history/${id}/download`,
};

export async function fetchUploadHistory() {
  const response = await fetch(historyUrls.list, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to load history");
  }

  return (await response.json()) as HistoryResponse;
}
