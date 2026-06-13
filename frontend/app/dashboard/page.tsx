'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { fetchLicenses, type License } from '@/lib/api/licenses';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value));

const fallbackAvatar = "https://ui-avatars.com/api/?name=RBX+Royale&background=8f5bff&color=fff";

export default function DashboardPage() {
  const { user } = useAuth();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [licensesLoading, setLicensesLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchLicenses()
      .then((data) => setLicenses(data.licenses))
      .catch(() => {})
      .finally(() => setLicensesLoading(false));
  }, [user]);

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Dashboard</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Dashboard</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">Silakan login terlebih dahulu.</p>
        </div>
      </div>
    );
  }

  const activeLicenses = licenses.filter((l) => l.status === 'ACTIVE');
  const freeUsed = user.freeAudio?.usedToday ?? 0;
  const freeLimit = user.freeAudio?.dailyLimit ?? 3;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-3">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Dashboard</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Halo, {user.displayName || user.fullName || 'User'}!
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">Selamat datang kembali di RBX Royale.</p>
      </div>

      {/* Cards grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Card */}
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-5">
          <h2 className="text-lg font-semibold text-white">Profile</h2>
          <div className="flex items-center gap-4">
            <img
              className="h-14 w-14 rounded-full border-2 border-white/10 object-cover"
              src={user.avatarUrl || fallbackAvatar}
              alt={user.displayName || user.email || 'User'}
              onError={(e) => {
                if (e.currentTarget.src !== fallbackAvatar) {
                  e.currentTarget.src = fallbackAvatar;
                }
              }}
            />
            <div className="space-y-0.5">
              <p className="text-base font-semibold text-white">{user.displayName || user.fullName || user.email}</p>
              <p className="text-sm text-slate-400">{user.email}</p>
              {user.lastLoginAt && (
                <p className="text-xs text-slate-500">Member since {formatDate(user.lastLoginAt)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Wallet Card */}
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-5">
          <h2 className="text-lg font-semibold text-white">Wallet</h2>
          <div className="rounded-2xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 p-5 ring-1 ring-white/10">
            <p className="text-sm text-slate-400">Saldo</p>
            <p className="mt-1 text-3xl font-bold text-white">{formatRupiah(user.walletBalance)}</p>
            <p className="mt-2 text-xs text-slate-400">
              Total top up: {formatRupiah(user.totalTopUp)} · Spent: {formatRupiah(user.totalSpent)}
            </p>
          </div>
          <Link
            href="/topup"
            className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
          >
            Top Up Saldo
          </Link>
        </div>

        {/* Quota Card */}
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-5">
          <h2 className="text-lg font-semibold text-white">Audio Quota</h2>
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-slate-400">Free audio hari ini</p>
                <p className="mt-1 text-3xl font-bold text-white">
                  {freeUsed}<span className="text-lg font-normal text-slate-400">/{freeLimit}</span>
                </p>
              </div>
              <p className="text-xs text-slate-500">Reset setiap hari</p>
            </div>
            {/* Progress bar */}
            <div className="h-2 w-full rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                style={{ width: `${Math.min((freeUsed / freeLimit) * 100, 100)}%` }}
              />
            </div>
            {freeUsed >= freeLimit && (
              <p className="text-xs text-amber-300">Quota habis. Audio berikutnya akan dikenakan biaya {formatRupiah(user.freeAudio?.paidAudioCost ?? 2000)}/file.</p>
            )}
          </div>
        </div>

        {/* License Summary Card */}
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-5">
          <h2 className="text-lg font-semibold text-white">Licenses</h2>
          {licensesLoading ? (
            <div className="space-y-3">
              <div className="h-8 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
              <div className="h-4 w-40 animate-pulse rounded-lg bg-white/[0.06]" />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-3xl font-bold text-white">
                {activeLicenses.length}
                <span className="text-lg font-normal text-slate-400"> active</span>
              </p>
              {licenses.length === 0 ? (
                <p className="text-sm text-slate-400">Belum punya license. Kunjungi store untuk membeli script.</p>
              ) : (
                <p className="text-sm text-slate-400">{licenses.length} total license dimiliki.</p>
              )}
              <Link
                href="/dashboard/licenses"
                className="inline-flex items-center gap-1 text-sm font-medium text-violet-300 hover:text-violet-200 transition"
              >
                Lihat semua licenses
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickActionCard href="/audio/studio" label="Audio Studio" icon={AudioIcon} />
          <QuickActionCard href="/store" label="Store" icon={StoreIcon} />
          <QuickActionCard href="/dashboard/licenses" label="My Licenses" icon={KeyIcon} />
          <QuickActionCard href="/topup" label="Top Up" icon={WalletIcon} />
        </div>
      </div>
    </div>
  );
}

// ─── Quick Action Card ───────────────────────────────────────────────────────

function QuickActionCard({ href, label, icon: Icon }: { href: string; label: string; icon: React.FC<{ className?: string }> }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-center transition hover:border-violet-300/30 hover:bg-violet-500/10"
    >
      <Icon className="h-7 w-7 text-violet-300" />
      <span className="text-sm font-medium text-slate-200">{label}</span>
    </Link>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function AudioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>
  );
}

function StoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}
