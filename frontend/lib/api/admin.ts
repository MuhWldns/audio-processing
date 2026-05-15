const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDesc: string | null;
  thumbnail: string | null;
  pricePersonal: number;
  priceCommercial: number;
  priceEnterprise: number;
  featured: boolean;
  active: boolean;
  version: string;
  tags: string[];
  category: { id: string; name: string; slug: string } | null;
  _count: { licenses: number; purchases: number };
  createdAt: string;
  updatedAt: string;
};

export type AdminLicense = {
  id: string;
  licenseKey: string;
  licenseType: 'PERSONAL' | 'COMMERCIAL' | 'ENTERPRISE';
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  maxGames: number | null;
  user: { id: string; email: string; displayName: string };
  product: { id: string; name: string };
  _count: { gameWhitelist: number; verifications: number };
  createdAt: string;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder?: number;
  productCount?: number;
};

export type ProductFile = {
  id: string;
  fileName: string;
  fileType: 'script' | 'documentation' | 'asset';
  filePath: string;
  fileSize: number | null;
  version: string | null;
  createdAt: string;
};

export type AdminAnalytics = {
  overview: {
    totalProducts: number;
    totalActiveLicenses: number;
    totalPurchases: number;
    totalRevenue: number;
  };
  recentPurchases: Array<{
    id: string;
    user: { id: string; email: string; displayName: string };
    product: { id: string; name: string };
    amountRupiah: number;
    licenseType: string;
    purchasedAt: string;
  }>;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

// ─── Analytics ───────────────────────────────────────────────────────────────

export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  const res = await fetch(`${apiBaseUrl}/admin/analytics`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to fetch analytics');
  }

  return res.json();
}

// ─── Products ────────────────────────────────────────────────────────────────

export async function fetchAdminProducts(
  page = 1,
  limit = 50
): Promise<{ products: AdminProduct[]; pagination: Pagination }> {
  const res = await fetch(`${apiBaseUrl}/admin/products?page=${page}&limit=${limit}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to fetch products');
  }

  return res.json();
}

export async function fetchProductDetail(idOrSlug: string) {
  const res = await fetch(`${apiBaseUrl}/products/${encodeURIComponent(idOrSlug)}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Product not found');
  }

  return res.json();
}

export type CreateProductPayload = {
  name: string;
  slug: string;
  description: string;
  shortDesc?: string;
  thumbnail?: string;
  categoryId?: string;
  pricePersonal?: number;
  priceCommercial?: number;
  priceEnterprise?: number;
  featured?: boolean;
  version?: string;
  tags?: string;
};

export async function createProduct(payload: CreateProductPayload) {
  const res = await fetch(`${apiBaseUrl}/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to create product');
  }

  return res.json();
}

export async function updateProduct(id: string, payload: Partial<CreateProductPayload> & { active?: boolean }) {
  const res = await fetch(`${apiBaseUrl}/admin/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to update product');
  }

  return res.json();
}

export async function deactivateProduct(id: string) {
  const res = await fetch(`${apiBaseUrl}/admin/products/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to deactivate product');
  }

  return res.json();
}

// ─── Product Files ───────────────────────────────────────────────────────────

export type AddFilePayload = {
  fileName: string;
  fileType: 'script' | 'documentation' | 'asset';
  filePath: string;
  fileSize?: number;
  version?: string;
};

export async function addProductFile(productId: string, payload: AddFilePayload) {
  const res = await fetch(`${apiBaseUrl}/admin/products/${productId}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to add file');
  }

  return res.json();
}

export async function removeProductFile(productId: string, fileId: string) {
  const res = await fetch(`${apiBaseUrl}/admin/products/${productId}/files/${fileId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to remove file');
  }

  return res.json();
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<{ categories: Category[] }> {
  const res = await fetch(`${apiBaseUrl}/products/categories`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to fetch categories');
  }

  return res.json();
}

export type CategoryPayload = {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
};

export async function createCategory(payload: CategoryPayload) {
  const res = await fetch(`${apiBaseUrl}/admin/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to create category');
  }

  return res.json();
}

export async function updateCategory(id: string, payload: Partial<CategoryPayload> & { active?: boolean }) {
  const res = await fetch(`${apiBaseUrl}/admin/categories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to update category');
  }

  return res.json();
}

export async function deactivateCategory(id: string) {
  const res = await fetch(`${apiBaseUrl}/admin/categories/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to deactivate category');
  }

  return res.json();
}

// ─── Licenses ────────────────────────────────────────────────────────────────

export async function fetchAdminLicenses(params: {
  page?: number;
  limit?: number;
  status?: string;
  userId?: string;
  productId?: string;
} = {}): Promise<{ licenses: AdminLicense[]; pagination: Pagination }> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.status) query.set('status', params.status);
  if (params.userId) query.set('userId', params.userId);
  if (params.productId) query.set('productId', params.productId);

  const res = await fetch(`${apiBaseUrl}/admin/licenses?${query.toString()}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to fetch licenses');
  }

  return res.json();
}

export async function updateLicenseStatus(id: string, status: string, reason?: string) {
  const res = await fetch(`${apiBaseUrl}/admin/licenses/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status, reason }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to update license status');
  }

  return res.json();
}
