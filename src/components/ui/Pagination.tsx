import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  label?: string;
  className?: string;
}

export default function Pagination({
  page,
  total,
  pageSize,
  totalItems,
  onPageChange,
  label = 'registros',
  className,
}: PaginationProps) {
  const current = Math.max(1, Math.floor(Number(page) || 1));
  const size = Math.max(1, Math.floor(Number(pageSize) || 1));
  const totalN = Math.max(0, Math.floor(Number(total) || 0));
  const totalItemsN = Math.max(0, Math.floor(Number(totalItems) || 0));
  const totalPages = Math.ceil(totalN / size);

  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const showPageNumbers = totalPages <= 10;

  return (
    <div className={cn('flex items-center justify-between border-t border-line px-4 py-3 sm:px-5', className)}>
      <span className="hidden lg:inline text-sm text-muted">
        Mostrando {Math.min((current - 1) * size + 1, totalItemsN)}–{Math.min(current * size, totalItemsN)} de {totalItemsN} {label}
      </span>
      <span className="lg:hidden text-sm text-muted">
        {current}/{totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, current - 1))}
          disabled={current <= 1}
          className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface shadow-soft px-2 sm:px-3 py-1.5 text-sm font-medium text-fg-2 hover:bg-surface-2 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Anterior</span>
        </button>
        {showPageNumbers && (
          <div className="hidden md:flex items-center gap-1">
            {pages.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={cn(
                  'h-8 min-w-8 rounded-lg px-2 text-sm font-semibold tabular-nums transition-colors',
                  p === current ? 'bg-primary-600 text-white' : 'text-fg-2 hover:bg-surface-2'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {!showPageNumbers && (
          <span className="hidden sm:inline text-sm font-medium text-fg-2 px-2">
            {current} / {totalPages}
          </span>
        )}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, current + 1))}
          disabled={current >= totalPages}
          className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface shadow-soft px-2 sm:px-3 py-1.5 text-sm font-medium text-fg-2 hover:bg-surface-2 disabled:opacity-40"
        >
          <span className="hidden sm:inline">Siguiente</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
