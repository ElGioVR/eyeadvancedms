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
}: {
  crear: () => DocumentoExport;
  className?: string;
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
    <div className={className ?? 'flex flex-wrap items-center gap-2 no-print'}>
      {FORMATOS.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => void exportar(f)}
          className="rounded-lg border border-line px-2.5 py-2 text-xs font-bold uppercase text-fg-2 hover:bg-surface-2"
        >
          {ETIQUETA[f]}
        </button>
      ))}
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
