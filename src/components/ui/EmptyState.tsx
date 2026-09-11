'use client';

import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export default function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-6 py-12 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-[#202327]">
        <Icon className="h-6 w-6 text-gray-400 dark:text-[#71767B]" />
      </div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E7E9EA]">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-[#71767B]">{description}</p>
      )}
    </div>
  );
}
