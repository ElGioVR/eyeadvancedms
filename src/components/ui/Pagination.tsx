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
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const showPageNumbers = totalPages <= 7;

  return (
    <div className={cn('flex items-center justify-between border-t border-gray-100 bg-gray-50/30 px-4 sm:px-6 py-3', className)}>
      <span className="hidden sm:inline text-sm text-gray-400">
        Mostrando {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} de {total} {label}
      </span>
      <span className="sm:hidden text-sm text-gray-400">
        {page}/{totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 sm:px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Anterior</span>
        </button>
        {showPageNumbers && (
          <div className="hidden sm:flex items-center gap-1">
            {pages.map((p) => (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={cn(
                  'h-8 w-8 rounded-md text-sm font-bold transition-colors',
                  p === page ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {!showPageNumbers && (
          <span className="hidden sm:inline text-sm font-medium text-gray-600 px-2">
            {page} / {totalPages}
          </span>
        )}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 sm:px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <span className="hidden sm:inline">Siguiente</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
