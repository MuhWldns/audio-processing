'use client';

type StatusVariant = 'active' | 'suspended' | 'revoked' | 'expired' | 'pending' | 'completed' | 'failed' | 'inactive';

const variantStyles: Record<StatusVariant, string> = {
  active: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  completed: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  pending: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  suspended: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  failed: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  revoked: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  expired: 'border-slate-400/30 bg-slate-400/10 text-slate-400',
  inactive: 'border-slate-400/30 bg-slate-400/10 text-slate-400',
};

type Props = {
  status: string;
  className?: string;
};

export default function StatusBadge({ status, className = '' }: Props) {
  const key = status.toLowerCase() as StatusVariant;
  const style = variantStyles[key] || variantStyles.inactive;

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${style} ${className}`}>
      {status}
    </span>
  );
}
