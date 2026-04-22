type UploadResult = {
  fileName: string;
  size: number;
  mimeType: string;
};

const uploadUrl = import.meta.env.VITE_UPLOAD_URL || "/api/upload";
const apiKey = import.meta.env.VITE_UPLOAD_API_KEY || "";

export async function uploadProcessedAudio(file: Blob, fileName: string) {
  const form = new FormData();
  form.append("file", file, fileName);

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: apiKey ? { "x-api-key": apiKey } : undefined,
    body: form,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Upload failed");
  }

  return (await response.json()) as UploadResult;
}
