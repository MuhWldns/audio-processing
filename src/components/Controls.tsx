import type { EngineParams } from "../audio/audioEngine";

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
    <label className="slider">
      <div className="slider-header">
        <span>{label}</span>
        <span>
          {value.toFixed(2)} {unit ? unit : ""}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function Controls({ params, onChange }: ControlsProps) {
  return (
    <div className="controls">
      <div className="control-group">
        <h3>Master</h3>
        <Slider label="Output" value={params.gain} min={0} max={1.2} step={0.01} unit="x" onChange={(value) => onChange({ gain: value })} />
        <Slider label="Reverb" value={params.reverb} min={0} max={1} step={0.01} unit="mix" onChange={(value) => onChange({ reverb: value })} />
      </div>
      <div className="control-group">
        <h3>EQ</h3>
        <Slider label="Low" value={params.low} min={-12} max={12} step={0.5} unit="dB" onChange={(value) => onChange({ low: value })} />
        <Slider label="Mid" value={params.mid} min={-12} max={12} step={0.5} unit="dB" onChange={(value) => onChange({ mid: value })} />
        <Slider label="High" value={params.high} min={-12} max={12} step={0.5} unit="dB" onChange={(value) => onChange({ high: value })} />
      </div>
      <div className="control-group">
        <h3>Coming soon</h3>
        <p className="muted">Pitch shift and noise reduction will land next.</p>
      </div>
    </div>
  );
}
