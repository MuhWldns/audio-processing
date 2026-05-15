'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createTopUp, getTopUpStatus } from '@/lib/api/topup';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

type Step = 'input' | 'processing' | 'qris' | 'polling' | 'success' | 'failed' | 'timeout';

const quickAmounts = [10000, 25000, 50000, 100000, 250000, 500000];

export default function TopUpPage() {
  const { user, refreshUser } = useAuth();

  // Step state
  const [step, setStep] = useState<Step>('input');
  const [amount, setAmount] = useState('10000');
  const [error, setError] = useState<string | null>(null);

  // Order state
  const [orderId, setOrderId] = useState<string | null>(null);
  const [qrisImageUrl, setQrisImageUrl] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [orderAmount, setOrderAmount] = useState<number>(0);

  // Polling
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingStartRef = useRef<number>(0);
  const POLLING_INTERVAL = 3000;
  const POLLING_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  // Countdown
  const [countdown, setCountdown] = useState<string>('');
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt || (step !== 'qris' && step !== 'polling')) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const expires = new Date(expiresAt).getTime();
      const diff = expires - now;

      if (diff <= 0) {
        setCountdown('Expired');
        if (countdownRef.current) clearInterval(countdownRef.current);
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    countdownRef.current = setInterval(updateCountdown, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [expiresAt, step]);

  const startPolling = useCallback((reference: string) => {
    setStep('polling');
    pollingStartRef.current = Date.now();

    pollingRef.current = setInterval(async () => {
      try {
        const status = await getTopUpStatus(reference);

        if (status.paid || status.status === 'COMPLETED') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setStep('success');
          await refreshUser();
          return;
        }

        if (status.status === 'FAILED' || status.status === 'CANCELED') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setStep('failed');
          setError('Pembayaran gagal atau dibatalkan.');
          return;
        }

        // Check timeout
        if (Date.now() - pollingStartRef.current > POLLING_TIMEOUT) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setStep('timeout');
          return;
        }
      } catch {
        // Ignore polling errors, keep trying
      }
    }, POLLING_INTERVAL);
  }, [refreshUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numericAmount = Number(amount);
    if (!Number.isInteger(numericAmount)) {
      setError('Nominal harus angka bulat.');
      return;
    }
    if (numericAmount < 1000) {
      setError('Minimal top up Rp 1.000.');
      return;
    }
    if (numericAmount > 500000) {
      setError('Maksimal QRIS Rp 500.000.');
      return;
    }

    setStep('processing');

    try {
      const result = await createTopUp({
        amount: numericAmount,
        customer_name: user?.displayName || user?.fullName || undefined,
        customer_email: user?.email || undefined,
      });

      setOrderId(result.orderId);
      setQrisImageUrl(result.qrisImageUrl || null);
      setPaymentUrl(result.paymentUrl || null);
      setExpiresAt(result.expiresAt || null);
      setOrderAmount(result.amount);

      if (result.qrisImageUrl) {
        setStep('qris');
        // Start polling immediately
        startPolling(result.orderId);
      } else if (result.paymentUrl) {
        // Fallback: redirect to payment URL
        window.location.href = result.paymentUrl;
      }
    } catch (err) {
      setStep('input');
      setError(err instanceof Error ? err.message : 'Gagal membuat pembayaran.');
    }
  };

  const handleReset = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setStep('input');
    setError(null);
    setOrderId(null);
    setQrisImageUrl(null);
    setPaymentUrl(null);
    setExpiresAt(null);
    setOrderAmount(0);
    setCountdown('');
  };

  // Check URL params for returning from payment
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const orderParam = params.get('order');
    if (orderParam && step === 'input') {
      setOrderId(orderParam);
      startPolling(orderParam);
    }
  }, [step, startPolling]);

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Top Up</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Top up saldo</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">Silakan login terlebih dahulu untuk melakukan top up.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-3">
        <p className="uppercase tracking-[2.4px] text-xs font-semibold text-[var(--accent)]">Top Up</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Isi saldo dengan QRIS</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">
          Scan QR code untuk mengisi saldo. Nominal Rupiah langsung masuk ke wallet Anda.
        </p>
      </div>

      {/* Current balance */}
      <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-3">
        <span className="text-sm text-slate-400">Saldo saat ini:</span>
        <span className="text-lg font-bold text-white">{formatRupiah(user.walletBalance)}</span>
      </div>

      {/* Step: Input */}
      {step === 'input' && (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <form onSubmit={handleSubmit} className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-6">
            {/* Amount input */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-200" htmlFor="amount">
                Nominal top up
              </label>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-sm text-slate-400">Rp</span>
                <input
                  id="amount"
                  name="amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full bg-transparent text-lg text-white outline-none"
                  placeholder="10000"
                />
              </div>
              <p className="text-xs text-slate-400">Minimum Rp 1.000, maksimum Rp 500.000.</p>
            </div>

            {/* Quick amount buttons */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-200">Pilih nominal</p>
              <div className="grid grid-cols-3 gap-2">
                {quickAmounts.map((qa) => (
                  <button
                    key={qa}
                    type="button"
                    onClick={() => setAmount(String(qa))}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                      Number(amount) === qa
                        ? 'border-violet-400/50 bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/30'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:border-violet-300/20'
                    }`}
                  >
                    {formatRupiah(qa)}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-rose-300">{error}</p>}

            <button
              type="submit"
              className="w-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
            >
              Lanjut ke QRIS
            </button>
          </form>

          {/* Info panel */}
          <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-6">
            <h2 className="text-xl font-semibold text-white">Cara Top Up</h2>
            <ol className="space-y-3 text-sm text-slate-300">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">1</span>
                <span>Masukkan nominal atau pilih dari tombol di atas</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">2</span>
                <span>Klik "Lanjut ke QRIS" untuk generate QR code</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">3</span>
                <span>Scan QR code dengan aplikasi e-wallet atau mobile banking</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">4</span>
                <span>Saldo otomatis bertambah setelah pembayaran berhasil</span>
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Step: Processing */}
      {step === 'processing' && (
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-12 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] text-center space-y-4">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-violet-500/30 border-t-violet-400" />
          <p className="text-lg font-semibold text-white">Membuat pembayaran...</p>
          <p className="text-sm text-slate-400">Mohon tunggu sebentar.</p>
        </div>
      )}

      {/* Step: QRIS / Polling */}
      {(step === 'qris' || step === 'polling') && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* QR Code */}
          <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-6">
            <div className="text-center space-y-4">
              <h2 className="text-xl font-semibold text-white">Scan QR Code</h2>
              <p className="text-sm text-slate-300">Gunakan e-wallet atau mobile banking untuk scan</p>

              {qrisImageUrl && (
                <div className="inline-block rounded-2xl bg-white p-4">
                  <img
                    src={qrisImageUrl}
                    alt="QRIS Payment QR Code"
                    width={250}
                    height={250}
                    className="rounded-lg"
                  />
                </div>
              )}

              {paymentUrl && (
                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-xs text-violet-300 underline hover:text-violet-200"
                >
                  Atau buka halaman pembayaran
                </a>
              )}
            </div>
          </div>

          {/* Status panel */}
          <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-8 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] space-y-6">
            <h2 className="text-xl font-semibold text-white">Detail Pembayaran</h2>

            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Nominal</span>
                <span className="font-semibold text-white">{formatRupiah(orderAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Status</span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                  <span className="font-medium text-amber-300">Menunggu pembayaran</span>
                </span>
              </div>
              {countdown && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Berlaku</span>
                  <span className="font-mono font-medium text-white">{countdown}</span>
                </div>
              )}
            </div>

            {/* Polling indicator */}
            <div className="flex items-center gap-3 rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-400" />
              <p className="text-sm text-violet-200">Mengecek status pembayaran otomatis...</p>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="w-full rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
            >
              Batalkan & Kembali
            </button>
          </div>
        </div>
      )}

      {/* Step: Success */}
      {step === 'success' && (
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-12 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-400/30">
            <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Top Up Berhasil!</h2>
            <p className="text-slate-300">Saldo Anda telah bertambah {formatRupiah(orderAmount)}</p>
          </div>
          <div className="inline-flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-6 py-4">
            <span className="text-sm text-slate-400">Saldo baru:</span>
            <span className="text-2xl font-bold text-emerald-300">{formatRupiah(user.walletBalance)}</span>
          </div>
          <div className="pt-4">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
            >
              Top Up Lagi
            </button>
          </div>
        </div>
      )}

      {/* Step: Failed */}
      {step === 'failed' && (
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-12 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 ring-1 ring-rose-400/30">
            <svg className="h-8 w-8 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Pembayaran Gagal</h2>
            <p className="text-slate-300">{error || 'Pembayaran tidak berhasil diproses.'}</p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Step: Timeout */}
      {step === 'timeout' && (
        <div className="bg-[var(--panel)] rounded-3xl border border-[rgba(193,121,255,0.22)] p-12 shadow-[var(--shadow-soft),0_0_0_1px_rgba(142,92,255,0.08)_inset] text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/30">
            <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Belum Terbayar</h2>
            <p className="text-slate-300">Pembayaran belum terdeteksi dalam 5 menit. Jika Anda sudah membayar, saldo akan otomatis masuk dalam beberapa saat.</p>
          </div>
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => {
                if (orderId) startPolling(orderId);
              }}
              className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-300/30 hover:bg-violet-500/10"
            >
              Cek Lagi
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition hover:scale-[1.02]"
            >
              Buat Baru
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
