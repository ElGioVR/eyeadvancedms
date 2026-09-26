'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label?: string;
  activeColor?: string;
  id?: string;
}

export default function FilterSelect({
  value,
  onChange,
  options,
  label,
  activeColor = 'bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-400/10 dark:text-primary-300 dark:border-primary-400/30',
  id,
}: FilterSelectProps) {
  const isActive = value !== options[0];

  return (
    <div className="relative min-w-0">
      {label && (
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      )}
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-10 w-full min-w-0 appearance-none truncate rounded-xl border px-3 pr-8 text-sm font-medium shadow-soft transition-all focus:outline-none focus:ring-4 focus:ring-primary-500/15 sm:min-w-[9rem]',
            isActive
          ? activeColor
          : 'border-line bg-surface dark:bg-surface-2 text-fg-2 hover:border-line-strong'
          )}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <ChevronDown className="h-4 w-4 text-muted" />
        </div>
      </div>
    </div>
  );
}
