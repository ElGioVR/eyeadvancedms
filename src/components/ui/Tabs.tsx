'use client';

import { cn } from '@/lib/utils';

interface TabsProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export default function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
      <nav className="inline-flex min-w-full gap-1 rounded-2xl bg-surface-2 p-1 sm:min-w-0" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={active === tab}
            onClick={() => onChange(tab)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all sm:flex-none',
              active === tab
                ? 'bg-surface text-fg shadow-soft dark:bg-surface-3'
                : 'text-muted hover:text-fg'
            )}
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
  );
}
