'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { reportarError } from '@/lib/monitoreo-cliente';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
  /** Nombre del módulo para el mensaje («la agenda», «las consultas»…). */
  seccion?: string;
  /** Etiqueta para el monitoreo (agenda, consultas…). */
  contexto?: string;
  /** Mostrar el enlace «Ir al inicio». */
  conInicio?: boolean;
}

/**
 * Pantalla de error de un módulo (usada por los `error.tsx`). Solo reemplaza
 * la sección que falló: la barra lateral y el resto de la app siguen vivos.
 * Reporta el error a Sentry (si está configurado) y muestra un código corto
 * para que el usuario lo pueda reportar a soporte.
 */
export default function ErrorSeccion({ error, reset, seccion = 'esta sección', contexto = 'seccion', conInicio = true }: Props) {
  useEffect(() => {
    reportarError(error, { boundary: contexto, digest: error.digest ?? '' });
  }, [error, contexto]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4" role="alert">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
          <AlertTriangle className="h-7 w-7" aria-hidden />
        </div>
        <h2 className="text-lg font-extrabold text-fg">No pudimos mostrar {seccion}</h2>
        <p className="text-sm text-muted">
          Ocurrió un error inesperado. Tus datos guardados no se vieron afectados. Intenta de nuevo; si se repite,
          avisa a soporte con el código de abajo.
        </p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700 transition-colors"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Reintentar
          </button>
          {conInicio && (
            <Link
              href="/dashboard"
              className="rounded-lg border border-line px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors"
            >
              Ir al inicio
            </Link>
          )}
        </div>
        {error.digest && <p className="text-xs text-muted">Código: {error.digest}</p>}
      </div>
    </div>
  );
}
