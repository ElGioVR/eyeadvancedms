import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Indicador de ficha creada automáticamente (importación masiva) a la que le
 * faltan datos para futuras consultas y cirugías.
 */
export default function BadgeCompletar({ faltantes, className }: { faltantes?: string[]; className?: string }) {
  const detalle = faltantes && faltantes.length ? `Falta: ${faltantes.join(', ')}` : 'Faltan datos de la ficha';
  return (
    <span
      title={detalle}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
        className
      )}
    >
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
      Completar información
      <span className="sr-only">. {detalle}</span>
    </span>
  );
}
