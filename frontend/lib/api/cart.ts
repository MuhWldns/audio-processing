export type CartItem = {
  id: string;
  productId: string;
  product: {
    id: string;
    name: string;
    slug: string;
    thumbnail: string | null;
    pricePersonal: number;
    priceCommercial: number;
    priceEnterprise: number;
    active: boolean;
  };
  licenseType: 'PERSONAL' | 'COMMERCIAL' | 'ENTERPRISE';
  priceRupiah: number;
  addedAt: string;
};

export type CheckoutResult = {
  ok: boolean;
  purchases: Array<{
    id: string;
    publicId?: string | null;
    productId: string;
    licenseType: string;
    amountRupiah: number;
  }>;
  licenses: Array<{
    id: string;
    publicId?: string | null;
    productId: string;
    licenseKey: string;
    licenseType: string;
    maxGames: number | null;
  }>;
  totalCharged: number;
  newBalance: number;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function fetchCart(): Promise<{ items: CartItem[]; total: number }> {
  const res = await fetch(`${apiBaseUrl}/cart`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to fetch cart');
  }

  return res.json();
}

export async function addToCart(productId: string, licenseType: string = 'PERSONAL') {
  const res = await fetch(`${apiBaseUrl}/cart/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ productId, licenseType }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to add to cart');
  }

  return res.json();
}

export async function removeFromCart(itemId: string) {
  const res = await fetch(`${apiBaseUrl}/cart/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to remove from cart');
  }

  return res.json();
}

export async function clearCart() {
  const res = await fetch(`${apiBaseUrl}/cart`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Failed to clear cart');
  }

  return res.json();
}

export async function checkout(): Promise<CheckoutResult> {
  const res = await fetch(`${apiBaseUrl}/checkout`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Checkout failed');
  }

  return res.json();
}
