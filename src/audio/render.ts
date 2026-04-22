import { createImpulseResponse } from "./impulse";
import type { EngineParams } from "./audioEngine";

export async function renderProcessedBuffer(input: AudioBuffer, params: EngineParams) {
  const offline = new OfflineAudioContext(input.numberOfChannels, input.length, input.sampleRate);

  const source = offline.createBufferSource();
  source.buffer = input;

  const low = offline.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 120;

  const mid = offline.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 1200;
  mid.Q.value = 0.9;

  const high = offline.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 5000;

  const convolver = offline.createConvolver();
  convolver.buffer = createImpulseResponse(offline, 2.2, 2.3);

  const dry = offline.createGain();
  const wet = offline.createGain();
  const master = offline.createGain();

  low.connect(mid);
  mid.connect(high);
  high.connect(dry);
  high.connect(convolver);
  convolver.connect(wet);
  dry.connect(master);
  wet.connect(master);
  master.connect(offline.destination);

  low.gain.value = params.low;
  mid.gain.value = params.mid;
  high.gain.value = params.high;
  master.gain.value = params.gain;

  const wetValue = Math.min(1, Math.max(0, params.reverb));
  wet.gain.value = wetValue;
  dry.gain.value = 1 - wetValue;

  source.connect(low);
  source.start(0);

  return await offline.startRendering();
}
