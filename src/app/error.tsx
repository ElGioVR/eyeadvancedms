'use client';

import Link from 'next/link';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA]">Algo salió mal</h2>
        <p className="text-sm text-gray-500 dark:text-[#71767B] max-w-md">
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
            className="rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
