'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { fetchCart, removeFromCart, type CartItem } from '@/lib/api/cart';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

export default function CartPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Remove dialog
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const loadCart = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCart();
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat keranjang');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void loadCart();
  }, [user]);

  const handleRemove = async () => {
    if (!removingId) return;
    setRemoveLoading(true);
    try {
      await removeFromCart(removingId);
      setRemovingId(null);
      void loadCart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus item');
    } finally {
      setRemoveLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Cart</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Keranjang Belanja</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">Silakan login terlebih dahulu.</p>
        </div>
      </div>
    );
  }

  const walletBalance = user.walletBalance;
  const shortfall = total > walletBalance ? total - walletBalance : 0;
  const removingItem = items.find((i) => i.id === removingId);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-3">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Cart</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Keranjang Belanja {!loading && items.length > 0 && `(${items.length})`}
        </h1>
      </div>

      {loading ? (
        <LoadingSkeleton variant="table" rows={3} />
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-12 text-center shadow-[var(--shadow-soft)] space-y-4">
          <svg className="mx-auto h-12 w-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          <p className="text-lg text-slate-300">Keranjang kosong</p>
          <Link
            href="/store/products"
            className="inline-flex rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02]"
          >
            Browse Store
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Cart items */}
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition ${
                  !item.product.active ? 'opacity-50' : ''
                }`}
              >
                {/* Thumbnail */}
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                  {item.product.thumbnail ? (
                    <img src={item.product.thumbnail} alt={item.product.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Link href={`/store/products/${item.product.slug}`} className="text-sm font-semibold text-white hover:text-violet-200 transition">
                    {item.product.name}
                  </Link>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tier: {item.licenseType}
                  </p>
                  {!item.product.active && (
                    <p className="text-xs text-rose-300 mt-1">Produk tidak tersedia</p>
                  )}
                </div>

                {/* Price */}
                <p className="text-sm font-semibold text-violet-300 shrink-0">
                  {formatRupiah(item.priceRupiah)}
                </p>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => setRemovingId(item.id)}
                  className="shrink-0 rounded-full border border-rose-400/20 bg-rose-400/5 p-2 text-rose-300 transition hover:bg-rose-400/10"
                  title="Hapus"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="lg:sticky lg:top-24">
            <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-5">
              <h2 className="text-lg font-semibold text-white">Ringkasan</h2>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Total ({items.length} item)</span>
                  <span className="font-semibold text-white">{formatRupiah(total)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Saldo wallet</span>
                  <span className="font-medium text-white">{formatRupiah(walletBalance)}</span>
                </div>
                {shortfall > 0 && (
                  <div className="flex items-center justify-between text-sm border-t border-white/10 pt-3">
                    <span className="text-amber-300">Kurang</span>
                    <span className="font-semibold text-amber-300">{formatRupiah(shortfall)}</span>
                  </div>
                )}
              </div>

              {shortfall > 0 && (
                <Link
                  href="/topup"
                  className="flex w-full items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 px-6 py-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/20"
                >
                  Top Up Dulu
                </Link>
              )}

              <Link
                href="/store/checkout"
                className={`flex w-full items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02] ${
                  shortfall > 0 ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                Checkout
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Confirm remove dialog */}
      <ConfirmDialog
        open={!!removingId}
        title="Hapus dari Keranjang"
        description={`Hapus "${removingItem?.product.name || ''}" dari keranjang?`}
        confirmLabel="Hapus"
        variant="danger"
        loading={removeLoading}
        onConfirm={handleRemove}
        onCancel={() => setRemovingId(null)}
      />
    </div>
  );
}
