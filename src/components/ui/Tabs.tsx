'use client';

import { cn } from '@/lib/utils';

interface TabsProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export default function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex gap-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={cn(
              'whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors',
              active === tab
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            )}
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
  );
}
