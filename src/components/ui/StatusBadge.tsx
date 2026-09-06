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
  const style = config[status] || { bg: 'bg-gray-100', text: 'text-gray-700' };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
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
