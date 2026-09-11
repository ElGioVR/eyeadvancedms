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
  activeColor = 'bg-primary-50 text-primary-700 border-primary-200',
  id,
}: FilterSelectProps) {
  const isActive = value !== options[0];

  return (
    <div className="relative">
      {label && (
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-500 dark:text-[#71767B]">{label}</label>
      )}
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'appearance-none rounded-lg border px-3 py-2 pr-8 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary-500',
            isActive
          ? activeColor
          : 'border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#202327] text-gray-700 dark:text-[#E7E9EA] hover:border-gray-300 dark:hover:border-[#536471]'
          )}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <ChevronDown className="h-4 w-4 text-gray-400 dark:text-[#71767B]" />
        </div>
      </div>
    </div>
  );
}
