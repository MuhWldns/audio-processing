import { useEffect, useState } from "react";
import { historyUrls, fetchUploadHistory, type UploadHistoryItem } from "../api/history";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function HistoryPage() {
  const [items, setItems] = useState<UploadHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await fetchUploadHistory();
        setItems(response.uploads);
      } catch {
        setError("Could not load your history right now.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadHistory();
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="eyebrow">History</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Your processed audio history</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">Open any previous track and download it again whenever you need it.</p>
      </div>

      <div className="panel space-y-4">
        {isLoading ? <p className="text-slate-300">Loading your saved tracks...</p> : null}
        {error ? <p className="text-rose-300">{error}</p> : null}
        {!isLoading && !error && items.length === 0 ? <p className="text-slate-300">No saved audio yet. Process one in the studio and it will show up here.</p> : null}

        <div className="grid gap-4">
          {items.map((item) => {
            const downloadName = (item.metadata?.downloadName as string | undefined) || item.fileName;

            return (
              <article key={item.id} className="rounded-3xl border border-white/8 bg-white/5 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-white">{item.fileName}</h2>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.25em] text-violet-100">{item.status}</span>
                    </div>
                    <p className="text-sm text-slate-300">
                      Format: {item.fileFormat.toUpperCase()} · Saved {formatDate(item.createdAt)}
                    </p>
                    <p className="text-sm text-slate-300">{item.activity?.description || "Saved from the studio."}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href={historyUrls.download(item.id)}
                      className="inline-flex items-center justify-center rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.25)] transition hover:scale-[1.02]"
                    >
                      Download again
                    </a>
                    <span className="text-sm text-slate-400">{downloadName}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
