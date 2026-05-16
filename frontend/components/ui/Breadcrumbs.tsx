'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Crumb = {
  label: string;
  href: string;
};

const routeLabels: Record<string, string> = {
  store: 'Store',
  products: 'Products',
  cart: 'Cart',
  checkout: 'Checkout',
  success: 'Success',
  admin: 'Admin',
  categories: 'Categories',
  licenses: 'Licenses',
  new: 'New',
  edit: 'Edit',
  dashboard: 'Dashboard',
  audio: 'Audio',
  studio: 'Studio',
  history: 'History',
  topup: 'Top Up',
  profile: 'Profile',
};

export default function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  const crumbs: Crumb[] = [{ label: 'Home', href: '/' }];

  segments.forEach((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    // Skip dynamic segments like [id] or [slug] — show as "..."
    const isDynamic = segment.length > 20 || segment.startsWith('cl');
    const label = isDynamic ? '...' : (routeLabels[segment] || segment);
    crumbs.push({ label, href });
  });

  return (
    <nav className="mb-6 flex items-center gap-2 text-sm text-slate-400">
      {crumbs.map((crumb, index) => (
        <span key={crumb.href} className="flex items-center gap-2">
          {index > 0 && <span className="text-slate-600">/</span>}
          {index === crumbs.length - 1 ? (
            <span className="text-slate-200">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="transition hover:text-violet-300">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
