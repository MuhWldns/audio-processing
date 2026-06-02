'use client';

import Link from 'next/link';

type EmptyStateProps = {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
};

export default function EmptyState({ icon, title, description, actionLabel, actionHref, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/10 text-3xl">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-400">{description}</p>
      {actionLabel && (actionHref || onAction) && (
        <div className="mt-6">
          {actionHref ? (
            <Link
              href={actionHref}
              className="inline-flex rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(168,85,247,0.25)] transition hover:scale-[1.02]"
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              onClick={onAction}
              className="inline-flex rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(168,85,247,0.25)] transition hover:scale-[1.02]"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
