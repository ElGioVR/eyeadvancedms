'use client';

import { cn } from '@/lib/utils';

/**
 * Barra fina e indeterminada que indica "actualizando datos" sin tapar el
 * contenido. Colocar dentro de un contenedor `relative`.
 */
export default function BarraRevalidando({ activo, className }: { activo: boolean; className?: string }) {
  return (
    <div
      aria-hidden={!activo}
      role={activo ? 'progressbar' : undefined}
      aria-label={activo ? 'Actualizando' : undefined}
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-full transition-opacity duration-300',
        activo ? 'opacity-100' : 'opacity-0',
        className
      )}
    >
      <div className="h-full w-2/5 bg-primary-500/80 animate-barraCarga" />
    </div>
  );
}
