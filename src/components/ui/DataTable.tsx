'use client';

import { cn } from '@/lib/utils';

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
}

export default function DataTable({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No hay datos disponibles',
}: DataTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
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
                  key={rowIndex}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'transition-colors hover:bg-surface-2/70',
                    onRowClick && 'cursor-pointer'
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
