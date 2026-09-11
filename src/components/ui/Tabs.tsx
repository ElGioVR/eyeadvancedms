'use client';

import { cn } from '@/lib/utils';

interface TabsProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export default function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="border-b border-gray-200 dark:border-[#2F3336]">
      <nav className="-mb-px flex gap-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={cn(
              'whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors',
              active === tab
                ? 'border-primary-600 text-primary-600 dark:border-[#1D9BF0] dark:text-[#1D9BF0]'
                : 'border-transparent text-gray-500 dark:text-[#71767B] hover:border-gray-300 dark:hover:border-[#536471] hover:text-gray-700 dark:hover:text-[#E7E9EA]'
            )}
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
  );
}
