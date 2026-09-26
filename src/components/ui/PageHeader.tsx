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
  subtitle: string;
  action?: React.ReactNode;
  backLink?: BackLink;
}

export default function PageHeader({ title, subtitle, action, backLink }: PageHeaderProps) {
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
        <h1 className="break-words text-2xl font-semibold tracking-tight text-fg sm:text-[28px] sm:leading-9">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      {action && <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{action}</div>}
    </div>
  );
}
