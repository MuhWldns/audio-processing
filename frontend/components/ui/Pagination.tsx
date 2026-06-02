'use client';

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export default function Pagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');

    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);

    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Prev
      </button>

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-slate-500">...</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`min-w-[36px] rounded-full px-3 py-1.5 text-sm font-medium transition ${
              p === page
                ? 'bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/30'
                : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}
