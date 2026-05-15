'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { fetchAdminAnalytics, type AdminAnalytics } from '@/lib/api/admin';
import AdminNav from '@/components/admin/AdminNav';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;

    const load = async () => {
      try {
        const data = await fetchAdminAnalytics();
        setAnalytics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat data');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [user]);

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

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-4">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Admin Panel</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Overview</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">Ringkasan analytics platform RBX Royale.</p>
      </div>

      <AdminNav />

      {loading ? (
        <LoadingSkeleton variant="stat" />
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      ) : analytics ? (
        <div className="space-y-8">
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Products" value={String(analytics.overview.totalProducts)} color="blue" />
            <StatCard label="Active Licenses" value={String(analytics.overview.totalActiveLicenses)} color="green" />
            <StatCard label="Total Purchases" value={String(analytics.overview.totalPurchases)} color="purple" />
            <StatCard label="Total Revenue" value={formatRupiah(analytics.overview.totalRevenue)} color="orange" />
          </div>

          {/* Recent purchases */}
          <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset]">
            <h2 className="text-lg font-semibold text-white mb-4">Recent Purchases</h2>

            {analytics.recentPurchases.length === 0 ? (
              <p className="text-sm text-slate-400">Belum ada pembelian.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="pb-3 pr-4 font-medium">User</th>
                      <th className="pb-3 pr-4 font-medium">Product</th>
                      <th className="pb-3 pr-4 font-medium">Amount</th>
                      <th className="pb-3 pr-4 font-medium">Tier</th>
                      <th className="pb-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.recentPurchases.map((purchase) => (
                      <tr key={purchase.id} className="border-b border-white/[0.04] last:border-0">
                        <td className="py-3 pr-4">
                          <p className="text-white">{purchase.user.displayName}</p>
                          <p className="text-xs text-slate-400">{purchase.user.email}</p>
                        </td>
                        <td className="py-3 pr-4 text-slate-200">{purchase.product.name}</td>
                        <td className="py-3 pr-4 text-emerald-300 font-medium">{formatRupiah(purchase.amountRupiah)}</td>
                        <td className="py-3 pr-4">
                          <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                            {purchase.licenseType}
                          </span>
                        </td>
                        <td className="py-3 text-slate-400">{formatDate(purchase.purchasedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

type StatCardProps = {
  label: string;
  value: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
};

const colorMap = {
  blue: 'from-blue-500/20 to-blue-600/5 ring-blue-400/20',
  green: 'from-emerald-500/20 to-emerald-600/5 ring-emerald-400/20',
  purple: 'from-violet-500/20 to-violet-600/5 ring-violet-400/20',
  orange: 'from-orange-500/20 to-orange-600/5 ring-orange-400/20',
};

const iconColorMap = {
  blue: 'text-blue-300',
  green: 'text-emerald-300',
  purple: 'text-violet-300',
  orange: 'text-orange-300',
};

function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${colorMap[color]} p-6 ring-1`}>
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${iconColorMap[color]}`}>{value}</p>
    </div>
  );
}
