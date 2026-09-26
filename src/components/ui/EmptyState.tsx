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
    <div className="rounded-2xl border border-dashed border-line-strong/70 bg-surface px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 ring-8 ring-primary-50/40 dark:bg-primary-400/10 dark:ring-primary-400/5">
        <Icon className="h-6 w-6 text-primary-600 dark:text-primary-300" />
      </div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>
      )}
    </div>
  );
}
