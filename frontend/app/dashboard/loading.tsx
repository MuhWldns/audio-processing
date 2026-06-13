export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-3">
        <div className="h-4 w-20 rounded bg-white/10" />
        <div className="h-9 w-64 rounded bg-white/10" />
        <div className="h-5 w-96 rounded bg-white/10" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
            <div className="h-5 w-1/3 rounded bg-white/10" />
            <div className="h-8 w-1/2 rounded bg-white/10" />
            <div className="h-4 w-2/3 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
