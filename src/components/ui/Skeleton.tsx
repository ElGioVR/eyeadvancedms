import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export default function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg bg-surface-3/70',
        className
      )}
    />
  );
}

/** Tabla de carga inicial (mismas proporciones que DataTable → sin salto de layout). */
export function SkeletonTabla({ filas = 8, columnas = 5 }: { filas?: number; columnas?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none" aria-busy="true" aria-label="Cargando">
      <div className="border-b border-line bg-surface-2/60 px-5 py-3">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: filas }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            {Array.from({ length: columnas }).map((__, j) => (
              <Skeleton key={j} className={cn('h-4', j === 0 ? 'w-1/4' : 'flex-1')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tarjetas de carga (dashboard, listas móviles). */
export function SkeletonTarjetas({ cantidad = 4, className }: { cantidad?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', className)} aria-busy="true" aria-label="Cargando">
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-5">
          <Skeleton className="mb-3 h-3 w-24" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}
