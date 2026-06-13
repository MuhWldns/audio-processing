'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Transaction = {
  id: string;
  publicId?: string | null;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
};

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

export default function WalletPage() {
  const { user } = useAuth();
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/user/transactions?limit=5`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setRecentTx(data.transactions);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user]);

  if (!user) {
    return (
      <div className="space-y-6">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Dashboard</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Wallet</h1>
        <p className="text-slate-300">Silakan login untuk melihat wallet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Dashboard</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Wallet</h1>
        <p className="text-slate-300">Kelola saldo dan lihat riwayat transaksi.</p>
      </div>

      {/* Balance card */}
      <div className="rounded-3xl bg-gradient-to-br from-violet-600/20 via-fuchsia-600/10 to-transparent p-8 ring-1 ring-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <p className="text-sm text-slate-300">Saldo Saat Ini</p>
            <p className="text-4xl sm:text-5xl font-bold text-white mt-1">{formatRupiah(user.walletBalance)}</p>
          </div>
          <Link
            href="/topup"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
          >
            Top Up Sekarang
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-slate-400">Total Top Up</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{formatRupiah(user.totalTopUp)}</p>
          <p className="text-xs text-slate-500 mt-1">Sepanjang waktu</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-slate-400">Total Pengeluaran</p>
          <p className="text-2xl font-bold text-rose-400 mt-1">{formatRupiah(user.totalSpent)}</p>
          <p className="text-xs text-slate-500 mt-1">Pembelian + audio</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-slate-400">Free Audio Hari Ini</p>
          <p className="text-2xl font-bold text-blue-300 mt-1">
            {user.freeAudio.usedToday} / {user.freeAudio.dailyLimit}
          </p>
          <p className="text-xs text-slate-500 mt-1">Reset setiap hari</p>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Transaksi Terakhir</h2>
          <Link
            href="/dashboard/transactions"
            className="text-sm font-medium text-violet-300 hover:text-violet-200 transition"
          >
            Lihat semua
          </Link>
        </div>

        {loading ? (
          <LoadingSkeleton variant="card" rows={3} />
        ) : recentTx.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">Belum ada transaksi.</p>
        ) : (
          <div className="space-y-2">
            {recentTx.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{tx.description || tx.type}</p>
                  <p className="text-xs text-slate-500">{tx.publicId || tx.id} · {formatDate(tx.createdAt)}</p>
                </div>
                <p className={`text-sm font-semibold shrink-0 ${tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {tx.amount >= 0 ? '+' : ''}{formatRupiah(tx.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/topup"
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-violet-300/30 hover:bg-violet-500/10"
        >
          <p className="text-base font-semibold text-white">Top Up via QRIS</p>
          <p className="text-sm text-slate-400 mt-1">Isi saldo menggunakan e-wallet atau mobile banking</p>
        </Link>
        <Link
          href="/store"
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-violet-300/30 hover:bg-violet-500/10"
        >
          <p className="text-base font-semibold text-white">Browse Store</p>
          <p className="text-sm text-slate-400 mt-1">Gunakan saldo untuk membeli script premium</p>
        </Link>
      </div>
    </div>
  );
}
