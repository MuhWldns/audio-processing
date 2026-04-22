import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

const ffmpeg = new FFmpeg();
let isLoaded = false;
let loadingPromise: Promise<void> | null = null;

const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist`;

async function loadFfmpeg() {
  if (isLoaded) return;
  if (!loadingPromise) {
    loadingPromise = ffmpeg.load({
      coreURL: `${CORE_BASE}/ffmpeg-core.js`,
      wasmURL: `${CORE_BASE}/ffmpeg-core.wasm`,
    });
  }
  await loadingPromise;
  isLoaded = true;
}

export async function transcodeWavTo(buffer: Uint8Array, format: "mp3" | "ogg") {
  await loadFfmpeg();

  const input = "input.wav";
  const output = `output.${format}`;

  await ffmpeg.writeFile(input, buffer);

  if (format === "mp3") {
    await ffmpeg.exec(["-i", input, "-codec:a", "libmp3lame", "-q:a", "2", output]);
  } else {
    await ffmpeg.exec(["-i", input, "-codec:a", "libvorbis", "-q:a", "4", output]);
  }

  const data = await ffmpeg.readFile(output);
  await ffmpeg.deleteFile(input);
  await ffmpeg.deleteFile(output);

  return data;
}

export async function blobToUint8Array(blob: Blob) {
  return await fetchFile(blob);
}
