import { createImpulseResponse } from "./impulse";
import { renderProcessedBuffer } from "./render";
import { encodeWav } from "./wav";
import { encodeWithWasm, type ExportFormat } from "./encode";

export type EngineParams = {
  gain: number;
  low: number;
  mid: number;
  high: number;
  reverb: number;
  loop: boolean;
};

export type EngineStatus = {
  isReady: boolean;
  isPlaying: boolean;
  duration: number;
  position: number;
};

export type EngineApi = {
  init: () => Promise<void>;
  loadFile: (file: File) => Promise<void>;
  play: () => void;
  stop: () => void;
  setParams: (params: Partial<EngineParams>) => void;
  getStatus: () => EngineStatus;
  exportProcessedAudio: (format: ExportFormat) => Promise<Blob>;
};

type EngineNodes = {
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  dry: GainNode;
  wet: GainNode;
  master: GainNode;
  convolver: ConvolverNode;
};

export function createAudioEngine(): EngineApi {
  let context: AudioContext | null = null;
  let buffer: AudioBuffer | null = null;
  let source: AudioBufferSourceNode | null = null;
  let nodes: EngineNodes | null = null;
  let isPlaying = false;
  let startTime = 0;
  let offset = 0;
  let params: EngineParams = {
    gain: 0.9,
    low: 0,
    mid: 0,
    high: 0,
    reverb: 0.15,
    loop: false,
  };

  const getStatus = (): EngineStatus => {
    const duration = buffer ? buffer.duration : 0;
    const position = isPlaying ? Math.min(duration, offset + (context ? context.currentTime - startTime : 0)) : offset;

    return {
      isReady: Boolean(buffer),
      isPlaying,
      duration,
      position,
    };
  };

  const ensureContext = async () => {
    if (!context) {
      context = new AudioContext();
    }
    if (context.state === "suspended") {
      await context.resume();
    }
  };

  const buildGraph = () => {
    if (!context) return;

    const low = context.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 120;

    const mid = context.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1200;
    mid.Q.value = 0.9;

    const high = context.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 5000;

    const convolver = context.createConvolver();
    convolver.buffer = createImpulseResponse(context, 2.2, 2.3);

    const dry = context.createGain();
    const wet = context.createGain();
    const master = context.createGain();

    low.connect(mid);
    mid.connect(high);
    high.connect(dry);
    high.connect(convolver);
    convolver.connect(wet);
    dry.connect(master);
    wet.connect(master);
    master.connect(context.destination);

    nodes = { low, mid, high, dry, wet, master, convolver };
    applyParams();
  };

  const applyParams = () => {
    if (!nodes) return;

    nodes.low.gain.value = params.low;
    nodes.mid.gain.value = params.mid;
    nodes.high.gain.value = params.high;
    nodes.master.gain.value = params.gain;

    const wet = Math.min(1, Math.max(0, params.reverb));
    nodes.wet.gain.value = wet;
    nodes.dry.gain.value = 1 - wet;
  };

  const connectSource = () => {
    if (!context || !nodes || !buffer) return;
    source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = params.loop;
    source.connect(nodes.low);
    source.onended = () => {
      if (!source || params.loop) return;
      isPlaying = false;
      offset = 0;
      source.disconnect();
      source = null;
    };
  };

  const init = async () => {
    await ensureContext();
    if (!nodes) {
      buildGraph();
    }
  };

  const loadFile = async (file: File) => {
    await init();
    if (!context) return;

    const data = await file.arrayBuffer();
    buffer = await context.decodeAudioData(data);
    offset = 0;
    isPlaying = false;
  };

  const play = () => {
    if (!context || !buffer || !nodes) return;
    if (isPlaying) return;

    connectSource();
    if (!source) return;

    startTime = context.currentTime;
    source.start(0, offset);
    isPlaying = true;
  };

  const stop = () => {
    if (!context || !source) {
      isPlaying = false;
      offset = 0;
      return;
    }

    isPlaying = false;
    offset = 0;

    source.stop();
    source.disconnect();
    source = null;
  };

  const setParams = (next: Partial<EngineParams>) => {
    params = { ...params, ...next };
    if (source) {
      source.loop = params.loop;
    }
    applyParams();
  };

  const exportProcessedAudio = async (format: ExportFormat) => {
    if (!buffer) {
      throw new Error("No audio loaded");
    }

    const rendered = await renderProcessedBuffer(buffer, params);
    if (format === "wav") {
      return encodeWav(rendered);
    }
    return await encodeWithWasm(rendered, format);
  };

  return {
    init,
    loadFile,
    play,
    stop,
    setParams,
    getStatus,
    exportProcessedAudio,
  };
}
