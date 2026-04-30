import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";

const ffmpeg = new FFmpeg();
let isLoaded = false;
let loadingPromise: Promise<void> | null = null;

async function loadFfmpeg() {
  if (isLoaded) return;
  if (!loadingPromise) {
    loadingPromise = ffmpeg
      .load({
        coreURL,
        wasmURL,
      })
      .then(() => undefined)
      .catch((error) => {
        loadingPromise = null;
        throw error;
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

  const data = (await ffmpeg.readFile(output)) as Uint8Array;
  await ffmpeg.deleteFile(input);
  await ffmpeg.deleteFile(output);

  return data;
}

export async function blobToUint8Array(blob: Blob) {
  return await fetchFile(blob);
}
