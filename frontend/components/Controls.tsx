'use client';

import type { EngineParams } from "@/lib/audio/audioEngine";

type ControlsProps = {
  params: EngineParams;
  onChange: (params: Partial<EngineParams>) => void;
};

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  unit?: string;
};

function Slider({ label, value, min, max, step, onChange, unit }: SliderProps) {
  return (
    <label className="grid gap-2 mt-3">
      <div className="flex justify-between text-[13px] text-[var(--text-subtle)]">
        <span>{label}</span>
        <span>
          {value.toFixed(2)} {unit ? unit : ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function Controls({ params, onChange }: ControlsProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
      <div>
        <h3 className="mb-2 text-base font-semibold text-[var(--text)]">Master</h3>
        <Slider label="Output" value={params.gain} min={0} max={1.2} step={0.01} unit="x" onChange={(value) => onChange({ gain: value })} />
        <Slider label="Reverb" value={params.reverb} min={0} max={1} step={0.01} unit="mix" onChange={(value) => onChange({ reverb: value })} />
      </div>
      <div>
        <h3 className="mb-2 text-base font-semibold text-[var(--text)]">EQ</h3>
        <Slider label="Low" value={params.low} min={-12} max={12} step={0.5} unit="dB" onChange={(value) => onChange({ low: value })} />
        <Slider label="Mid" value={params.mid} min={-12} max={12} step={0.5} unit="dB" onChange={(value) => onChange({ mid: value })} />
        <Slider label="High" value={params.high} min={-12} max={12} step={0.5} unit="dB" onChange={(value) => onChange({ high: value })} />
      </div>
      <div>
        <h3 className="mb-2 text-base font-semibold text-[var(--text)]">More on the way</h3>
        <p className="text-sm text-[var(--text-subtle)] mt-1">Pitch shift and noise reduction are next.</p>
      </div>
    </div>
  );
}
