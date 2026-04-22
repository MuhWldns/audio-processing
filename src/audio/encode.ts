export type ExportFormat = "wav" | "mp3" | "ogg";

type FormatOption = {
  format: ExportFormat;
  label: string;
  supported: boolean;
};

const formatLabels: Record<ExportFormat, string> = {
  wav: "WAV",
  mp3: "MP3",
  ogg: "OGG",
};

const formatMime: Record<Exclude<ExportFormat, "wav">, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
};

export const exportExtensions: Record<ExportFormat, string> = {
  wav: "wav",
  mp3: "mp3",
  ogg: "ogg",
};

import { encodeWav } from "./wav";
import { blobToUint8Array, transcodeWavTo } from "./ffmpeg";

export function getExportFormats(): FormatOption[] {
  return (Object.keys(formatLabels) as ExportFormat[]).map((format) => ({
    format,
    label: formatLabels[format],
    supported: true,
  }));
}

export async function encodeWithWasm(buffer: AudioBuffer, format: Exclude<ExportFormat, "wav">) {
  const wavBlob = encodeWav(buffer);
  const wavData = await blobToUint8Array(wavBlob);
  const output = await transcodeWavTo(wavData, format);
  return new Blob([output], { type: formatMime[format] });
}
