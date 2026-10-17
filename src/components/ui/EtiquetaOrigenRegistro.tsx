import { cn } from '@/lib/utils';

/**
 * Origen del registro de una cirugía o consulta: «Import masivo» (Excel/CSV) o
 * «Agenda local» (capturada en el sistema). Sin dato (BD sin la columna) no se muestra.
 */
export default function EtiquetaOrigenRegistro({ origen, className }: { origen: string | null | undefined; className?: string }) {
  if (!origen) return null;
  const importado = origen === 'IMPORTACION';
  return (
    <span
      title={importado ? 'Registro creado por la importación masiva (Excel/CSV)' : 'Registro capturado en la agenda del sistema'}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset',
        importado
          ? 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30'
          : 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-500/30',
        className,
      )}
    >
      {importado ? 'Import masivo' : 'Agenda local'}
    </span>
  );
}
