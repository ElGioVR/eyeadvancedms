'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar...',
  className,
  id,
  'aria-label': ariaLabel,
}: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Search className="h-4 w-4 text-muted" />
      </div>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="block h-10 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm text-fg placeholder:text-muted shadow-soft transition-all focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 dark:bg-surface-2"
      />
    </div>
  );
}
