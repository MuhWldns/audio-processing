import { useEffect, useMemo, useRef, useState } from "react";
import { createAudioEngine, type EngineParams, type EngineStatus } from "../audio/audioEngine";
import type { ExportFormat } from "../audio/encode";

const defaultParams: EngineParams = {
  gain: 0.9,
  low: 0,
  mid: 0,
  high: 0,
  reverb: 0.15,
  loop: false,
};

export function useAudioEngine() {
  const engine = useMemo(() => createAudioEngine(), []);
  const rafId = useRef<number | null>(null);
  const [params, setParams] = useState<EngineParams>(defaultParams);
  const [status, setStatus] = useState<EngineStatus>(engine.getStatus());

  const updateStatus = () => {
    setStatus(engine.getStatus());
    if (engine.getStatus().isPlaying) {
      rafId.current = window.requestAnimationFrame(updateStatus);
    }
  };

  useEffect(() => {
    return () => {
      if (rafId.current) {
        window.cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  const loadFile = async (file: File) => {
    await engine.loadFile(file);
    setStatus(engine.getStatus());
  };

  const play = () => {
    engine.play();
    updateStatus();
  };

  const stop = () => {
    engine.stop();
    setStatus(engine.getStatus());
  };

  const updateParams = (next: Partial<EngineParams>) => {
    const merged = { ...params, ...next };
    setParams(merged);
    engine.setParams(next);
  };

  const exportProcessedAudio = async (format: ExportFormat) => {
    return await engine.exportProcessedAudio(format);
  };

  return {
    params,
    status,
    loadFile,
    play,
    stop,
    setParams: updateParams,
    exportProcessedAudio,
  };
}
