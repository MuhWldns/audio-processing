'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { createProduct, fetchCategories, type Category, type CreateProductPayload } from '@/lib/api/admin';
import AdminNav from '@/components/admin/AdminNav';

export default function AdminProductNewPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [pricePersonal, setPricePersonal] = useState('0');
  const [priceCommercial, setPriceCommercial] = useState('0');
  const [priceEnterprise, setPriceEnterprise] = useState('0');
  const [featured, setFeatured] = useState(false);
  const [version, setVersion] = useState('1.0.0');
  const [tags, setTags] = useState('');
  const [thumbnail, setThumbnail] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    fetchCategories()
      .then((data) => setCategories(data.categories))
      .catch(() => {});
  }, [user]);

  // Auto-generate slug from name
  useEffect(() => {
    if (!slugManual) {
      setSlug(
        name
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()
      );
    }
  }, [name, slugManual]);

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

  const validate = (): string | null => {
    if (name.length < 3) return 'Nama produk minimal 3 karakter.';
    if (!slug) return 'Slug tidak boleh kosong.';
    if (description.length < 20) return 'Deskripsi minimal 20 karakter.';
    const pp = Number(pricePersonal);
    const pc = Number(priceCommercial);
    const pe = Number(priceEnterprise);
    if (isNaN(pp) || pp < 0) return 'Harga Personal harus >= 0.';
    if (isNaN(pc) || pc < 0) return 'Harga Commercial harus >= 0.';
    if (isNaN(pe) || pe < 0) return 'Harga Enterprise harus >= 0.';
    if (pc > 0 && pc < pp) return 'Harga Commercial harus >= Personal.';
    if (pe > 0 && pe < pc) return 'Harga Enterprise harus >= Commercial.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const payload: CreateProductPayload = {
        name,
        slug,
        description,
        shortDesc: shortDesc || undefined,
        thumbnail: thumbnail || undefined,
        categoryId: categoryId || undefined,
        pricePersonal: Number(pricePersonal),
        priceCommercial: Number(priceCommercial),
        priceEnterprise: Number(priceEnterprise),
        featured,
        version: version || '1.0.0',
        tags: tags || undefined,
      };

      await createProduct(payload);
      router.push('/admin/products');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat produk');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-4">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Admin Panel</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Tambah Produk</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">Buat produk baru untuk script store.</p>
      </div>

      <AdminNav />

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-6">
          {/* Name */}
          <FormField label="Nama Produk" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="UI System Pro"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
            />
          </FormField>

          {/* Slug */}
          <FormField label="Slug" required hint={`URL: /store/products/${slug || '...'}`}>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugManual(true);
                setSlug(e.target.value);
              }}
              placeholder="ui-system-pro"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
            />
          </FormField>

          {/* Description */}
          <FormField label="Deskripsi" required hint="Minimal 20 karakter">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Deskripsi lengkap produk..."
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30 resize-none"
            />
          </FormField>

          {/* Short Description */}
          <FormField label="Deskripsi Singkat">
            <input
              type="text"
              value={shortDesc}
              onChange={(e) => setShortDesc(e.target.value)}
              placeholder="Professional UI framework for Roblox games"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
            />
          </FormField>

          {/* Category */}
          <FormField label="Kategori">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
            >
              <option value="">— Pilih Kategori —</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </FormField>

          {/* Pricing */}
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Harga Personal">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-sm text-slate-400">Rp</span>
                <input
                  type="number"
                  value={pricePersonal}
                  onChange={(e) => setPricePersonal(e.target.value)}
                  min="0"
                  className="w-full bg-transparent text-white outline-none"
                />
              </div>
            </FormField>
            <FormField label="Harga Commercial">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-sm text-slate-400">Rp</span>
                <input
                  type="number"
                  value={priceCommercial}
                  onChange={(e) => setPriceCommercial(e.target.value)}
                  min="0"
                  className="w-full bg-transparent text-white outline-none"
                />
              </div>
            </FormField>
            <FormField label="Harga Enterprise">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-sm text-slate-400">Rp</span>
                <input
                  type="number"
                  value={priceEnterprise}
                  onChange={(e) => setPriceEnterprise(e.target.value)}
                  min="0"
                  className="w-full bg-transparent text-white outline-none"
                />
              </div>
            </FormField>
          </div>

          {/* Version & Tags */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Version">
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
              />
            </FormField>
            <FormField label="Tags" hint="Pisahkan dengan koma">
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="ui, framework, professional"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
              />
            </FormField>
          </div>

          {/* Thumbnail */}
          <FormField label="Thumbnail URL">
            <input
              type="text"
              value={thumbnail}
              onChange={(e) => setThumbnail(e.target.value)}
              placeholder="/images/product-thumbnail.png"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
            />
          </FormField>

          {/* Featured */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
              className="h-5 w-5 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-400/30"
            />
            <span className="text-sm font-medium text-slate-200">Featured product (tampil di homepage store)</span>
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-4">
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Menyimpan...' : 'Simpan Produk'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/admin/products')}
            className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
          >
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Form Field Helper ───────────────────────────────────────────────────────

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-slate-200">
        {label}
        {required && <span className="text-rose-400 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
