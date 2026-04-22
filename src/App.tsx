import { useState } from "react";
import { uploadProcessedAudio } from "./api/upload";
import { exportExtensions, getExportFormats, type ExportFormat } from "./audio/encode";
import { Controls } from "./components/Controls";
import { FileDrop } from "./components/FileDrop";
import { Transport } from "./components/Transport";
import { useAudioEngine } from "./hooks/useAudioEngine";
import "./App.css";

function App() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("wav");
  const { params, status, loadFile, play, stop, setParams, exportProcessedAudio } = useAudioEngine();
  const exportFormats = getExportFormats().map((format) => ({
    value: format.format,
    label: format.label,
    supported: format.supported,
  }));

  const handleFile = async (file: File) => {
    setFileName(file.name);
    await loadFile(file);
  };

  const handleExport = async () => {
    if (!status.isReady || isExporting) return;

    setIsExporting(true);
    setExportMessage("Menyiapkan file...");

    try {
      const audioBlob = await exportProcessedAudio(exportFormat);
      const baseName = fileName ? fileName.replace(/\.[^/.]+$/, "") : "processed";
      const extension = exportExtensions[exportFormat];
      const downloadName = `${baseName}-processed.${extension}`;

      const url = URL.createObjectURL(audioBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      await uploadProcessedAudio(audioBlob, downloadName);
      setExportMessage("Selesai.");
    } catch (error) {
      setExportMessage("Ekspor gagal.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Realtime Web Audio Studio</p>
          <p className="ownership">Owned by RBX Royale Community</p>
          <h1>Shape sound instantly</h1>
          <p className="lead">Upload a track, sculpt EQ, and blend reverb in real time. Pure Web Audio API, no server.</p>
        </div>
        <div className="hero-card">
          <FileDrop onFile={handleFile} fileName={fileName ?? undefined} />
          <Transport
            isReady={status.isReady}
            isPlaying={status.isPlaying}
            onPlay={play}
            onStop={stop}
            onExport={handleExport}
            isExporting={isExporting}
            exportFormat={exportFormat}
            exportFormats={exportFormats}
            onExportFormatChange={(value) => setExportFormat(value as ExportFormat)}
            loop={params.loop}
            onLoopChange={(value) => setParams({ loop: value })}
            position={status.position}
            duration={status.duration}
          />
          {exportMessage ? <p className="export-status">{exportMessage}</p> : null}
        </div>
      </header>

      <section className="panel">
        <Controls params={params} onChange={setParams} />
      </section>
    </div>
  );
}

export default App;
