'use client';

import { cn } from '@/lib/utils';

interface StatusConfig {
  bg: string;
  text: string;
  dot?: string;
}

interface StatusBadgeProps {
  status: string;
  config: Record<string, StatusConfig>;
}

export default function StatusBadge({ status, config }: StatusBadgeProps) {
  const style = config[status] || { bg: 'bg-surface-2', text: 'text-fg-2' };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none ring-1 ring-inset ring-black/5 dark:ring-white/10',
        style.bg,
        style.text
      )}
    >
      {style.dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      )}
      {status}
    </span>
  );
}
