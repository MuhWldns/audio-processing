'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchProducts, fetchProductCategories, type ProductSummary, type ProductCategory } from '@/lib/api/products';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

export default function StorePage() {
  const [featured, setFeatured] = useState<ProductSummary[]>([]);
  const [newest, setNewest] = useState<ProductSummary[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [featuredData, newestData, catData] = await Promise.all([
          fetchProducts({ featured: true, limit: 6 }),
          fetchProducts({ sort: 'newest', limit: 4 }),
          fetchProductCategories(),
        ]);
        setFeatured(featuredData.products);
        setNewest(newestData.products);
        setCategories(catData.categories);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat data');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-violet-600/20 via-fuchsia-600/10 to-transparent p-8 sm:p-12 ring-1 ring-white/10">
        <div className="max-w-2xl space-y-4">
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Script Store</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Premium Roblox Scripts</h1>
          <p className="text-lg leading-8 text-slate-300">Verified, licensed, dan ready to use. Temukan script berkualitas untuk game Roblox Anda.</p>
          <Link
            href="/store/products"
            className="inline-flex rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
          >
            Browse All Scripts
          </Link>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton variant="card" rows={4} />
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      ) : (
        <>
          {/* Featured Products */}
          {featured.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-white">Featured Scripts</h2>
                <Link href="/store/products?featured=true" className="text-sm font-medium text-violet-300 hover:text-violet-200 transition">
                  Lihat semua
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <section className="space-y-6">
              <h2 className="text-2xl font-semibold text-white">Categories</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/store/products?category=${cat.slug}`}
                    className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-violet-300/30 hover:bg-violet-500/10"
                  >
                    <p className="text-base font-semibold text-white">{cat.name}</p>
                    {cat.description && <p className="text-xs text-slate-400 line-clamp-2">{cat.description}</p>}
                    <p className="text-xs text-violet-300">{cat.productCount} produk</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Newest */}
          {newest.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-white">Newest Additions</h2>
                <Link href="/store/products?sort=newest" className="text-sm font-medium text-violet-300 hover:text-violet-200 transition">
                  Lihat semua
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {newest.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {featured.length === 0 && newest.length === 0 && (
            <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-12 text-center shadow-[var(--shadow-soft)]">
              <p className="text-lg text-slate-300">Coming soon! Script store sedang disiapkan.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Product Card ────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link
      href={`/store/products/${product.slug}`}
      className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden transition hover:border-violet-300/30 hover:bg-white/[0.05] hover:shadow-lg"
    >
      {/* Thumbnail */}
      <div className="aspect-[16/10] w-full bg-white/[0.04] relative overflow-hidden">
        {product.thumbnail || product.image ? (
          <img
            src={product.thumbnail || product.image || ''}
            alt={product.name}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-10 w-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-white line-clamp-1">{product.name}</h3>
          {product.category && (
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400">
              {product.category.name}
            </span>
          )}
        </div>
        {product.shortDesc && (
          <p className="text-xs text-slate-400 line-clamp-2">{product.shortDesc}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-2">
          <p className="text-sm font-semibold text-violet-300">
            Mulai {formatRupiah(product.pricePersonal)}
          </p>
          {product.soldCount > 0 && (
            <p className="text-xs text-slate-500">{product.soldCount} terjual</p>
          )}
        </div>
      </div>
    </Link>
  );
}
