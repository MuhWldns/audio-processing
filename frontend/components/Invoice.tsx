'use client';

import { useRef } from 'react';

type InvoiceData = {
  invoiceId: string;
  date: string;
  buyer: {
    name: string;
    email: string;
    accountId: string;
  };
  items: Array<{
    productName: string;
    licenseType: string;
    licenseKey: string;
    maxGames: number | null;
    amount: number;
  }>;
  totalCharged: number;
  paymentMethod: string;
};

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(value));

export default function Invoice({ data, onClose }: { data: InvoiceData; onClose: () => void }) {
  const invoiceRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl">
        {/* Action buttons (not printed) */}
        <div className="flex justify-end gap-3 mb-4 print:hidden">
          <button
            onClick={handlePrint}
            className="rounded-full bg-violet-500 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-600 transition"
          >
            Print / Save PDF
          </button>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 transition"
          >
            Close
          </button>
        </div>

        {/* Invoice content */}
        <div ref={invoiceRef} className="bg-white text-gray-900 rounded-2xl p-8 sm:p-10 shadow-2xl print:shadow-none print:rounded-none">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-gray-200 pb-6 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">INVOICE</h1>
              <p className="text-sm text-gray-500 mt-1">RBX Royale Community</p>
              <p className="text-xs text-gray-400 mt-0.5">Scripts & Audio Tools</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700">{data.invoiceId}</p>
              <p className="text-xs text-gray-500 mt-1">{formatDate(data.date)}</p>
              <span className="inline-block mt-2 rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-700">PAID</span>
            </div>
          </div>

          {/* Buyer info */}
          <div className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Bill To</h2>
            <p className="text-sm font-medium text-gray-900">{data.buyer.name}</p>
            <p className="text-sm text-gray-600">{data.buyer.email}</p>
            <p className="text-xs text-gray-400 mt-0.5">Account: {data.buyer.accountId.slice(0, 12)}...</p>
          </div>

          {/* Items table */}
          <div className="mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-400">
                  <th className="pb-2">Item</th>
                  <th className="pb-2">License</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-3">
                      <p className="font-medium text-gray-900">{item.productName}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{item.licenseKey}</p>
                    </td>
                    <td className="py-3">
                      <p className="text-gray-700">{item.licenseType}</p>
                      <p className="text-xs text-gray-400">Max {item.maxGames ?? '∞'} games</p>
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900">{formatRupiah(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="flex justify-end border-t border-gray-200 pt-4 mb-6">
            <div className="text-right">
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-2xl font-bold text-gray-900">{formatRupiah(data.totalCharged)}</p>
              <p className="text-xs text-gray-400 mt-1">Paid via {data.paymentMethod}</p>
            </div>
          </div>

          {/* License details */}
          <div className="bg-gray-50 rounded-xl p-5 mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">License Details</h3>
            {data.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                  <p className="text-xs text-gray-500">{item.licenseType} · Valid: Lifetime</p>
                </div>
                <code className="text-xs font-mono text-violet-700 bg-violet-50 px-2 py-1 rounded">{item.licenseKey}</code>
              </div>
            ))}
          </div>

          {/* Installation instructions */}
          <div className="bg-blue-50 rounded-xl p-5 mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-2">Installation</h3>
            <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
              <li>Download .rbxm from your dashboard</li>
              <li>Import to Roblox Studio</li>
              <li>Find &quot;PASTE_YOUR_KEY_HERE&quot; and replace with your license key</li>
              <li>Enable HttpService in Game Settings</li>
              <li>Whitelist your game ID at dashboard</li>
            </ol>
          </div>

          {/* Footer */}
          <div className="text-center border-t border-gray-200 pt-6">
            <p className="text-xs text-gray-400">Thank you for your purchase!</p>
            <p className="text-xs text-gray-400 mt-1">RBX Royale — Scripts & Audio Tools</p>
            <p className="text-xs text-gray-300 mt-2">support@muhwldns.me · audio.muhwldns.me</p>
          </div>
        </div>
      </div>
    </div>
  );
}
