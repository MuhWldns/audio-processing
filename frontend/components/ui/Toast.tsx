'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type Toast = {
  id: string;
  type: ToastType;
  message: string;
};

type ToastContextValue = {
  toasts: Toast[];
  toast: (message: string, type?: ToastType) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, message }]);

    // Auto-dismiss after 4 seconds
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

// ─── Toast Container ─────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const styles: Record<ToastType, string> = {
    success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    error: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
    warning: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
    info: 'border-violet-400/30 bg-violet-500/10 text-violet-200',
  };

  const icons: Record<ToastType, string> = {
    success: '\u2713',
    error: '\u2717',
    warning: '\u26A0',
    info: '\u2139',
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-xl animate-[slideIn_0.2s_ease-out] ${styles[t.type]}`}
    >
      <span className="mt-0.5 text-sm font-bold">{icons[t.type]}</span>
      <p className="flex-1 text-sm leading-relaxed">{t.message}</p>
      <button
        onClick={() => onDismiss(t.id)}
        className="mt-0.5 text-xs opacity-60 hover:opacity-100 transition"
      >
        \u2715
      </button>
    </div>
  );
}
