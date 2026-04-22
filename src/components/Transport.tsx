type TransportProps = {
  isReady: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  onExport: () => void;
  isExporting: boolean;
  exportFormat: string;
  exportFormats: { value: string; label: string; supported: boolean }[];
  onExportFormatChange: (value: string) => void;
  loop: boolean;
  onLoopChange: (value: boolean) => void;
  position: number;
  duration: number;
};

const formatTime = (value: number) => {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export function Transport({ isReady, isPlaying, onPlay, onStop, onExport, isExporting, exportFormat, exportFormats, onExportFormatChange, loop, onLoopChange, position, duration }: TransportProps) {
  const progress = duration ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <div className="transport">
      <div className="transport-buttons">
        <button className="primary" onClick={onPlay} disabled={!isReady}>
          {isPlaying ? "Playing" : "Play"}
        </button>
        <button className="ghost" onClick={onStop} disabled={!isReady}>
          Stop
        </button>
        <button className="secondary" onClick={onExport} disabled={!isReady || isExporting}>
          {isExporting ? "Exporting..." : "Download"}
        </button>
      </div>
      <div className="export-format">
        <label>
          Format
          <select value={exportFormat} onChange={(event) => onExportFormatChange(event.target.value)} disabled={!isReady || isExporting}>
            {exportFormats.map((format) => (
              <option key={format.value} value={format.value} disabled={!format.supported}>
                {format.label}
                {!format.supported ? " (unsupported)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="transport-meta">
        <label className="toggle">
          <input type="checkbox" checked={loop} onChange={(event) => onLoopChange(event.target.checked)} disabled={!isReady} />
          Loop
        </label>
        <div className="time">
          {formatTime(position)} / {formatTime(duration)}
        </div>
      </div>
      <div className="progress">
        <div className="bar" style={{ width: `${progress}%` }}></div>
      </div>
    </div>
  );
}
