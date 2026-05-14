'use client';

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

export default function Transport({
  isReady,
  isPlaying,
  onPlay,
  onStop,
  onExport,
  isExporting,
  exportFormat,
  exportFormats,
  onExportFormatChange,
  loop,
  onLoopChange,
  position,
  duration,
}: TransportProps) {
  const progress = duration ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <div className="grid gap-4">
      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onPlay}
          disabled={!isReady}
          className="rounded-xl border border-transparent px-4 py-2.5 font-semibold transition-all duration-150 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] text-[var(--accent-contrast)] shadow-[0_10px_18px_rgba(142,92,255,0.28)] hover:enabled:bg-gradient-to-br hover:enabled:from-[var(--accent-bright)] hover:enabled:to-[#d7a7ff] hover:enabled:shadow-[0_12px_20px_rgba(142,92,255,0.4)] active:enabled:translate-y-px active:enabled:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
        >
          {isPlaying ? "Previewing..." : "Play preview"}
        </button>
        <button
          onClick={onStop}
          disabled={!isReady}
          className="rounded-xl border border-[var(--border)] bg-transparent px-4 py-2.5 font-semibold text-[var(--text)] transition-all duration-150 hover:enabled:border-[var(--accent)] hover:enabled:bg-[rgba(127,87,255,0.12)] active:enabled:translate-y-px active:enabled:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
        >
          Stop
        </button>
        <button
          onClick={onExport}
          disabled={!isReady || isExporting}
          className="rounded-xl border border-[rgba(193,121,255,0.28)] bg-[rgba(127,87,255,0.12)] px-4 py-2.5 font-semibold text-[var(--text)] transition-all duration-150 hover:enabled:border-[var(--accent)] hover:enabled:text-[var(--accent-contrast)] hover:enabled:bg-gradient-to-r hover:enabled:from-[var(--accent)] hover:enabled:to-[var(--accent-bright)] active:enabled:translate-y-px active:enabled:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
        >
          {isExporting ? "Exporting..." : "Export"}
        </button>
      </div>

      {/* Export format */}
      <div className="flex justify-start">
        <label className="grid gap-1.5 text-xs uppercase tracking-[1.4px] text-[var(--text-subtle)]">
          Export format
          <select
            value={exportFormat}
            onChange={(event) => onExportFormatChange(event.target.value)}
            disabled={!isReady || isExporting}
            className="rounded-[10px] border border-[rgba(193,121,255,0.22)] bg-[rgba(127,87,255,0.12)] px-3 py-2 text-sm font-[inherit] text-[var(--text)] disabled:opacity-60"
          >
            {exportFormats.map((format) => (
              <option
                key={format.value}
                value={format.value}
                disabled={!format.supported}
                className="bg-[#120b25] text-[var(--text)]"
              >
                {format.label}
                {!format.supported ? " (unsupported)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Meta: loop + time */}
      <div className="flex justify-between items-center text-sm text-[var(--text-subtle)]">
        <label className="flex gap-2 items-center">
          <input
            type="checkbox"
            checked={loop}
            onChange={(event) => onLoopChange(event.target.checked)}
            disabled={!isReady}
          />
          Loop preview
        </label>
        <div>
          {formatTime(position)} / {formatTime(duration)}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full overflow-hidden bg-[rgba(127,87,255,0.12)]">
        <div
          className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-bright)]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
