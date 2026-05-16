export default function StoreLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="rounded-3xl bg-white/5 p-8 sm:p-12 ring-1 ring-white/10">
        <div className="max-w-2xl space-y-4">
          <div className="h-4 w-24 rounded bg-white/10" />
          <div className="h-10 w-3/4 rounded bg-white/10" />
          <div className="h-5 w-1/2 rounded bg-white/10" />
          <div className="h-10 w-36 rounded-full bg-white/10" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="aspect-[16/10] w-full bg-white/[0.04]" />
            <div className="p-4 space-y-3">
              <div className="h-4 w-3/4 rounded bg-white/10" />
              <div className="h-3 w-1/2 rounded bg-white/10" />
              <div className="h-4 w-1/3 rounded bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
