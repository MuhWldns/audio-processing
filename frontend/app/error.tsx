'use client';

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center text-center">
      <div className="space-y-6">
        <div className="text-6xl font-bold text-rose-400/30">Error</div>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Something went wrong
        </h1>
        <p className="max-w-md text-slate-300">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <button
            onClick={reset}
            className="inline-flex rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
          >
            Try Again
          </button>
          <a
            href="/"
            className="inline-flex rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
          >
            Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
