let ffmpegInstance: any = null;
let isLoaded = false;
let loadingPromise: Promise<void> | null = null;

const CORE_VERSION = "0.12.6";
const CDN_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

async function loadFfmpeg() {
  if (isLoaded) return;
  if (!loadingPromise) {
    loadingPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      ffmpegInstance = new FFmpeg();
      await ffmpegInstance.load({
        coreURL: `${CDN_BASE}/ffmpeg-core.js`,
        wasmURL: `${CDN_BASE}/ffmpeg-core.wasm`,
      });
    })()
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

  await ffmpegInstance.writeFile(input, buffer);

  if (format === "mp3") {
    await ffmpegInstance.exec(["-i", input, "-codec:a", "libmp3lame", "-q:a", "2", output]);
  } else {
    await ffmpegInstance.exec(["-i", input, "-codec:a", "libvorbis", "-q:a", "4", output]);
  }

  const data = (await ffmpegInstance.readFile(output)) as Uint8Array;
  await ffmpegInstance.deleteFile(input);
  await ffmpegInstance.deleteFile(output);

  return data;
}

export async function blobToUint8Array(blob: Blob) {
  const { fetchFile } = await import("@ffmpeg/util");
  return await fetchFile(blob);
}
