import React, { useEffect, useState } from 'react';

/**
 * Messages courts affichés en bas de l'écran, à la place des alert() du
 * navigateur qui bloquaient l'application. Les confirmations d'actions
 * destructives restent demandées explicitement (window.confirm).
 */

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

type Listener = (toast: ToastItem) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function notify(message: string, kind?: ToastKind): void {
  const resolvedKind: ToastKind = kind ?? (/erreur|impossible|échec|refus|invalide/i.test(message) ? 'error' : 'success');
  const toast = { id: nextId++, message, kind: resolvedKind };
  listeners.forEach((l) => l(toast));
}

const KIND_CLASSES: Record<ToastKind, string> = {
  success: 'bg-emerald-700 text-white border-emerald-500',
  error: 'bg-rose-700 text-white border-rose-500',
  info: 'bg-slate-800 text-white border-slate-600'
};

export const Toaster: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener: Listener = (toast) => {
      setToasts((current) => [...current.slice(-3), toast]);
      const duration = toast.kind === 'error' ? 8000 : 4000;
      window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== toast.id)), duration);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <div className="fixed bottom-4 inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none no-print" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-md w-full rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl whitespace-pre-line ${KIND_CLASSES[t.kind]}`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{t.message}</span>
            <button
              type="button"
              aria-label="Fermer le message"
              onClick={() => setToasts((current) => current.filter((x) => x.id !== t.id))}
              className="opacity-80 hover:opacity-100 font-black"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
