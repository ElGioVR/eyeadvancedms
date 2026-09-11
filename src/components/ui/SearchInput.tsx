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
        <Search className="h-4 w-4 text-gray-400 dark:text-[#71767B]" />
      </div>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="block w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#202327] py-2 pl-10 pr-3 text-sm text-gray-900 dark:text-[#E7E9EA] placeholder-gray-400 dark:placeholder-[#71767B] shadow-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:focus:ring-[#1D9BF0]/30 dark:focus:border-[#1D9BF0]"
      />
    </div>
  );
}
