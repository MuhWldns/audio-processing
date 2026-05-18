'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/Toast';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  // Roblox ID state
  const [robloxId, setRobloxId] = useState(user?.robloxUserId || '');
  const [robloxSaving, setRobloxSaving] = useState(false);
  const [robloxResult, setRobloxResult] = useState<{ username?: string; displayName?: string } | null>(null);

  if (!user) {
    return (
      <div className="space-y-6">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Profile</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Profile</h1>
        <p className="text-slate-300">Silakan login untuk melihat profil.</p>
      </div>
    );
  }

  const handleSaveRobloxId = async () => {
    if (!robloxId.trim()) {
      toast('Roblox User ID tidak boleh kosong', 'error');
      return;
    }

    if (!/^\d+$/.test(robloxId.trim())) {
      toast('Roblox User ID harus berupa angka', 'error');
      return;
    }

    setRobloxSaving(true);
    setRobloxResult(null);

    try {
      const res = await fetch(`${apiBaseUrl}/user/roblox-id`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ robloxUserId: robloxId.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast(data.error || 'Gagal menyimpan Roblox ID', 'error');
        return;
      }

      setRobloxResult({ username: data.robloxUsername, displayName: data.robloxDisplayName });
      toast('Roblox User ID berhasil disimpan!', 'success');
      await refreshUser();
    } catch (err) {
      toast('Gagal menghubungi server', 'error');
    } finally {
      setRobloxSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Profile</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Account Settings</h1>
        <p className="text-slate-300">Kelola akun dan sambungkan Roblox ID kamu.</p>
      </div>

      {/* Account Info */}
      <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-6 sm:p-8 shadow-[var(--shadow-soft)]">
        <h2 className="text-lg font-semibold text-white mb-4">Account Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-400 mb-1">Display Name</p>
            <p className="text-sm text-white">{user.displayName || user.fullName || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Email</p>
            <p className="text-sm text-white">{user.email || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Login Provider</p>
            <p className="text-sm text-white">{user.lastLoginProvider || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Role</p>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
              user.role === 'ADMIN' ? 'bg-violet-500/20 text-violet-300' : 'bg-white/10 text-slate-300'
            }`}>
              {user.role}
            </span>
          </div>
        </div>
      </div>

      {/* Roblox Account Binding */}
      <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-6 sm:p-8 shadow-[var(--shadow-soft)]">
        <h2 className="text-lg font-semibold text-white mb-2">Roblox Account</h2>
        <p className="text-sm text-slate-400 mb-6">
          Sambungkan akun Roblox kamu untuk verifikasi kepemilikan game saat whitelist license.
        </p>

        {/* Current status */}
        {user.robloxUserId && (
          <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400"></span>
              <p className="text-sm text-emerald-300 font-medium">Roblox ID tersambung: {user.robloxUserId}</p>
            </div>
          </div>
        )}

        {/* Input form */}
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Roblox User ID</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={robloxId}
                onChange={(e) => setRobloxId(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Contoh: 123456789"
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-400/50"
              />
              <button
                onClick={handleSaveRobloxId}
                disabled={robloxSaving}
                className="shrink-0 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:scale-[1.02] disabled:opacity-50"
              >
                {robloxSaving ? 'Verifying...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Success result */}
          {robloxResult && (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
              <p className="text-sm text-emerald-300">
                Verified: <strong>{robloxResult.displayName}</strong> (@{robloxResult.username})
              </p>
            </div>
          )}

          {/* Instructions */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-300">Cara menemukan Roblox User ID:</p>
            <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
              <li>Buka browser, login ke <a href="https://www.roblox.com" target="_blank" rel="noopener noreferrer" className="text-violet-300 underline hover:text-violet-200">roblox.com</a></li>
              <li>Klik profil kamu (avatar di kanan atas)</li>
              <li>Lihat URL di address bar:<br/>
                <code className="inline-block mt-1 rounded bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">
                  https://www.roblox.com/users/<strong className="text-violet-300">123456789</strong>/profile
                </code>
              </li>
              <li>Angka <strong className="text-white">123456789</strong> adalah User ID kamu</li>
            </ol>
          </div>

          {/* Why needed */}
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
            <p className="text-xs text-amber-300 font-medium mb-1">Kenapa perlu Roblox User ID?</p>
            <p className="text-xs text-amber-200/70">
              Saat kamu whitelist game untuk license, sistem akan memverifikasi bahwa kamu adalah pemilik game tersebut (atau owner group yang memiliki game). Ini mencegah penyalahgunaan license key.
            </p>
          </div>
        </div>
      </div>

      {/* Wallet Summary */}
      <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-6 sm:p-8 shadow-[var(--shadow-soft)]">
        <h2 className="text-lg font-semibold text-white mb-4">Wallet</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-slate-400">Saldo</p>
            <p className="text-xl font-bold text-white mt-1">
              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(user.walletBalance)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-slate-400">Total Top Up</p>
            <p className="text-xl font-bold text-emerald-400 mt-1">
              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(user.totalTopUp)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-slate-400">Total Spent</p>
            <p className="text-xl font-bold text-rose-400 mt-1">
              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(user.totalSpent)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
