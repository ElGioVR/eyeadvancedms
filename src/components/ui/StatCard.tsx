'use client';

import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  trend?: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor?: string;
}

export default function StatCard({
  label,
  value,
  trend,
  icon: Icon,
  color,
  bgColor,
  borderColor,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop dark:shadow-none dark:hover:border-line-strong sm:p-5',
        borderColor || 'border-line'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11', bgColor)}>
          <Icon className={cn('h-5 w-5', color)} />
        </div>
        {trend && (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300">
            {trend}
          </span>
        )}
      </div>
      <div className="mt-3 min-w-0 sm:mt-4">
        <p className="truncate text-xs font-medium text-muted sm:text-sm">{label}</p>
        <p className="mt-0.5 truncate text-xl font-semibold tracking-tight text-fg tabular-nums sm:text-[28px] sm:leading-9">{value}</p>
      </div>
    </div>
  );
}
