'use client';

import { useState } from "react";
import { uploadProcessedAudio } from "@/lib/api/upload";
import { exportExtensions, getExportFormats, type ExportFormat } from "@/lib/audio/encode";
import Controls from "@/components/Controls";
import FileDrop from "@/components/FileDrop";
import Transport from "@/components/Transport";
import { useAudioEngine } from "@/hooks/useAudioEngine";

export default function StudioPage() {
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

      setExportMessage("Export complete. File saved locally.");

      // Upload sebagai background process (fire-and-forget)
      uploadProcessedAudio(audioBlob, downloadName)
        .then(uploadResult => {
          if (uploadResult) {
            const cost = uploadResult.upload.costRupiah;
            setExportMessage(
              cost > 0
                ? `Export complete! Uploaded to your account. Charged Rp ${cost.toLocaleString("id-ID")}.`
                : `Export complete! Uploaded to your account (free quota used).`
            );
          }
        })
        .catch(() => {
          // Ignore - background upload
        });
    } catch (exportError) {
      setExportMessage("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-12 pt-[72px] pb-24 px-14 max-[900px]:pt-12 max-[900px]:px-6 max-[900px]:pb-[72px]">
      <header className="grid gap-8 grid-cols-[minmax(280px,1.1fr)_minmax(280px,0.9fr)] items-center max-[900px]:grid-cols-1">
        <div>
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Editor</p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mt-2 rounded-full border border-[var(--border)] bg-[var(--panel-soft)] text-xs font-semibold text-[var(--text-subtle)] tracking-[0.4px]">
            Edit and export your audio
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Make small adjustments, preview the result, and export your track.</h1>
          <p className="text-lg leading-[160%] text-[var(--text-subtle)] max-w-[42ch]">Load a file, fine-tune the sound, and save it as WAV.</p>
        </div>
        <div className="bg-[var(--panel)] border border-[rgba(193,121,255,0.22)] rounded-[20px] p-7 flex flex-col gap-6 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset]">
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
          {exportMessage ? <p className="mt-1 text-[13px] text-[var(--text-subtle)]">{exportMessage}</p> : null}
        </div>
      </header>

      <section className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset]">
        <Controls params={params} onChange={setParams} />
      </section>
    </div>
  );
}
