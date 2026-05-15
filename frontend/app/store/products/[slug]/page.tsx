'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { fetchProductBySlug, type ProductDetail } from '@/lib/api/products';
import { addToCart } from '@/lib/api/cart';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

type LicenseType = 'PERSONAL' | 'COMMERCIAL' | 'ENTERPRISE';

const tiers: { type: LicenseType; label: string; maxGames: string }[] = [
  { type: 'PERSONAL', label: 'Personal', maxGames: '3 games' },
  { type: 'COMMERCIAL', label: 'Commercial', maxGames: '10 games' },
  { type: 'ENTERPRISE', label: 'Enterprise', maxGames: 'Unlimited' },
];

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const slug = params.slug as string;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTier, setSelectedTier] = useState<LicenseType>('PERSONAL');
  const [addingToCart, setAddingToCart] = useState(false);
  const [addToCartSuccess, setAddToCartSuccess] = useState(false);
  const [addToCartError, setAddToCartError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchProductBySlug(slug);
        setProduct(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Produk tidak ditemukan');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [slug]);

  const getPrice = (tier: LicenseType): number => {
    if (!product) return 0;
    switch (tier) {
      case 'PERSONAL': return product.pricePersonal;
      case 'COMMERCIAL': return product.priceCommercial;
      case 'ENTERPRISE': return product.priceEnterprise;
    }
  };

  const handleAddToCart = async () => {
    if (!user) {
      router.push(`/login?redirect=/store/products/${slug}`);
      return;
    }

    if (!product) return;

    setAddingToCart(true);
    setAddToCartError(null);
    setAddToCartSuccess(false);

    try {
      await addToCart(product.id, selectedTier);
      setAddToCartSuccess(true);
      setTimeout(() => setAddToCartSuccess(false), 3000);
    } catch (err) {
      setAddToCartError(err instanceof Error ? err.message : 'Gagal menambahkan ke keranjang');
    } finally {
      setAddingToCart(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <LoadingSkeleton variant="card" rows={2} />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Store</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Produk Tidak Ditemukan</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">{error || 'Produk yang Anda cari tidak tersedia.'}</p>
        </div>
        <Link
          href="/store/products"
          className="inline-flex rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-violet-500/10"
        >
          Kembali ke Store
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/store" className="hover:text-violet-300 transition">Store</Link>
        <span>/</span>
        {product.category && (
          <>
            <Link href={`/store/products?category=${product.category.slug}`} className="hover:text-violet-300 transition">
              {product.category.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-slate-200">{product.name}</span>
      </nav>

      {/* Main content */}
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Left: Image + Description */}
        <div className="space-y-6">
          {/* Product image */}
          <div className="aspect-[16/10] w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            {product.thumbnail ? (
              <img
                src={product.thumbnail}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <svg className="h-16 w-16 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            )}
          </div>

          {/* Additional images */}
          {product.images && product.images.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {product.images.map((img) => (
                <div key={img.id} className="aspect-square overflow-hidden rounded-xl border border-white/10">
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}

          {/* Description */}
          <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-4">
            <h2 className="text-lg font-semibold text-white">Deskripsi</h2>
            <div className="text-sm leading-7 text-slate-300 whitespace-pre-wrap">
              {product.description}
            </div>
          </div>
        </div>

        {/* Right: Product info + Pricing + Add to cart */}
        <div className="space-y-6">
          {/* Product info */}
          <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-5">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white">{product.name}</h1>
              <div className="flex flex-wrap items-center gap-2">
                {product.category && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                    {product.category.name}
                  </span>
                )}
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                  v{product.version}
                </span>
                {product.soldCount > 0 && (
                  <span className="text-xs text-slate-400">{product.soldCount} terjual</span>
                )}
              </div>
            </div>

            {/* Tier selection */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-200">Pilih License Tier</p>
              <div className="grid gap-2">
                {tiers.map((tier) => {
                  const price = getPrice(tier.type);
                  if (price <= 0 && tier.type !== 'PERSONAL') return null;
                  return (
                    <button
                      key={tier.type}
                      type="button"
                      onClick={() => setSelectedTier(tier.type)}
                      className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
                        selectedTier === tier.type
                          ? 'border-violet-400/50 bg-violet-500/10 ring-1 ring-violet-400/30'
                          : 'border-white/10 bg-white/[0.03] hover:border-violet-300/20 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{tier.label}</p>
                        <p className="text-xs text-slate-400">Max {tier.maxGames}</p>
                      </div>
                      <p className="text-base font-bold text-violet-300">{formatRupiah(price)}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Add to cart */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={addingToCart}
                className="w-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addingToCart ? 'Menambahkan...' : `Add to Cart — ${formatRupiah(getPrice(selectedTier))}`}
              </button>

              {addToCartSuccess && (
                <div className="flex items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                  <p className="text-sm text-emerald-300">Ditambahkan ke keranjang!</p>
                  <Link href="/store/cart" className="text-xs font-medium text-emerald-300 underline hover:text-emerald-200">
                    Lihat Cart
                  </Link>
                </div>
              )}

              {addToCartError && (
                <p className="text-sm text-rose-300">{addToCartError}</p>
              )}

              {!user && (
                <p className="text-xs text-slate-400 text-center">Login diperlukan untuk menambahkan ke keranjang.</p>
              )}
            </div>
          </div>

          {/* Tags */}
          {product.tags && product.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {product.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Pricing comparison */}
          <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-4">
            <h3 className="text-base font-semibold text-white">Perbandingan Tier</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-xs text-slate-400">
                    <th className="pb-2 font-medium">Tier</th>
                    <th className="pb-2 font-medium">Harga</th>
                    <th className="pb-2 font-medium">Max Games</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((tier) => {
                    const price = getPrice(tier.type);
                    if (price <= 0 && tier.type !== 'PERSONAL') return null;
                    return (
                      <tr key={tier.type} className="border-b border-white/[0.04] last:border-0">
                        <td className="py-2.5 font-medium text-white">{tier.label}</td>
                        <td className="py-2.5 text-violet-300">{formatRupiah(price)}</td>
                        <td className="py-2.5 text-slate-300">{tier.maxGames}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
