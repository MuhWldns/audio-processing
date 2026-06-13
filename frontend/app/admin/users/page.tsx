'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import AdminNav from '@/components/admin/AdminNav';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import Pagination from '@/components/ui/Pagination';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type AdminUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN';
  walletBalance: number;
  totalTopUp: number;
  totalSpent: number;
  lastLoginAt: string | null;
  lastLoginProvider: string | null;
  createdAt: string;
  licensesCount: number;
  purchasesCount: number;
};

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Role change
  const [promotingUser, setPromotingUser] = useState<AdminUser | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  // Balance adjust
  const [adjustingUser, setAdjustingUser] = useState<AdminUser | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (search) params.set('search', search);
      if (roleFilter !== 'ALL') params.set('role', roleFilter);

      const res = await fetch(`${apiBaseUrl}/admin/users?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    void loadUsers();
  }, [user, loadUsers]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (user?.role === 'ADMIN') void loadUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, roleFilter, user, loadUsers]);

  const handlePromote = async () => {
    if (!promotingUser) return;
    setRoleLoading(true);
    try {
      const newRole = promotingUser.role === 'ADMIN' ? 'USER' : 'ADMIN';
      const res = await fetch(`${apiBaseUrl}/admin/users/${promotingUser.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed');
      }
      setPromotingUser(null);
      void loadUsers(pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    } finally {
      setRoleLoading(false);
    }
  };

  const handleAdjustBalance = async () => {
    if (!adjustingUser) return;
    setAdjustError(null);

    const amount = Number(adjustAmount);
    if (!amount || amount === 0) {
      setAdjustError('Amount harus angka bukan nol');
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError('Reason wajib diisi');
      return;
    }

    setAdjustLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/users/${adjustingUser.id}/adjust-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount, reason: adjustReason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed');
      }
      setAdjustingUser(null);
      setAdjustAmount('');
      setAdjustReason('');
      void loadUsers(pagination.page);
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : 'Failed to adjust');
    } finally {
      setAdjustLoading(false);
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
        <h1 className="text-3xl font-semibold tracking-tight text-white">User Management</h1>
        <p className="text-slate-300">Manage users, roles, and wallet balances.</p>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="flex-1 min-w-[200px] rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-400/50"
        />
        <div className="flex gap-2">
          {['ALL', 'USER', 'ADMIN'].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                roleFilter === r
                  ? 'bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/30'
                  : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-slate-400">Total Users</p>
          <p className="text-2xl font-bold text-white">{pagination.total}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-slate-400">Admins</p>
          <p className="text-2xl font-bold text-violet-300">{users.filter((u) => u.role === 'ADMIN').length}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-slate-400">Total Platform Balance</p>
          <p className="text-2xl font-bold text-emerald-400">{formatRupiah(users.reduce((s, u) => s + u.walletBalance, 0))}</p>
        </div>
      </div>

      {/* Users table */}
      <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-6 shadow-[var(--shadow-soft)]">
        {loading ? (
          <LoadingSkeleton variant="card" rows={5} />
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="pb-3 pr-4">User</th>
                  <th className="pb-3 pr-4">Role</th>
                  <th className="pb-3 pr-4">Balance</th>
                  <th className="pb-3 pr-4">Licenses</th>
                  <th className="pb-3 pr-4">Last Login</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-white">{u.displayName || u.fullName || 'No name'}</p>
                      <p className="text-xs text-slate-500">{u.email || '-'}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        u.role === 'ADMIN' ? 'bg-violet-500/20 text-violet-300' : 'bg-white/10 text-slate-300'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-white">{formatRupiah(u.walletBalance)}</p>
                      <p className="text-xs text-slate-500">Spent: {formatRupiah(u.totalSpent)}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-slate-300">{u.licensesCount} licenses</p>
                      <p className="text-xs text-slate-500">{u.purchasesCount} purchases</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-xs text-slate-300">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</p>
                      {u.lastLoginProvider && <p className="text-xs text-slate-500">{u.lastLoginProvider}</p>}
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        {u.id !== user.id && (
                          <button
                            onClick={() => setPromotingUser(u)}
                            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 transition"
                          >
                            {u.role === 'ADMIN' ? 'Demote' : 'Promote'}
                          </button>
                        )}
                        <button
                          onClick={() => setAdjustingUser(u)}
                          className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 transition"
                        >
                          Adjust
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="mt-6">
            <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={loadUsers} />
          </div>
        )}
      </div>

      {/* Promote/Demote confirm dialog */}
      {promotingUser && (
        <ConfirmDialog
          open={true}
          title={promotingUser.role === 'ADMIN' ? 'Demote User' : 'Promote to Admin'}
          description={`${promotingUser.role === 'ADMIN' ? 'Demote' : 'Promote'} "${promotingUser.displayName || promotingUser.email}" ${promotingUser.role === 'ADMIN' ? 'to regular user' : 'to admin'}?`}
          confirmLabel={promotingUser.role === 'ADMIN' ? 'Demote' : 'Promote'}
          variant={promotingUser.role === 'ADMIN' ? 'danger' : 'default'}
          loading={roleLoading}
          onConfirm={handlePromote}
          onCancel={() => setPromotingUser(null)}
        />
      )}

      {/* Adjust balance modal */}
      {adjustingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setAdjustingUser(null)}>
          <div className="w-full max-w-md rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[#0d0a1a] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-1">Adjust Balance</h3>
            <p className="text-sm text-slate-400 mb-4">
              {adjustingUser.displayName || adjustingUser.email} — Current: {formatRupiah(adjustingUser.walletBalance)}
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Amount (positive = add, negative = deduct)</label>
                <input
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="e.g. 50000 or -10000"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-400/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Reason (required)</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Refund for failed transaction"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-400/50"
                />
              </div>
            </div>

            {adjustError && <p className="text-xs text-rose-300 mb-3">{adjustError}</p>}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setAdjustingUser(null); setAdjustError(null); }}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjustBalance}
                disabled={adjustLoading}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {adjustLoading ? 'Processing...' : 'Confirm Adjust'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
