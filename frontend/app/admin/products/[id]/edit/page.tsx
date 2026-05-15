'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  fetchProductDetail,
  updateProduct,
  fetchCategories,
  addProductFile,
  removeProductFile,
  type Category,
  type ProductFile,
  type AddFilePayload,
} from '@/lib/api/admin';
import AdminNav from '@/components/admin/AdminNav';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

export default function AdminProductEditPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [pricePersonal, setPricePersonal] = useState('0');
  const [priceCommercial, setPriceCommercial] = useState('0');
  const [priceEnterprise, setPriceEnterprise] = useState('0');
  const [featured, setFeatured] = useState(false);
  const [active, setActive] = useState(true);
  const [version, setVersion] = useState('1.0.0');
  const [tags, setTags] = useState('');
  const [thumbnail, setThumbnail] = useState('');

  // Files
  const [files, setFiles] = useState<ProductFile[]>([]);
  const [addingFile, setAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileType, setNewFileType] = useState<'script' | 'documentation' | 'asset'>('script');
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileSize, setNewFileSize] = useState('');
  const [newFileVersion, setNewFileVersion] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);

  // Remove file dialog
  const [removingFileId, setRemovingFileId] = useState<string | null>(null);
  const [removeFileLoading, setRemoveFileLoading] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;

    const load = async () => {
      try {
        const [productData, catData] = await Promise.all([
          fetchProductDetail(productId),
          fetchCategories(),
        ]);

        setCategories(catData.categories);

        // Populate form
        setName(productData.name || '');
        setSlug(productData.slug || '');
        setDescription(productData.description || '');
        setShortDesc(productData.shortDesc || '');
        setCategoryId(productData.category?.id || '');
        setPricePersonal(String(productData.pricePersonal || 0));
        setPriceCommercial(String(productData.priceCommercial || 0));
        setPriceEnterprise(String(productData.priceEnterprise || 0));
        setFeatured(productData.featured || false);
        setActive(productData.active !== false);
        setVersion(productData.version || '1.0.0');
        setTags(Array.isArray(productData.tags) ? productData.tags.join(', ') : productData.tags || '');
        setThumbnail(productData.thumbnail || '');
        setFiles(productData.docs || productData.files || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat produk');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [user, productId]);

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
    setSuccess(false);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      await updateProduct(productId, {
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
        active,
        version: version || '1.0.0',
        tags: tags || undefined,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengupdate produk');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddFile = async () => {
    setFileError(null);
    if (!newFileName || !newFilePath) {
      setFileError('fileName dan filePath wajib diisi.');
      return;
    }

    setAddingFile(true);
    try {
      const payload: AddFilePayload = {
        fileName: newFileName,
        fileType: newFileType,
        filePath: newFilePath,
        fileSize: newFileSize ? Number(newFileSize) : undefined,
        version: newFileVersion || undefined,
      };
      const result = await addProductFile(productId, payload);
      setFiles((prev) => [...prev, result.file]);
      setNewFileName('');
      setNewFilePath('');
      setNewFileSize('');
      setNewFileVersion('');
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Gagal menambah file');
    } finally {
      setAddingFile(false);
    }
  };

  const handleRemoveFile = async () => {
    if (!removingFileId) return;
    setRemoveFileLoading(true);
    try {
      await removeProductFile(productId, removingFileId);
      setFiles((prev) => prev.filter((f) => f.id !== removingFileId));
      setRemovingFileId(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Gagal menghapus file');
    } finally {
      setRemoveFileLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="space-y-4">
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Admin Panel</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Edit Produk</h1>
        </div>
        <AdminNav />
        <LoadingSkeleton variant="card" rows={2} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-4">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Admin Panel</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Edit Produk</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">Update informasi produk dan kelola file.</p>
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
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
            />
          </FormField>

          {/* Slug */}
          <FormField label="Slug" required hint={`URL: /store/products/${slug || '...'}`}>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
            />
          </FormField>

          {/* Description */}
          <FormField label="Deskripsi" required hint="Minimal 20 karakter">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30 resize-none"
            />
          </FormField>

          {/* Short Description */}
          <FormField label="Deskripsi Singkat">
            <input
              type="text"
              value={shortDesc}
              onChange={(e) => setShortDesc(e.target.value)}
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
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
              />
            </FormField>
            <FormField label="Tags" hint="Pisahkan dengan koma">
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
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
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
            />
          </FormField>

          {/* Featured & Active */}
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                className="h-5 w-5 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-400/30"
              />
              <span className="text-sm font-medium text-slate-200">Featured</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-5 w-5 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-400/30"
              />
              <span className="text-sm font-medium text-slate-200">Active (tampil di store)</span>
            </label>
          </div>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-4">
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        )}
        {success && (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
            <p className="text-sm text-emerald-300">Produk berhasil diupdate.</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Menyimpan...' : 'Update Produk'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/admin/products')}
            className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
          >
            Kembali
          </button>
        </div>
      </form>

      {/* File Management */}
      <div className="max-w-3xl space-y-6">
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-6">
          <h2 className="text-xl font-semibold text-white">File Management</h2>

          {/* Existing files */}
          {files.length > 0 ? (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-white">{file.fileName}</p>
                    <p className="text-xs text-slate-400">
                      {file.fileType} {file.version ? `· v${file.version}` : ''} {file.fileSize ? `· ${(file.fileSize / 1024).toFixed(1)} KB` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemovingFileId(file.id)}
                    className="rounded-full border border-rose-400/20 bg-rose-400/5 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-400/10"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Belum ada file.</p>
          )}

          {/* Add file form */}
          <div className="space-y-4 border-t border-white/[0.08] pt-6">
            <h3 className="text-sm font-semibold text-slate-200">Tambah File</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="File name (e.g. script.lua)"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-violet-400/50"
              />
              <select
                value={newFileType}
                onChange={(e) => setNewFileType(e.target.value as 'script' | 'documentation' | 'asset')}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-violet-400/50"
              >
                <option value="script">Script</option>
                <option value="documentation">Documentation</option>
                <option value="asset">Asset</option>
              </select>
              <input
                type="text"
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                placeholder="File path (e.g. /uploads/scripts/file.lua)"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-violet-400/50"
              />
              <input
                type="text"
                value={newFileVersion}
                onChange={(e) => setNewFileVersion(e.target.value)}
                placeholder="Version (optional)"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-violet-400/50"
              />
            </div>

            {fileError && <p className="text-xs text-rose-300">{fileError}</p>}

            <button
              type="button"
              onClick={handleAddFile}
              disabled={addingFile}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10 disabled:opacity-50"
            >
              {addingFile ? 'Menambahkan...' : '+ Tambah File'}
            </button>
          </div>
        </div>
      </div>

      {/* Confirm remove file dialog */}
      <ConfirmDialog
        open={!!removingFileId}
        title="Hapus File"
        description="Yakin ingin menghapus file ini dari produk?"
        confirmLabel="Hapus"
        variant="danger"
        loading={removeFileLoading}
        onConfirm={handleRemoveFile}
        onCancel={() => setRemovingFileId(null)}
      />
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
