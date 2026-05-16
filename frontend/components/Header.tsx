'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

const fallbackAvatar = "https://ui-avatars.com/api/?name=RBX+Royale&background=8f5bff&color=fff";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/audio/studio", label: "Editor" },
  { href: "/audio/history", label: "History" },
  { href: "/store", label: "Store" },
  { href: "/topup", label: "Top Up" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/admin", label: "Admin", adminOnly: true },
];

export default function Header() {
  const { user, logout, isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <>
      <header className="border-b border-white/[0.08] bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-6">
            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden"
            >
              <svg className="h-6 w-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            <Link href="/" className="flex items-center gap-3">
              <Image
                className="h-11 w-11 rounded-2xl border border-white/10 bg-white/5 object-contain p-1.5 shadow-[0_0_18px_rgba(184,110,255,0.32)]"
                src="/hero.png"
                alt="RBX Royale logo"
                width={44}
                height={44}
              />
              <div className="leading-tight">
                <p className="text-[11px] uppercase tracking-[0.35em] text-violet-200/80">RBX Royale</p>
                <p className="text-sm text-slate-300">Scripts & Audio Tools</p>
              </div>
            </Link>
          </div>

          {/* Desktop navigation */}
          <nav className="hidden items-center gap-2 md:flex">
            {navLinks
              .filter((link) => !('adminOnly' in link && link.adminOnly) || user?.role === 'ADMIN')
              .map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  isActive(link.href)
                    ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/30"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {!isLoading && user ? (
              <>
                <div className="hidden items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 md:flex">
                  <Image
                    className="h-8 w-8 rounded-full object-cover"
                    src={user.avatarUrl || fallbackAvatar}
                    alt={user.displayName || user.email || "User"}
                    width={32}
                    height={32}
                    onError={(event) => {
                      if (event.currentTarget.src !== fallbackAvatar) {
                        event.currentTarget.src = fallbackAvatar;
                      }
                    }}
                  />
                  <div className="leading-tight">
                    <p className="text-sm font-medium text-white">{user.displayName || user.fullName || user.email || "Logged in user"}</p>
                    <p className="text-xs text-slate-400">Rp {user.walletBalance.toLocaleString("id-ID")}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
                >
                  Logout
                </button>
              </>
            ) : !isLoading ? (
              <Link
                href="/login"
                className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.25)] transition hover:scale-[1.02]"
              >
                Login
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {/* Mobile navigation menu */}
      {mobileMenuOpen && (
        <div className="border-b border-white/[0.08] bg-black/40 backdrop-blur-xl md:hidden">
          <div className="mx-auto max-w-7xl px-6 py-4">
            <nav className="space-y-2">
              {navLinks
                .filter((link) => !('adminOnly' in link && link.adminOnly) || user?.role === 'ADMIN')
                .map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block rounded-lg px-4 py-3 text-base font-medium transition ${
                    isActive(link.href)
                      ? "bg-violet-500/25 text-violet-100"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              {user && (
                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Image
                      className="h-10 w-10 rounded-full object-cover"
                      src={user.avatarUrl || fallbackAvatar}
                      alt={user.displayName || user.email || "User"}
                      width={40}
                      height={40}
                      onError={(event) => {
                        if (event.currentTarget.src !== fallbackAvatar) {
                          event.currentTarget.src = fallbackAvatar;
                        }
                      }}
                    />
                    <div className="flex-1">
                      <p className="font-medium text-white">{user.displayName || user.fullName || user.email || "User"}</p>
                      <p className="text-sm text-slate-400">Rp {user.walletBalance.toLocaleString("id-ID")}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void logout();
                      setMobileMenuOpen(false);
                    }}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left font-medium text-slate-300 transition hover:bg-white/10"
                  >
                    Logout
                  </button>
                </div>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
