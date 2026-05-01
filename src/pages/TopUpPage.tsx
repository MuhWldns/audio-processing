import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { createTopUp } from "../api/topup";

const formatRupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

export function TopUpPage() {
  const { user } = useAuth();
  const [amount, setAmount] = useState("10000");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ amount: number; tokensBought: number } | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPaymentUrl(null);

    const numericAmount = Number(amount);
    if (!Number.isInteger(numericAmount)) {
      setError("Nominal harus angka bulat.");
      return;
    }

    if (numericAmount < 1000) {
      setError("Minimal top up Rp 1.000.");
      return;
    }

    if (numericAmount > 500000) {
      setError("Maksimal QRIS Rp 500.000.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createTopUp({ amount: numericAmount });
      setPaymentUrl(result.paymentUrl || null);
      setSummary({ amount: result.amount, tokensBought: result.tokensBought });

      if (result.paymentUrl) {
        window.location.href = result.paymentUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat pembayaran.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="eyebrow">Top Up</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Top up saldo token</h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">Silakan login terlebih dahulu untuk melakukan top up.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="eyebrow">Top Up</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Isi saldo dengan QRIS</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">
          Nominal Rupiah sama dengan jumlah token yang akan masuk ke wallet Anda.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={handleSubmit} className="panel space-y-6">
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
                onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
                className="w-full bg-transparent text-lg text-white outline-none"
                placeholder="10000"
              />
            </div>
            <p className="text-xs text-slate-400">Minimum Rp 1.000, maksimum Rp 500.000.</p>
          </div>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Membuat pembayaran..." : "Lanjut ke QRIS"}
          </button>
        </form>

        <div className="panel space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-white">Ringkasan</h2>
            <p className="text-sm text-slate-300">Setelah pembayaran sukses, token otomatis masuk.</p>
          </div>

          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>Saldo saat ini</span>
              <span>{user.wallet?.balanceTokens ?? 0} token</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>Nominal top up</span>
              <span>{summary ? formatRupiah(summary.amount) : "-"}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>Token masuk</span>
              <span>{summary ? `${summary.tokensBought} token` : "-"}</span>
            </div>
          </div>

          {paymentUrl ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <p className="font-semibold text-white">Link pembayaran dibuat</p>
              <p className="mt-1 break-all">{paymentUrl}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
