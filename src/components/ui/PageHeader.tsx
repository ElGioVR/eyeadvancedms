'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackLink {
  href: string;
  label: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}

interface PageHeaderProps {
  title: string;
  subtitle: React.ReactNode;
  action?: React.ReactNode;
  backLink?: BackLink;
  /** Etiqueta pequeña sobre el título (p. ej. la fecha de hoy). */
  eyebrow?: string;
  /** Barra de acento de color junto al título. */
  acento?: boolean;
}

export default function PageHeader({ title, subtitle, action, backLink, eyebrow, acento = true }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8">
      <div className="min-w-0">
        {backLink && (
          <Link
            href={backLink.href}
            onClick={backLink.onClick}
            className="mb-3 inline-flex items-center gap-1 rounded-lg py-1 pr-2 text-sm font-medium text-muted transition-colors hover:text-fg"
          >
            <ChevronLeft className="h-4 w-4" />
            {backLink.label}
          </Link>
        )}
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-600 dark:text-primary-300">
            {eyebrow}
          </p>
        )}
        <h1
          className={cn(
            'break-words text-2xl font-semibold tracking-tight text-fg sm:text-[28px] sm:leading-9',
            acento && "relative pl-4 before:absolute before:left-0 before:top-1/2 before:h-[1.6rem] before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-gradient-to-b before:from-primary-400 before:to-primary-700 before:content-['']",
          )}
        >
          {title}
        </h1>
        <div className={cn('mt-1.5 text-sm text-muted', acento && 'pl-4')}>{subtitle}</div>
      </div>
      {action && <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{action}</div>}
    </div>
  );
}
