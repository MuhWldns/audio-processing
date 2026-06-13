'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { fetchLicenseDetail } from '@/lib/api/licenses';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

type LicenseDetailData = {
  id: string;
  publicId?: string | null;
  licenseKey: string;
  licenseType: string;
  status: string;
  maxGames: number | null;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  product: {
    id: string;
    name: string;
    slug: string;
    thumbnail: string | null;
    version: string;
    description?: string;
  };
  purchase?: {
    id: string;
    publicId?: string | null;
    amountRupiah: number;
    purchasedAt: string;
  };
  games: Array<{
    id: string;
    gameId: string;
    gameName: string | null;
    active: boolean;
    addedAt: string;
  }>;
  recentVerifications?: Array<{
    id: string;
    gameId: string;
    success: boolean;
    reason: string;
    verifiedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export default function LicenseDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const licenseId = params.id as string;

  const [license, setLicense] = useState<LicenseDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Add game
  const [newGameId, setNewGameId] = useState('');
  const [newGameName, setNewGameName] = useState('');
  const [addingGame, setAddingGame] = useState(false);
  const [addGameError, setAddGameError] = useState<string | null>(null);

  // Remove game
  const [removingGameId, setRemovingGameId] = useState<string | null>(null);
  const [removeGameLoading, setRemoveGameLoading] = useState(false);

  // Download
  const [downloading, setDownloading] = useState(false);

  // Integration guide
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const data = await fetchLicenseDetail(licenseId);
        setLicense(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'License tidak ditemukan');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user, licenseId]);

  const copyToClipboard = async () => {
    if (!license) return;
    try {
      await navigator.clipboard.writeText(license.licenseKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {}
  };

  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!license) return;
    setAddGameError(null);

    if (!newGameId.trim()) {
      setAddGameError('Game ID wajib diisi.');
      return;
    }

    setAddingGame(true);
    try {
      const res = await fetch(`${apiBaseUrl}/licenses/${license.id}/whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ gameId: newGameId.trim(), gameName: newGameName.trim() || undefined }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Gagal menambahkan game');
      }

      const result = await res.json();
      setLicense((prev) => prev ? {
        ...prev,
        games: [...prev.games, result.game],
      } : prev);
      setNewGameId('');
      setNewGameName('');
    } catch (err) {
      setAddGameError(err instanceof Error ? err.message : 'Gagal menambahkan game');
    } finally {
      setAddingGame(false);
    }
  };

  const handleRemoveGame = async () => {
    if (!license || !removingGameId) return;
    setRemoveGameLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/licenses/${license.id}/whitelist/${removingGameId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Gagal menghapus game');
      }

      setLicense((prev) => prev ? {
        ...prev,
        games: prev.games.filter((g) => g.id !== removingGameId),
      } : prev);
      setRemovingGameId(null);
    } catch (err) {
      setAddGameError(err instanceof Error ? err.message : 'Gagal menghapus game');
    } finally {
      setRemoveGameLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!license) return;
    setDownloading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/licenses/${license.id}/download`, {
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Download gagal');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${license.product.slug}-v${license.product.version}.lua`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download gagal');
    } finally {
      setDownloading(false);
    }
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">License</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">License Detail</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">Silakan login terlebih dahulu.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <Link href="/dashboard/licenses" className="inline-flex text-sm font-medium text-violet-300 hover:text-violet-200 transition">
          ← Back to My Licenses
        </Link>
        <LoadingSkeleton variant="card" rows={2} />
      </div>
    );
  }

  if (error || !license) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/licenses" className="inline-flex text-sm font-medium text-violet-300 hover:text-violet-200 transition">
          ← Back to My Licenses
        </Link>
        <div className="space-y-2">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">License Tidak Ditemukan</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">{error}</p>
        </div>
      </div>
    );
  }

  const activeGames = license.games.filter((g) => g.active);
  const maxReached = license.maxGames !== null && activeGames.length >= license.maxGames;
  const isSuspended = license.status === 'SUSPENDED' || license.status === 'REVOKED';

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link href="/dashboard/licenses" className="inline-flex text-sm font-medium text-violet-300 hover:text-violet-200 transition">
        ← Back to My Licenses
      </Link>

      {/* License header */}
      <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white">{license.product.name}</h1>
            <p className="text-sm text-slate-400">{license.licenseType} License · {license.publicId || license.id}</p>
          </div>
          <StatusBadge status={license.status} />
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-3">
          {license.purchase && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-slate-400">Purchased</p>
              <p className="font-medium text-white">{formatDate(license.purchase.purchasedAt)}</p>
              <p className="text-xs font-mono text-violet-300 mt-0.5">{license.purchase.publicId || license.purchase.id}</p>
              <p className="text-xs text-slate-400 mt-0.5">{formatRupiah(license.purchase.amountRupiah)}</p>
            </div>
          )}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-slate-400">Version</p>
            <p className="font-medium text-white">v{license.product.version}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-slate-400">Last Verified</p>
            <p className="font-medium text-white">{license.lastVerifiedAt ? formatDate(license.lastVerifiedAt) : 'Never'}</p>
          </div>
        </div>
      </div>

      {/* Suspended warning */}
      {isSuspended && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-4">
          <p className="text-sm text-rose-300">License ini sedang {license.status.toLowerCase()}. Download dan verifikasi tidak tersedia. Hubungi support jika ada pertanyaan.</p>
        </div>
      )}

      {/* License key */}
      <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-4">
        <h2 className="text-lg font-semibold text-white">License Key</h2>
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <code className="flex-1 font-mono text-sm text-white break-all select-all">{license.licenseKey}</code>
          <button
            type="button"
            onClick={copyToClipboard}
            className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-violet-500/10 hover:border-violet-300/30"
          >
            {copiedKey ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Download */}
      {!isSuspended && (
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-4">
          <h2 className="text-lg font-semibold text-white">Script Download</h2>
          <p className="text-sm text-slate-400">Version: {license.product.version}</p>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02] disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {downloading ? 'Downloading...' : 'Download Script'}
          </button>
        </div>
      )}

      {/* Game Whitelist */}
      <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Game Whitelist</h2>
          <span className="text-sm text-slate-400">
            {activeGames.length}{license.maxGames ? `/${license.maxGames}` : ''} games
          </span>
        </div>

        {/* Progress bar */}
        {license.maxGames && (
          <div className="h-2 w-full rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
              style={{ width: `${Math.min((activeGames.length / license.maxGames) * 100, 100)}%` }}
            />
          </div>
        )}

        {/* Game list */}
        {activeGames.length > 0 ? (
          <div className="space-y-2">
            {activeGames.map((game) => (
              <div key={game.id} className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{game.gameName || game.gameId}</p>
                  {game.gameName && <p className="text-xs text-slate-400">ID: {game.gameId}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setRemovingGameId(game.id)}
                  className="rounded-full border border-rose-400/20 bg-rose-400/5 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-400/10"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Belum ada game yang di-whitelist.</p>
        )}

        {/* Add game form */}
        {!maxReached && !isSuspended && (
          <form onSubmit={handleAddGame} className="space-y-3 border-t border-white/[0.08] pt-6">
            <h3 className="text-sm font-semibold text-slate-200">Add Game</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={newGameId}
                onChange={(e) => setNewGameId(e.target.value)}
                placeholder="Game ID (Roblox Place ID)"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-violet-400/50"
              />
              <input
                type="text"
                value={newGameName}
                onChange={(e) => setNewGameName(e.target.value)}
                placeholder="Game name (optional)"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-violet-400/50"
              />
            </div>
            {addGameError && <p className="text-xs text-rose-300">{addGameError}</p>}
            <button
              type="submit"
              disabled={addingGame}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10 disabled:opacity-50"
            >
              {addingGame ? 'Menambahkan...' : '+ Add Game'}
            </button>
          </form>
        )}

        {maxReached && !isSuspended && (
          <p className="text-xs text-amber-300">Maximum games reached. Upgrade tier untuk menambah lebih banyak games.</p>
        )}
      </div>

      {/* Recent Verifications */}
      {license.recentVerifications && license.recentVerifications.length > 0 && (
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-4">
          <h2 className="text-lg font-semibold text-white">Recent Verifications</h2>
          <div className="space-y-2">
            {license.recentVerifications.slice(0, 10).map((v) => (
              <div key={v.id} className="flex items-center gap-3 text-sm">
                {v.success ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                    <svg className="h-3 w-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/20">
                    <svg className="h-3 w-3 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                )}
                <span className="text-slate-300">{v.gameId}</span>
                <span className="text-slate-500">—</span>
                <span className={v.success ? 'text-emerald-300' : 'text-rose-300'}>{v.reason}</span>
                <span className="ml-auto text-xs text-slate-500">{formatDate(v.verifiedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Integration guide */}
      <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset]">
        <button
          type="button"
          onClick={() => setGuideOpen(!guideOpen)}
          className="flex w-full items-center justify-between text-left"
        >
          <h2 className="text-lg font-semibold text-white">Cara Integrasi di Roblox Studio</h2>
          <svg className={`h-5 w-5 text-slate-400 transition ${guideOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {guideOpen && (
          <ol className="mt-4 space-y-3 text-sm text-slate-300">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">1</span>
              <span>Download script dari tombol di atas</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">2</span>
              <span>Paste script di ServerScriptService</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">3</span>
              <span>Set <code className="font-mono bg-white/10 px-1.5 py-0.5 rounded">LICENSE_KEY = &quot;{license.licenseKey}&quot;</code></span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">4</span>
              <span>Enable HttpService di Game Settings</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">5</span>
              <span>Publish game — license akan auto-verify saat game start</span>
            </li>
          </ol>
        )}
      </div>

      {/* Confirm remove game dialog */}
      <ConfirmDialog
        open={!!removingGameId}
        title="Remove Game"
        description="Yakin ingin menghapus game ini dari whitelist?"
        confirmLabel="Remove"
        variant="danger"
        loading={removeGameLoading}
        onConfirm={handleRemoveGame}
        onCancel={() => setRemovingGameId(null)}
      />
    </div>
  );
}
