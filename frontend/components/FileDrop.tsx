'use client';

import type { ChangeEvent } from "react";

type FileDropProps = {
  onFile: (file: File) => void;
  fileName?: string;
};

export default function FileDrop({ onFile, fileName }: FileDropProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFile(file);
    }
  };

  return (
    <label className="flex items-center gap-4 rounded-2xl border border-dashed border-[rgba(193,121,255,0.28)] p-6 cursor-pointer transition-all duration-200 hover:border-[var(--accent)] hover:bg-[linear-gradient(135deg,rgba(127,87,255,0.14),rgba(25,20,45,0.92))] hover:-translate-y-px hover:shadow-[var(--shadow-soft),0_0_28px_rgba(142,92,255,0.12)] active:translate-y-px active:scale-[0.99] active:shadow-none">
      <input type="file" accept="audio/*" onChange={handleChange} className="hidden" />
      <div>
        <p className="font-semibold text-[var(--text)]">Upload audio</p>
        <p className="mt-1 text-sm text-[var(--text-subtle)]">
          {fileName ? fileName : "Drop a file or click to browse"}
        </p>
      </div>
    </label>
  );
}
