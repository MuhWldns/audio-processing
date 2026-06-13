'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import AdminNav from '@/components/admin/AdminNav';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type ActiveLicense = {
  id: string;
  licenseKey: string;
  licenseType: string;
  lastVerifiedAt: string;
  user: { id: string; email: string; displayName: string };
  product: { id: string; name: string; slug: string };
  activeGames: Array<{ gameId: string; gameName: string | null }>;
  metadata: any;
};

type VerificationLog = {
  id: string;
  licenseId: string;
  gameId: string;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  reason: string | null;
  verifiedAt: string;
};

function maskKey(key: string): string {
  const parts = key.split('-');
  if (parts.length < 5) return key;
  return `${parts[0]}-****-****-****-${parts[parts.length - 1]}`;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function AdminEnforcementPage() {
  const { user } = useAuth();
  const [activeLicenses, setActiveLicenses] = useState<ActiveLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Kill switch
  const [killingId, setKillingId] = useState<string | null>(null);
  const [killReason, setKillReason] = useState('');
  const [killLoading, setKillLoading] = useState(false);

  // Logs viewer
  const [viewingLogsId, setViewingLogsId] = useState<string | null>(null);
  const [logs, setLogs] = useState<VerificationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadActive = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/admin/licenses/active`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setActiveLicenses(data.licenses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    void loadActive();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadActive, 30000);
    return () => clearInterval(interval);
  }, [user, loadActive]);

  const handleKill = async () => {
    if (!killingId) return;
    setKillLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/licenses/${killingId}/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: killReason || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Kill switch failed');
      }
      setKillingId(null);
      setKillReason('');
      void loadActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kill switch failed');
    } finally {
      setKillLoading(false);
    }
  };

  const handleViewLogs = async (licenseId: string) => {
    setViewingLogsId(licenseId);
    setLogsLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/licenses/${licenseId}/logs?limit=30`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch logs');
      const data = await res.json();
      setLogs(data.logs);
    } catch (err) {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="space-y-6">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Admin</p>
        <h1 className="text-4xl font-semibold tracking-tight text-white">Access Denied</h1>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AdminNav />

      <div className="space-y-3">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Admin</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">License Enforcement</h1>
        <p className="text-slate-300">Monitor active licenses in real-time and manage enforcement.</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-slate-400">Active Now</p>
          <p className="text-3xl font-bold text-emerald-400">{activeLicenses.length}</p>
          <p className="text-xs text-slate-500 mt-1">Verified within 5 min</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-slate-400">Unique Games</p>
          <p className="text-3xl font-bold text-violet-300">
            {new Set(activeLicenses.flatMap((l) => l.activeGames.map((g) => g.gameId))).size}
          </p>
          <p className="text-xs text-slate-500 mt-1">Currently running</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-slate-400">Unique Users</p>
          <p className="text-3xl font-bold text-blue-300">
            {new Set(activeLicenses.map((l) => l.user.id)).size}
          </p>
          <p className="text-xs text-slate-500 mt-1">With active sessions</p>
        </div>
      </div>

      {/* Active Licenses Table */}
      <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Active Sessions</h2>
          <button
            onClick={() => { setLoading(true); void loadActive(); }}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <LoadingSkeleton variant="card" rows={3} />
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : activeLicenses.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No active sessions right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="pb-3 pr-4">User</th>
                  <th className="pb-3 pr-4">Product</th>
                  <th className="pb-3 pr-4">License</th>
                  <th className="pb-3 pr-4">Games</th>
                  <th className="pb-3 pr-4">Last Verified</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeLicenses.map((license) => (
                  <tr key={license.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-white">{license.user.displayName}</p>
                      <p className="text-xs text-slate-500">{license.user.email}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-slate-200">{license.product.name}</p>
                      <p className="text-xs text-slate-500">{license.licenseType}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <code className="text-xs text-violet-300">{maskKey(license.licenseKey)}</code>
                    </td>
                    <td className="py-3 pr-4">
                      {license.activeGames.map((g) => (
                        <div key={g.gameId} className="text-xs text-slate-300">
                          {g.gameName || g.gameId}
                        </div>
                      ))}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-xs text-emerald-400">{timeAgo(license.lastVerifiedAt)}</span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewLogs(license.id)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 transition"
                        >
                          Logs
                        </button>
                        <button
                          onClick={() => setKillingId(license.id)}
                          className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/20 transition"
                        >
                          Kill
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Verification Logs Modal */}
      {viewingLogsId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setViewingLogsId(null)}>
          <div className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[#0d0a1a] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Verification Logs</h3>
              <button onClick={() => setViewingLogsId(null)} className="text-slate-400 hover:text-white text-xl">&times;</button>
            </div>

            {logsLoading ? (
              <LoadingSkeleton variant="card" rows={5} />
            ) : logs.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No logs found.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-left text-slate-400">
                    <th className="pb-2 pr-3">Time</th>
                    <th className="pb-2 pr-3">Game ID</th>
                    <th className="pb-2 pr-3">IP</th>
                    <th className="pb-2 pr-3">Result</th>
                    <th className="pb-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-white/5">
                      <td className="py-2 pr-3 text-slate-300">{new Date(log.verifiedAt).toLocaleString('id-ID')}</td>
                      <td className="py-2 pr-3 text-slate-300 font-mono">{log.gameId}</td>
                      <td className="py-2 pr-3 text-slate-400">{log.ipAddress || '-'}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${log.success ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                          {log.success ? 'OK' : 'FAIL'}
                        </span>
                      </td>
                      <td className="py-2 text-slate-400">{log.reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Kill Switch Dialog */}
      {killingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setKillingId(null)}>
          <div className="w-full max-w-md rounded-3xl border border-rose-400/30 bg-[#0d0a1a] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-rose-300 mb-2">Kill Switch</h3>
            <p className="text-sm text-slate-300 mb-4">
              This will immediately suspend the license. The next heartbeat from the game will trigger enforcement (gradual breaking).
            </p>
            <input
              type="text"
              value={killReason}
              onChange={(e) => setKillReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none mb-4 focus:border-rose-400/50"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setKillingId(null)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleKill}
                disabled={killLoading}
                className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
              >
                {killLoading ? 'Killing...' : 'Confirm Kill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
