'use client';

import Link from 'next/link';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-lg font-extrabold text-fg">Algo salió mal</h2>
        <p className="text-sm text-muted max-w-md">
          Ocurrió un error inesperado al mostrar esta sección. Tus datos no se vieron afectados.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={reset}
            className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700 transition-colors"
          >
            Reintentar
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
