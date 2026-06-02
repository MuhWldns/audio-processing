export default function AdminLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-3">
        <div className="h-4 w-16 rounded bg-white/10" />
        <div className="h-9 w-48 rounded bg-white/10" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
            <div className="h-4 w-1/2 rounded bg-white/10" />
            <div className="h-8 w-2/3 rounded bg-white/10" />
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="h-5 w-40 rounded bg-white/10" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 w-full rounded bg-white/10" />
        ))}
      </div>
    </div>
  );
}
