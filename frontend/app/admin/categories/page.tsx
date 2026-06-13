'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deactivateCategory,
  type Category,
  type CategoryPayload,
} from '@/lib/api/admin';
import AdminNav from '@/components/admin/AdminNav';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

export default function AdminCategoriesPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formSlugManual, setFormSlugManual] = useState(false);
  const [formDescription, setFormDescription] = useState('');
  const [formIcon, setFormIcon] = useState('');
  const [formSortOrder, setFormSortOrder] = useState('0');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deactivate dialog
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCategories();
      setCategories(data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat kategori');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    void loadCategories();
  }, [user]);

  // Auto-generate slug
  useEffect(() => {
    if (!formSlugManual && modalOpen) {
      setFormSlug(
        formName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()
      );
    }
  }, [formName, formSlugManual, modalOpen]);

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

  const openCreateModal = () => {
    setEditingId(null);
    setFormName('');
    setFormSlug('');
    setFormSlugManual(false);
    setFormDescription('');
    setFormIcon('');
    setFormSortOrder('0');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormSlug(cat.slug);
    setFormSlugManual(true);
    setFormDescription(cat.description || '');
    setFormIcon(cat.icon || '');
    setFormSortOrder(String(cat.sortOrder || 0));
    setFormError(null);
    setModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName || formName.length < 2) {
      setFormError('Nama minimal 2 karakter.');
      return;
    }
    if (!formSlug) {
      setFormError('Slug tidak boleh kosong.');
      return;
    }

    setFormSubmitting(true);

    try {
      const payload: CategoryPayload = {
        name: formName,
        slug: formSlug,
        description: formDescription || undefined,
        icon: formIcon || undefined,
        sortOrder: Number(formSortOrder) || 0,
      };

      if (editingId) {
        await updateCategory(editingId, payload);
      } else {
        await createCategory(payload);
      }

      setModalOpen(false);
      void loadCategories();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan kategori');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingId) return;
    setDeactivateLoading(true);
    try {
      await deactivateCategory(deactivatingId);
      setDeactivatingId(null);
      void loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menonaktifkan kategori');
    } finally {
      setDeactivateLoading(false);
    }
  };

  const deactivatingCategory = categories.find((c) => c.id === deactivatingId);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-4">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Admin Panel</p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Categories</h1>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
          >
            + Tambah Kategori
          </button>
        </div>
      </div>

      <AdminNav />

      {loading ? (
        <LoadingSkeleton variant="table" rows={4} />
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-12 text-center shadow-[var(--shadow-soft)]">
          <p className="text-lg text-slate-300">Belum ada kategori.</p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-4 inline-flex rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02]"
          >
            Buat Kategori Pertama
          </button>
        </div>
      ) : (
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-4 font-medium">Name</th>
                  <th className="px-4 py-4 font-medium">Slug</th>
                  <th className="px-4 py-4 font-medium">Icon</th>
                  <th className="px-4 py-4 font-medium">Products</th>
                  <th className="px-4 py-4 font-medium">Order</th>
                  <th className="px-4 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id} className="border-b border-white/[0.04] last:border-0 transition hover:bg-white/[0.02]">
                    <td className="px-6 py-4">
                      <p className="font-medium text-white">{cat.name}</p>
                      {cat.description && <p className="text-xs text-slate-400 mt-0.5">{cat.description}</p>}
                    </td>
                    <td className="px-4 py-4 text-slate-300 font-mono text-xs">{cat.slug}</td>
                    <td className="px-4 py-4 text-slate-300">{cat.icon || '-'}</td>
                    <td className="px-4 py-4 text-slate-300">{cat.productCount ?? 0}</td>
                    <td className="px-4 py-4 text-slate-300">{cat.sortOrder ?? 0}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(cat)}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-violet-500/10 hover:border-violet-300/30"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeactivatingId(cat.id)}
                          className="rounded-full border border-rose-400/20 bg-rose-400/5 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-400/10"
                        >
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Category Form Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-3xl border border-[rgba(193,121,255,0.22)] bg-[var(--panel)] p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset]">
            <h3 className="text-lg font-semibold text-white mb-6">
              {editingId ? 'Edit Kategori' : 'Tambah Kategori'}
            </h3>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-200">Nama <span className="text-rose-400">*</span></label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="UI Systems"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-200">Slug <span className="text-rose-400">*</span></label>
                <input
                  type="text"
                  value={formSlug}
                  onChange={(e) => {
                    setFormSlugManual(true);
                    setFormSlug(e.target.value);
                  }}
                  placeholder="ui-systems"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-200">Deskripsi</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Interface frameworks, menus, HUDs"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
                />
              </div>

              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-200">Icon</label>
                  <input
                    type="text"
                    value={formIcon}
                    onChange={(e) => setFormIcon(e.target.value)}
                    placeholder="layout"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-200">Sort Order</label>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-sm text-rose-300">{formError}</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={formSubmitting}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-50"
                >
                  {formSubmitting ? 'Menyimpan...' : editingId ? 'Update' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm deactivate dialog */}
      <ConfirmDialog
        open={!!deactivatingId}
        title="Nonaktifkan Kategori"
        description={`Yakin ingin menonaktifkan kategori "${deactivatingCategory?.name || ''}"?`}
        confirmLabel="Nonaktifkan"
        variant="danger"
        loading={deactivateLoading}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivatingId(null)}
      />
    </div>
  );
}
