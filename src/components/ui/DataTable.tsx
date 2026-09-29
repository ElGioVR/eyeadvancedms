'use client';

import { cn } from '@/lib/utils';
import BarraRevalidando from './BarraRevalidando';

interface Column {
  key: string;
  label: string;
  className?: string;
  render?: (value: any, row: any) => React.ReactNode;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  onRowClick?: (row: any) => void;
  emptyMessage?: string;
  /** Revalidando en segundo plano: barra fina arriba, el contenido se queda. */
  validating?: boolean;
  /** Campo con el id estable de cada fila (por defecto `id`). */
  rowKey?: string;
}

export default function DataTable({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No hay datos disponibles',
  validating = false,
  rowKey = 'id',
}: DataTableProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
      <BarraRevalidando activo={validating} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted first:pl-5 last:pr-5',
                    col.className
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr
                  // Clave estable: al refrescar solo se re-renderizan las filas que cambian
                  // y únicamente las filas nuevas hacen la animación de entrada.
                  key={row?.[rowKey] ?? rowIndex}
                  onClick={() => onRowClick?.(row)}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    'animate-fadeIn transition-colors hover:bg-surface-2/70',
                    onRowClick && 'cursor-pointer focus-visible:bg-surface-2/70 focus-visible:outline-none'
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3.5 text-fg first:pl-5 last:pr-5', col.className)}>
                      {col.render
                        ? col.render(row[col.key], row)
                        : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
