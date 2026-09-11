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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-xl animate-[slideIn_0.2s_ease-out]">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full',
              variant === 'danger' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
            )}>
              <AlertTriangle className={cn('h-5 w-5', variant === 'danger' ? 'text-red-600' : 'text-amber-600')} />
            </div>
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]">{title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 dark:text-[#71767B] hover:text-gray-600 dark:hover:text-[#E7E9EA] transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600 dark:text-[#E7E9EA]">{message}</p>
        </div>
        <div className="flex gap-3 border-t border-gray-100 dark:border-[#2F3336] px-6 py-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors disabled:opacity-50"
          >
            {cancelBtn}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'flex-1 rounded-lg px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2',
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
