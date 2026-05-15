'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { fetchLicenses, type License } from '@/lib/api/licenses';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

function maskKey(key: string): string {
  const parts = key.split('-');
  if (parts.length < 5) return key;
  return `${parts[0]}-****-****-****-${parts[parts.length - 1]}`;
}

export default function DashboardLicensesPage() {
  const { user } = useAuth();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const data = await fetchLicenses();
        setLicenses(data.licenses);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat licenses');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user]);

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Licenses</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">My Licenses</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">Silakan login terlebih dahulu.</p>
        </div>
      </div>
    );
  }

  const filteredLicenses = filter === 'all'
    ? licenses
    : licenses.filter((l) => l.status === filter);

  const statusFilters = ['all', 'ACTIVE', 'SUSPENDED', 'EXPIRED'] as const;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-3">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Dashboard</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          My Licenses {!loading && `(${licenses.length})`}
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">Kelola license dan game whitelist Anda.</p>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {statusFilters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-full px-4 py-2 text-xs font-medium transition ${
              filter === s
                ? 'bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/30'
                : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSkeleton variant="card" rows={3} />
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      ) : filteredLicenses.length === 0 ? (
        <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-12 text-center shadow-[var(--shadow-soft)] space-y-4">
          <svg className="mx-auto h-12 w-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <p className="text-lg text-slate-300">
            {filter === 'all' ? 'Belum punya license.' : `Tidak ada license dengan status ${filter}.`}
          </p>
          {filter === 'all' && (
            <Link
              href="/store"
              className="inline-flex rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02]"
            >
              Browse Store
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredLicenses.map((license) => (
            <Link
              key={license.id}
              href={`/dashboard/licenses/${license.id}`}
              className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-violet-300/30 hover:bg-white/[0.05]"
            >
              {/* Thumbnail */}
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                {license.product.thumbnail ? (
                  <img src={license.product.thumbnail} alt={license.product.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white truncate">{license.product.name}</p>
                  <StatusBadge status={license.status} />
                </div>
                <p className="text-xs text-slate-400">{license.licenseType} License</p>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <code className="font-mono">{maskKey(license.licenseKey)}</code>
                  <span>·</span>
                  <span>Games: {license.games.length}{license.maxGames ? `/${license.maxGames}` : ''}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
