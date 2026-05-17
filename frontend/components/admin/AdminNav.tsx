'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const adminLinks = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/categories', label: 'Categories' },
  { href: '/admin/licenses', label: 'Licenses' },
  { href: '/admin/enforcement', label: 'Enforcement' },
];

export default function AdminNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {adminLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            isActive(link.href)
              ? 'bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/30'
              : 'border border-white/10 bg-white/5 text-slate-300 hover:border-violet-300/30 hover:bg-violet-500/10 hover:text-white'
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
