'use client';

import { History } from 'lucide-react';
import ClientDate from '@/components/ui/ClientDate';

/** Aviso «Tienes un borrador sin guardar» con Recuperar / Descartar. */
export default function AvisoBorrador({
  ts,
  que,
  onRecuperar,
  onDescartar,
}: {
  ts: number;
  que: string;
  onRecuperar: () => void;
  onDescartar: () => void;
}) {
  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-4 text-sm dark:border-primary-500/30 dark:bg-primary-500/10 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <History className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" aria-hidden />
        <p className="text-fg">
          Tienes {que} sin guardar de <ClientDate date={new Date(ts).toISOString()} dateTime options={{ dateStyle: 'medium', timeStyle: 'short' }} />. ¿Quieres recuperarla?
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onDescartar}
          className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-fg-2 hover:bg-surface-2"
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={onRecuperar}
          className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700"
        >
          Recuperar
        </button>
      </div>
    </div>
  );
}
