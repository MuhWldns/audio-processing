export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  shortDesc: string | null;
  thumbnail: string | null;
  pricePersonal: number;
  priceCommercial: number;
  priceEnterprise: number;
  featured: boolean;
  version: string;
  tags: string[];
  category: { id: string; name: string; slug: string } | null;
  image: string | null;
  soldCount: number;
  createdAt: string;
};

export type ProductDetail = {
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
  version: string;
  tags: string[];
  category: { id: string; name: string; slug: string } | null;
  images: Array<{ id: string; url: string; sortOrder: number }>;
  docs: Array<{ id: string; fileName: string; fileType: string; version: string }>;
  soldCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  productCount: number;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function fetchProducts(params: {
  page?: number;
  limit?: number;
  sort?: string;
  category?: string;
  search?: string;
  featured?: boolean;
} = {}): Promise<{ products: ProductSummary[]; pagination: Pagination }> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.sort) query.set('sort', params.sort);
  if (params.category) query.set('category', params.category);
  if (params.search) query.set('search', params.search);
  if (params.featured) query.set('featured', 'true');

  const res = await fetch(`${apiBaseUrl}/products?${query.toString()}`);

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to fetch products');
  }

  return res.json();
}

export async function fetchProductBySlug(slug: string): Promise<ProductDetail> {
  const res = await fetch(`${apiBaseUrl}/products/${encodeURIComponent(slug)}`);

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Product not found');
  }

  return res.json();
}

export async function fetchProductCategories(): Promise<{ categories: ProductCategory[] }> {
  const res = await fetch(`${apiBaseUrl}/products/categories`);

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to fetch categories');
  }

  return res.json();
}
