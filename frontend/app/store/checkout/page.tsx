'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { fetchCart, checkout, type CartItem } from '@/lib/api/cart';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

export default function CheckoutPage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<CartItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        const data = await fetchCart();
        if (data.items.length === 0) {
          router.replace('/store/cart');
          return;
        }
        setItems(data.items);
        setTotal(data.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat data');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [user, router]);

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Checkout</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Checkout</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">Silakan login terlebih dahulu.</p>
        </div>
      </div>
    );
  }

  const walletBalance = user.walletBalance;
  const sufficient = walletBalance >= total;
  const balanceAfter = walletBalance - total;

  const handleCheckout = async () => {
    setError(null);
    setProcessing(true);

    try {
      const result = await checkout();
      // Store result in sessionStorage for success page
      sessionStorage.setItem('checkout_result', JSON.stringify(result));
      await refreshUser();
      router.push('/store/checkout/success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout gagal');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-3">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Checkout</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Konfirmasi Pembelian</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">Review pesanan Anda sebelum melanjutkan.</p>
      </div>

      {loading ? (
        <LoadingSkeleton variant="table" rows={3} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Order review */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Items</h2>
            <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] overflow-hidden">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-4 p-5 ${i < items.length - 1 ? 'border-b border-white/[0.06]' : ''}`}
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                    {item.product.thumbnail ? (
                      <img src={item.product.thumbnail} alt={item.product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <svg className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{item.product.name}</p>
                    <p className="text-xs text-slate-400">{item.licenseType} License</p>
                  </div>
                  <p className="text-sm font-semibold text-violet-300 shrink-0">{formatRupiah(item.priceRupiah)}</p>
                </div>
              ))}
            </div>

            <Link
              href="/store/cart"
              className="inline-flex text-sm font-medium text-violet-300 hover:text-violet-200 transition"
            >
              ← Edit keranjang
            </Link>
          </div>

          {/* Payment summary */}
          <div className="lg:sticky lg:top-24">
            <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-5">
              <h2 className="text-lg font-semibold text-white">Pembayaran</h2>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Total</span>
                  <span className="font-semibold text-white">{formatRupiah(total)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Saldo wallet</span>
                  <span className={`font-medium ${sufficient ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {formatRupiah(walletBalance)}
                  </span>
                </div>
                {sufficient && (
                  <div className="flex items-center justify-between text-sm border-t border-white/10 pt-3">
                    <span className="text-slate-400">Saldo setelah</span>
                    <span className="font-medium text-white">{formatRupiah(balanceAfter)}</span>
                  </div>
                )}
              </div>

              {!sufficient && (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-4 space-y-3">
                  <p className="text-sm text-rose-300">Saldo tidak cukup. Kurang {formatRupiah(total - walletBalance)}.</p>
                  <Link
                    href="/topup"
                    className="inline-flex w-full items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 px-6 py-2.5 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/20"
                  >
                    Top Up Sekarang
                  </Link>
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-4">
                  <p className="text-sm text-rose-300">{error}</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleCheckout}
                disabled={!sufficient || processing}
                className="w-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Memproses pembelian...' : 'Konfirmasi Pembelian'}
              </button>

              <p className="text-xs text-slate-500 text-center">
                Dengan mengklik tombol di atas, saldo wallet Anda akan dipotong sebesar {formatRupiah(total)}.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
