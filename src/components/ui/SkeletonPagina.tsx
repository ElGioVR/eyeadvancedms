import Skeleton, { SkeletonTabla, SkeletonTarjetas } from '@/components/ui/Skeleton';

type Variante = 'tabla' | 'detalle' | 'formulario' | 'calendario' | 'tarjetas';

/**
 * Esqueletos genéricos para `loading.tsx`: dan retroalimentación inmediata
 * al navegar mientras llega el JS/los datos de la pantalla.
 */
export default function SkeletonPagina({ variante = 'tabla' }: { variante?: Variante }) {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>

      {variante === 'tabla' && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>
          <SkeletonTabla />
        </>
      )}

      {variante === 'tarjetas' && <SkeletonTarjetas cantidad={6} />}

      {variante === 'calendario' && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-4 flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-20 rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {variante === 'detalle' && (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3 rounded-2xl border border-line bg-surface p-5">
                <Skeleton className="h-4 w-40" />
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="space-y-1">
                      <Skeleton className="h-2.5 w-16" />
                      <Skeleton className="h-3.5 w-28" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="w-full space-y-3 rounded-2xl border border-line bg-surface p-5 lg:w-[340px]">
            <Skeleton className="h-4 w-32" />
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-3 w-full" />
            ))}
          </div>
        </div>
      )}

      {variante === 'formulario' && (
        <div className="space-y-5 rounded-2xl border border-line bg-surface p-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
