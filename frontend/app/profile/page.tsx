'use client';

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatRupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Profile</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">User Profile</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">Please log in to view and manage your profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-4">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Profile & Wallet</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Your account details</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">Manage your balance, view usage history, and top up your wallet.</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Left column: User info and wallet */}
        <div className="space-y-6">
          {/* User info panel */}
          <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-6">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Account Information</h2>

              <div className="flex items-center gap-4">
                <img
                  className="h-16 w-16 rounded-full border-2 border-white/10 object-cover"
                  src={user.avatarUrl || "https://ui-avatars.com/api/?name=RBX+Royale&background=8f5bff&color=fff"}
                  alt={user.displayName || user.email || "User"}
                  onError={(event) => {
                    if (event.currentTarget.src !== "https://ui-avatars.com/api/?name=RBX+Royale&background=8f5bff&color=fff") {
                      event.currentTarget.src = "https://ui-avatars.com/api/?name=RBX+Royale&background=8f5bff&color=fff";
                    }
                  }}
                />
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-white">{user.displayName || user.fullName || user.email || "User"}</p>
                  <p className="text-sm text-slate-400">{user.email}</p>
                  <p className="text-sm text-slate-400">Last login: {user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}</p>
                </div>
              </div>
            </div>

            {/* Wallet summary */}
            <div className="space-y-4 border-t border-white/10 pt-6">
              <h2 className="text-xl font-semibold text-white">Wallet</h2>

              <div className="rounded-2xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 p-6 ring-1 ring-white/10">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-slate-300">Saldo</p>
                    <p className="text-4xl font-bold text-white">
                      {formatRupiah(user.walletBalance)}
                    </p>
                    <p className="text-sm text-slate-400">
                      Total top up: {formatRupiah(user.totalTopUp)} · Total spent: {formatRupiah(user.totalSpent)}
                    </p>
                  </div>
                  <div className="rounded-full bg-violet-500/20 p-3">
                    <svg className="h-8 w-8 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Usage stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-slate-400">Free Audio Today</p>
                  <p className="text-2xl font-bold text-white">
                    {user.freeAudio?.usedToday ?? 0}
                    <span className="text-base font-normal text-slate-300">/</span>
                    {user.freeAudio?.dailyLimit ?? 3}
                  </p>
                  <p className="text-xs text-slate-400">Resets daily</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-slate-400">Audio Cost</p>
                  <p className="text-2xl font-bold text-white">
                    {formatRupiah(user.freeAudio?.paidAudioCost ?? 2000)}
                  </p>
                  <p className="text-xs text-slate-400">Per audio (after free quota)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-4">
            <h2 className="text-xl font-semibold text-white">Top Up Saldo</h2>
            <p className="text-slate-300">Isi saldo menggunakan QRIS. Nominal Rupiah langsung masuk ke wallet Anda.</p>
            <Link
              href="/topup"
              className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
            >
              Buka halaman top up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
