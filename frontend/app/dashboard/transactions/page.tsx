'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import Pagination from '@/components/ui/Pagination';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Transaction = {
  id: string;
  publicId?: string | null;
  type: 'TOP_UP' | 'PURCHASE' | 'AUDIO_CHARGE' | 'REFUND' | 'ADJUSTMENT';
  amount: number;
  balanceAfter: number;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
};

const typeLabels: Record<string, string> = {
  TOP_UP: 'Top Up',
  PURCHASE: 'Pembelian',
  AUDIO_CHARGE: 'Audio Processing',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
};

const typeColors: Record<string, string> = {
  TOP_UP: 'bg-emerald-500/20 text-emerald-300',
  PURCHASE: 'bg-violet-500/20 text-violet-300',
  AUDIO_CHARGE: 'bg-blue-500/20 text-blue-300',
  REFUND: 'bg-amber-500/20 text-amber-300',
  ADJUSTMENT: 'bg-slate-500/20 text-slate-300',
};

const filters = ['ALL', 'TOP_UP', 'PURCHASE', 'AUDIO_CHARGE', 'REFUND', 'ADJUSTMENT'] as const;

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function TransactionsPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');

  const loadTransactions = useCallback(async (page = 1, type = filter) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (type !== 'ALL') params.set('type', type);

      const res = await fetch(`${apiBaseUrl}/user/transactions?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTransactions(data.transactions);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (!user) return;
    void loadTransactions(1, filter);
  }, [user, filter, loadTransactions]);

  if (!user) {
    return (
      <div className="space-y-6">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Dashboard</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Transaction History</h1>
        <p className="text-slate-300">Silakan login untuk melihat riwayat transaksi.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Dashboard</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Transaction History</h1>
        <p className="text-slate-300">Riwayat semua transaksi wallet kamu.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-2 text-xs font-medium transition ${
              filter === f
                ? 'bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/30'
                : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {f === 'ALL' ? 'Semua' : typeLabels[f] || f}
          </button>
        ))}
      </div>

      {/* Transactions list */}
      <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-6 shadow-[var(--shadow-soft)]">
        {loading ? (
          <LoadingSkeleton variant="card" rows={5} />
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">Belum ada transaksi.</p>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 hover:bg-white/[0.04] transition">
                <div className="flex items-center gap-4 min-w-0">
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${typeColors[tx.type] || 'bg-white/10 text-slate-300'}`}>
                    {typeLabels[tx.type] || tx.type}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{tx.description || '-'}</p>
                    <p className="text-xs text-slate-500">{tx.publicId || tx.id} · {formatDate(tx.createdAt)}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tx.amount >= 0 ? '+' : ''}{formatRupiah(tx.amount)}
                  </p>
                  <p className="text-xs text-slate-500">Saldo: {formatRupiah(tx.balanceAfter)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="mt-6">
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={(p) => loadTransactions(p)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
