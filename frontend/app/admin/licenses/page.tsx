'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  fetchAdminLicenses,
  updateLicenseStatus,
  type AdminLicense,
  type Pagination as PaginationType,
} from '@/lib/api/admin';
import AdminNav from '@/components/admin/AdminNav';
import StatusBadge from '@/components/ui/StatusBadge';
import Pagination from '@/components/ui/Pagination';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

const statusFilters = ['ALL', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED'] as const;

function maskKey(key: string): string {
  // RBXR-A2B3-C4D5-E6F7-G8H9 → RBXR-****-****-****-G8H9
  const parts = key.split('-');
  if (parts.length < 5) return key;
  return `${parts[0]}-****-****-****-${parts[parts.length - 1]}`;
}

export default function AdminLicensesPage() {
  const { user } = useAuth();
  const [licenses, setLicenses] = useState<AdminLicense[]>([]);
  const [pagination, setPagination] = useState<PaginationType>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Status update modal
  const [updatingLicense, setUpdatingLicense] = useState<AdminLicense | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [reason, setReason] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const loadLicenses = async (page = 1, status?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminLicenses({
        page,
        limit: 50,
        status: status && status !== 'ALL' ? status : undefined,
      });
      setLicenses(data.licenses);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat licenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    void loadLicenses(1, statusFilter);
  }, [user, statusFilter]);

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Admin</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Access Denied</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">Anda tidak memiliki akses ke halaman ini.</p>
        </div>
      </div>
    );
  }

  const openUpdateModal = (license: AdminLicense) => {
    setUpdatingLicense(license);
    setNewStatus(license.status);
    setReason('');
    setUpdateError(null);
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingLicense) return;
    setUpdateError(null);

    if (!newStatus) {
      setUpdateError('Pilih status baru.');
      return;
    }

    if ((newStatus === 'SUSPENDED' || newStatus === 'REVOKED') && !reason.trim()) {
      setUpdateError('Alasan wajib diisi untuk suspend/revoke.');
      return;
    }

    setUpdateLoading(true);
    try {
      await updateLicenseStatus(updatingLicense.id, newStatus, reason.trim() || undefined);
      setUpdatingLicense(null);
      void loadLicenses(pagination.page, statusFilter);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Gagal mengupdate status');
    } finally {
      setUpdateLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-4">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Admin Panel</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Licenses</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">Kelola semua license yang telah diterbitkan.</p>
      </div>

      <AdminNav />

      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-2">
        {statusFilters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-4 py-2 text-xs font-medium transition ${
              statusFilter === s
                ? 'bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/30'
                : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {s === 'ALL' ? 'All' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSkeleton variant="table" rows={6} />
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      ) : licenses.length === 0 ? (
        <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-12 text-center shadow-[var(--shadow-soft)]">
          <p className="text-lg text-slate-300">Tidak ada license ditemukan.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-4 font-medium">User</th>
                    <th className="px-4 py-4 font-medium">Product</th>
                    <th className="px-4 py-4 font-medium">Key</th>
                    <th className="px-4 py-4 font-medium">Type</th>
                    <th className="px-4 py-4 font-medium">Status</th>
                    <th className="px-4 py-4 font-medium">Games</th>
                    <th className="px-4 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((license) => (
                    <tr key={license.id} className="border-b border-white/[0.04] last:border-0 transition hover:bg-white/[0.02]">
                      <td className="px-6 py-4">
                        <p className="text-white text-xs">{license.user.displayName}</p>
                        <p className="text-xs text-slate-400">{license.user.email}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-200">{license.product.name}</td>
                      <td className="px-4 py-4">
                        <code className="text-xs font-mono text-slate-300">{maskKey(license.licenseKey)}</code>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                          {license.licenseType}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={license.status} />
                      </td>
                      <td className="px-4 py-4 text-slate-300">
                        {license._count.gameWhitelist}
                        {license.maxGames ? `/${license.maxGames}` : ''}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openUpdateModal(license)}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-violet-500/10 hover:border-violet-300/30"
                        >
                          Update Status
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={(p) => void loadLicenses(p, statusFilter)}
          />
        </div>
      )}

      {/* Update Status Modal */}
      {updatingLicense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setUpdatingLicense(null)} />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset]">
            <h3 className="text-lg font-semibold text-white mb-2">Update License Status</h3>
            <p className="text-sm text-slate-400 mb-6">
              {updatingLicense.product.name} — {maskKey(updatingLicense.licenseKey)}
            </p>

            <form onSubmit={handleUpdateStatus} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-200">Status Baru</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="REVOKED">REVOKED</option>
                </select>
              </div>

              {(newStatus === 'SUSPENDED' || newStatus === 'REVOKED') && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-200">
                    Alasan <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Alasan suspend/revoke..."
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30 resize-none"
                  />
                </div>
              )}

              {updateError && <p className="text-sm text-rose-300">{updateError}</p>}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUpdatingLicense(null)}
                  disabled={updateLoading}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={updateLoading}
                  className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-50"
                >
                  {updateLoading ? 'Memproses...' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
