'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastVariant = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

type ShowToast = (message: string, variant?: ToastVariant) => void;

const ToastContext = createContext<ShowToast | null>(null);

const DISMISS_AFTER_MS = 5000;

const VARIANT_STYLE: Record<ToastVariant, { icon: React.ElementType; color: string }> = {
  error:   { icon: AlertTriangle, color: 'var(--tm-danger)' },
  success: { icon: CheckCircle2,  color: 'var(--tm-success)' },
  info:    { icon: Info,          color: 'var(--tm-accent)' },
};

/**
 * App-wide, non-blocking notifications — replaces window.alert() for save
 * failures and similar feedback. Mounted in the root layout above the data
 * providers, so the data hooks can report errors through useToast().
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback<ShowToast>((message, variant = 'error') => {
    const id = nextId.current++;
    // Keep the stack short: the newest three are plenty.
    setToasts(prev => [...prev.slice(-2), { id, message, variant }]);
    setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
      >
        {toasts.map(({ id, message, variant }) => {
          const { icon: Icon, color } = VARIANT_STYLE[variant];
          return (
            <div
              key={id}
              role={variant === 'error' ? 'alert' : 'status'}
              className="card animate-slide-up pointer-events-auto w-full flex items-start gap-3 px-4 py-3 text-sm"
              style={{ boxShadow: 'var(--tm-shadow-md)' }}
            >
              <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
              <p className="flex-1 text-text-primary">{message}</p>
              <button
                type="button"
                onClick={() => dismiss(id)}
                aria-label="Dismiss notification"
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ShowToast {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
