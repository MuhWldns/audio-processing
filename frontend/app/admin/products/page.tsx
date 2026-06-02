'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { fetchAdminProducts, deactivateProduct, type AdminProduct, type Pagination as PaginationType } from '@/lib/api/admin';
import AdminNav from '@/components/admin/AdminNav';
import StatusBadge from '@/components/ui/StatusBadge';
import Pagination from '@/components/ui/Pagination';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

export default function AdminProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [pagination, setPagination] = useState<PaginationType>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deactivate dialog
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const loadProducts = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminProducts(page);
      setProducts(data.products);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat produk');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    void loadProducts();
  }, [user]);

  const handleDeactivate = async () => {
    if (!deactivating) return;
    setDeactivateLoading(true);
    try {
      await deactivateProduct(deactivating);
      setDeactivating(null);
      void loadProducts(pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menonaktifkan produk');
    } finally {
      setDeactivateLoading(false);
    }
  };

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

  const deactivatingProduct = products.find((p) => p.id === deactivating);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-4">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Admin Panel</p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Products</h1>
          <Link
            href="/admin/products/new"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
          >
            + Tambah Produk
          </Link>
        </div>
      </div>

      <AdminNav />

      {loading ? (
        <LoadingSkeleton variant="table" rows={6} />
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-12 text-center shadow-[var(--shadow-soft)]">
          <p className="text-lg text-slate-300">Belum ada produk.</p>
          <Link
            href="/admin/products/new"
            className="mt-4 inline-flex rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02]"
          >
            Buat Produk Pertama
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-4 font-medium">Name</th>
                    <th className="px-4 py-4 font-medium">Category</th>
                    <th className="px-4 py-4 font-medium">Price (Personal)</th>
                    <th className="px-4 py-4 font-medium">Licenses</th>
                    <th className="px-4 py-4 font-medium">Status</th>
                    <th className="px-4 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr
                      key={product.id}
                      className={`border-b border-white/[0.04] last:border-0 transition hover:bg-white/[0.02] ${
                        !product.active ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium text-white">{product.name}</p>
                        <p className="text-xs text-slate-400">v{product.version}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-300">
                        {product.category?.name || '-'}
                      </td>
                      <td className="px-4 py-4 text-slate-200">
                        {formatRupiah(product.pricePersonal)}
                      </td>
                      <td className="px-4 py-4 text-slate-300">
                        {product._count.licenses}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={product.active ? 'Active' : 'Inactive'} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/products/${product.id}/edit`}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-violet-500/10 hover:border-violet-300/30"
                          >
                            Edit
                          </Link>
                          {product.active && (
                            <button
                              type="button"
                              onClick={() => setDeactivating(product.id)}
                              className="rounded-full border border-rose-400/20 bg-rose-400/5 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-400/10"
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
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
            onPageChange={(p) => void loadProducts(p)}
          />
        </div>
      )}

      {/* Confirm deactivate dialog */}
      <ConfirmDialog
        open={!!deactivating}
        title="Nonaktifkan Produk"
        description={`Yakin ingin menonaktifkan "${deactivatingProduct?.name || ''}"? Produk tidak akan muncul di store, tapi license yang sudah ada tetap aktif.`}
        confirmLabel="Nonaktifkan"
        variant="danger"
        loading={deactivateLoading}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivating(null)}
      />
    </div>
  );
}
