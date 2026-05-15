'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { type CheckoutResult } from '@/lib/api/cart';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

export default function CheckoutSuccessPage() {
  const { user } = useAuth();
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('checkout_result');
    if (stored) {
      try {
        setResult(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  const copyToClipboard = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // fallback
    }
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Checkout</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Success</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">Silakan login untuk melihat detail.</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="space-y-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-400/30">
          <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">Pembelian Berhasil!</h1>
          <p className="text-slate-300">Lihat license Anda di halaman My Licenses.</p>
        </div>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/dashboard/licenses"
            className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02]"
          >
            Lihat Licenses
          </Link>
          <Link
            href="/store"
            className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-violet-500/10"
          >
            Kembali ke Store
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Success header */}
      <div className="text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-400/30">
          <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white">Pembelian Berhasil!</h1>
        <p className="text-slate-300">Total: {formatRupiah(result.totalCharged)} · Saldo baru: {formatRupiah(result.newBalance)}</p>
      </div>

      {/* License keys */}
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-lg font-semibold text-white">License Keys</h2>

        {result.licenses.map((license) => {
          const purchase = result.purchases.find((p) => p.productId === license.productId);
          return (
            <div
              key={license.id}
              className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400">{license.licenseType} License</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Max Games: {license.maxGames ?? 'Unlimited'}
                  </p>
                </div>
                {purchase && (
                  <p className="text-sm font-medium text-violet-300">{formatRupiah(purchase.amountRupiah)}</p>
                )}
              </div>

              {/* License key */}
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <code className="flex-1 font-mono text-sm text-white break-all">{license.licenseKey}</code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(license.licenseKey)}
                  className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-violet-500/10 hover:border-violet-300/30"
                >
                  {copiedKey === license.licenseKey ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Next steps */}
      <div className="max-w-2xl mx-auto">
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-6 sm:p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-4">
          <h3 className="text-base font-semibold text-white">Langkah Selanjutnya</h3>
          <ol className="space-y-3 text-sm text-slate-300">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">1</span>
              <span>Download script file dari halaman My Licenses</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">2</span>
              <span>Paste license key di script config (LICENSE_KEY = &quot;RBXR-...&quot;)</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">3</span>
              <span>Tambahkan Game ID di dashboard (My Licenses → Whitelist)</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">4</span>
              <span>Publish game — license akan auto-verify</span>
            </li>
          </ol>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-4">
        <Link
          href="/dashboard/licenses"
          className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
        >
          Lihat Semua Licenses
        </Link>
        <Link
          href="/store"
          className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
        >
          Kembali ke Store
        </Link>
      </div>
    </div>
  );
}
