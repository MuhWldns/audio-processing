type UploadResult = {
  ok: boolean;
  upload: {
    id: string;
    fileName: string;
    fileFormat: string;
    createdAt: string;
    costRupiah: number;
    freeCovered: number;
    paidUnits: number;
  };
};

type UploadError = {
  error: string;
  required?: number;
  balance?: number;
  freeRemaining?: number;
};

const uploadUrl = process.env.NEXT_PUBLIC_UPLOAD_URL || "/api/upload";
const apiKey = process.env.NEXT_PUBLIC_UPLOAD_API_KEY || "";

/**
 * Upload processed audio to backend (fire-and-forget, background process)
 * Returns null if upload fails - no error thrown to user
 */
export async function uploadProcessedAudio(file: Blob, fileName: string): Promise<UploadResult | null> {
  const form = new FormData();
  form.append("file", file, fileName);

  try {
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
      credentials: "include",
      body: form,
    });

    const clonedResponse = response.clone();

    if (!response.ok) {
      try {
        const errorData: UploadError = await clonedResponse.json();

        switch (response.status) {
          case 401:
            console.warn("Upload failed: Invalid API key or authentication required");
            break;

          case 402:
            if (errorData.error === "Insufficient balance") {
              console.warn(
                `Upload failed: Insufficient balance. ` +
                `Required: Rp ${errorData.required}, ` +
                `Balance: Rp ${errorData.balance}, ` +
                `Free remaining: ${errorData.freeRemaining}`
              );
            }
            break;

          case 429:
            console.warn("Upload failed: Rate limit exceeded");
            break;

          default:
            console.warn(`Upload failed with status ${response.status}:`, errorData.error);
        }
      } catch (parseError) {
        console.warn(`Upload failed with status ${response.status}`);
      }

      return null;
    }

    return await response.json() as UploadResult;

  } catch (networkError) {
    console.warn("Upload network error:", networkError);
    return null;
  }
}
