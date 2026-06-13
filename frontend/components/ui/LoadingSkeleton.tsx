'use client';

type Props = {
  rows?: number;
  variant?: 'card' | 'table' | 'stat';
  className?: string;
};

function SkeletonPulse({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-white/[0.06] ${className}`} />
  );
}

function StatSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-3">
      <SkeletonPulse className="h-4 w-24" />
      <SkeletonPulse className="h-8 w-32" />
      <SkeletonPulse className="h-3 w-20" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-3xl border border-[rgba(193,121,255,0.12)] bg-[var(--panel)] p-8 space-y-4">
      <SkeletonPulse className="h-5 w-48" />
      <SkeletonPulse className="h-4 w-full" />
      <SkeletonPulse className="h-4 w-3/4" />
      <SkeletonPulse className="h-10 w-32 mt-4" />
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-4 py-4">
      <SkeletonPulse className="h-4 w-40 flex-1" />
      <SkeletonPulse className="h-4 w-24" />
      <SkeletonPulse className="h-4 w-20" />
      <SkeletonPulse className="h-6 w-16 rounded-full" />
      <SkeletonPulse className="h-8 w-20 rounded-full" />
    </div>
  );
}

export default function LoadingSkeleton({ rows = 5, variant = 'table', className = '' }: Props) {
  if (variant === 'stat') {
    return (
      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`grid gap-6 md:grid-cols-2 ${className}`}>
        {Array.from({ length: rows }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} />
      ))}
    </div>
  );
}
