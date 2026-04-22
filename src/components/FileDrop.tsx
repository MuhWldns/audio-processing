import type { ChangeEvent } from "react";

type FileDropProps = {
  onFile: (file: File) => void;
  fileName?: string;
};

export function FileDrop({ onFile, fileName }: FileDropProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFile(file);
    }
  };

  return (
    <label className="file-drop">
      <input type="file" accept="audio/*" onChange={handleChange} />
      <div>
        <p className="file-title">Upload audio</p>
        <p className="file-subtitle">{fileName ? fileName : "Drag a file or click to browse"}</p>
      </div>
    </label>
  );
}
