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
        'rounded-xl border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md',
        borderColor || 'border-gray-200'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {trend && (
            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              {trend}
            </span>
          )}
        </div>
        <div className={cn('rounded-xl p-3', bgColor)}>
          <Icon className={cn('h-6 w-6', color)} />
        </div>
      </div>
    </div>
  );
}
