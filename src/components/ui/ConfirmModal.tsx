'use client';

import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmText?: string;
  cancelLabel?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning';
  loading?: boolean;
}

export default function ConfirmModal({
  isOpen,
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  confirmText,
  cancelLabel,
  cancelText,
  variant = 'danger',
  loading = false,
}: ConfirmModalProps) {
  const visible = isOpen ?? open ?? false;
  if (!visible) return null;

  const confirmBtn = confirmLabel || confirmText || 'CONFIRMAR';
  const cancelBtn = cancelLabel || cancelText || 'CANCELAR';

  const confirmColor = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-amber-600 hover:bg-amber-700';

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm animate-fadeIn sm:items-center sm:px-4">
      <div className="w-full rounded-t-3xl border border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-pop animate-sheetUp sm:max-w-sm sm:rounded-3xl sm:pb-0 sm:animate-popIn">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-2xl',
              variant === 'danger' ? 'bg-red-50 dark:bg-red-500/10' : 'bg-amber-50 dark:bg-amber-500/10'
            )}>
              <AlertTriangle className={cn('h-5 w-5', variant === 'danger' ? 'text-red-600' : 'text-amber-600')} />
            </div>
            <h3 className="text-base font-semibold text-fg">{title}</h3>
          </div>
          <button onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 pb-5 pt-2">
          <p className="text-sm text-fg-2">{message}</p>
        </div>
        <div className="flex flex-col-reverse gap-2 px-6 pb-6 sm:flex-row">
          <button
            onClick={onClose}
            disabled={loading}
            className="btn-secondary flex-1"
          >
            {cancelBtn}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 inline-flex items-center justify-center gap-2',
              confirmColor
            )}
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</> : confirmBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
