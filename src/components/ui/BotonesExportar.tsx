'use client';

import { useState } from 'react';
import { exportarDocumento, type DocumentoExport, type FormatoExport } from '@/lib/exportar-documento';

const FORMATOS: FormatoExport[] = ['pdf', 'xlsx', 'docx'];
const ETIQUETA: Record<FormatoExport, string> = { pdf: 'PDF', xlsx: 'Excel', docx: 'Word' };

/**
 * Botones PDF / Excel / Word. `crear` se llama al pulsar, así el documento
 * siempre refleja los datos que están en pantalla en ese momento.
 */
export default function BotonesExportar({
  crear,
  className,
  segmentado = false,
}: {
  crear: () => DocumentoExport;
  className?: string;
  /** Un solo control agrupado (PDF · EXCEL · WORD) en lugar de botones sueltos. */
  segmentado?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  const exportar = async (formato: FormatoExport) => {
    setError(null);
    try {
      await exportarDocumento(crear(), formato);
    } catch {
      setError('No se pudo generar el archivo. Intenta de nuevo.');
    }
  };

  return (
    <div className={className ?? (segmentado
      ? 'inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-soft no-print'
      : 'flex flex-wrap items-center gap-2 no-print')}>
      {FORMATOS.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => void exportar(f)}
          className={segmentado
            ? 'rounded-lg px-3 py-1.5 text-[11px] font-bold tracking-wide text-muted transition-colors hover:bg-surface-2 hover:text-fg'
            : 'rounded-lg border border-line px-2.5 py-2 text-xs font-bold uppercase text-fg-2 hover:bg-surface-2'}
        >
          {ETIQUETA[f]}
        </button>
      ))}
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
