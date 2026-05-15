'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { fetchProducts, fetchProductCategories, type ProductSummary, type ProductCategory, type Pagination as PaginationType } from '@/lib/api/products';
import PaginationComponent from '@/components/ui/Pagination';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const sortOptions = [
  { value: 'newest', label: 'Terbaru' },
  { value: 'price-asc', label: 'Harga Terendah' },
  { value: 'price-desc', label: 'Harga Tertinggi' },
  { value: 'name', label: 'Nama A-Z' },
];

export default function StoreProductsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [pagination, setPagination] = useState<PaginationType>({ page: 1, limit: 12, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters from URL
  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || '';
  const sort = searchParams.get('sort') || 'newest';
  const page = Number(searchParams.get('page')) || 1;

  // Search input (debounced)
  const [searchInput, setSearchInput] = useState(search);

  const updateParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    // Reset page when filters change (unless page itself is being set)
    if (!('page' in updates)) {
      params.delete('page');
    }
    router.push(`/store/products?${params.toString()}`);
  }, [searchParams, router]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        updateParams({ search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  // Load categories once
  useEffect(() => {
    fetchProductCategories()
      .then((data) => setCategories(data.categories))
      .catch(() => {});
  }, []);

  // Load products when filters change
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchProducts({
          page,
          limit: 12,
          sort,
          category,
          search,
        });
        setProducts(data.products);
        setPagination(data.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat produk');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [page, sort, category, search]);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-3">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Script Store</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">All Scripts</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">Browse dan cari script yang Anda butuhkan.</p>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <svg className="h-5 w-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari scripts..."
          className="w-full bg-transparent text-white outline-none placeholder:text-slate-500"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => { setSearchInput(''); updateParams({ search: '' }); }}
            className="text-slate-400 hover:text-white transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Category filter */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => updateParams({ category: '' })}
            className={`rounded-full px-4 py-2 text-xs font-medium transition ${
              !category
                ? 'bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/30'
                : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => updateParams({ category: cat.slug })}
              className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                category === cat.slug
                  ? 'bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/30'
                  : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => updateParams({ sort: e.target.value })}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none transition focus:border-violet-400/50"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Results count */}
      {!loading && !error && (
        <p className="text-sm text-slate-400">
          {pagination.total} produk ditemukan
          {search && <span> untuk &ldquo;{search}&rdquo;</span>}
        </p>
      )}

      {/* Product grid */}
      {loading ? (
        <LoadingSkeleton variant="card" rows={6} />
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-12 text-center shadow-[var(--shadow-soft)]">
          <p className="text-lg text-slate-300">
            {search ? `Tidak ada produk untuk "${search}"` : 'Belum ada produk di kategori ini.'}
          </p>
          {(search || category) && (
            <button
              type="button"
              onClick={() => { setSearchInput(''); router.push('/store/products'); }}
              className="mt-4 inline-flex rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-violet-500/10"
            >
              Reset Filter
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          <PaginationComponent
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={(p) => updateParams({ page: String(p) })}
          />
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
