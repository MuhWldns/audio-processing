type UploadResult = {
  ok: boolean;
  upload: {
    id: string;
    fileName: string;
    fileFormat: string;
    createdAt: string;
    tokenCost: number;
    freeCovered: number;
    paidUnits: number;
  };
};

type UploadError = {
  error: string;
  requiredTokens?: number;
  balanceTokens?: number;
  freeRemaining?: number;
};

const uploadUrl = import.meta.env.VITE_UPLOAD_URL || "/api/upload";
const apiKey = import.meta.env.VITE_UPLOAD_API_KEY || "";

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

    // Clone response for reading body without consuming original
    const clonedResponse = response.clone();
    
    if (!response.ok) {
      try {
        // Try to read error details for logging (but don't throw to user)
        const errorData: UploadError = await clonedResponse.json();
        
        // Log specific error cases for debugging
        switch (response.status) {
          case 401:
            console.warn("Upload failed: Invalid API key or authentication required");
            break;
            
          case 402:
            if (errorData.error === "Not enough tokens") {
              console.warn(
                `Upload failed: Insufficient tokens. ` +
                `Required: ${errorData.requiredTokens}, ` +
                `Balance: ${errorData.balanceTokens}, ` +
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
        // If JSON parsing fails, just log status
        console.warn(`Upload failed with status ${response.status}`);
      }
      
      return null; // Silent failure - don't throw error
    }

    // Success case
    return await response.json() as UploadResult;
    
  } catch (networkError) {
    // Network errors (offline, CORS, etc.) - silent failure
    console.warn("Upload network error:", networkError);
    return null;
  }
}
