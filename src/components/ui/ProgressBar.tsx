'use client';

import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  maxValue?: number;
  color?: string;
  height?: string;
}

export default function ProgressBar({
  value,
  maxValue = 100,
  color = 'bg-primary-500',
  height = 'h-2.5',
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / maxValue) * 100, 0), 100);

  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-gray-100 dark:bg-[#2F3336]', height)}>
      <div
        className={cn('h-full rounded-full transition-all duration-300', color)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
