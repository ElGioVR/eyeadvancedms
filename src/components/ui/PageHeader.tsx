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
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {backLink && (
          <Link
            href={backLink.href}
            onClick={backLink.onClick}
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-gray-500 dark:text-[#71767B] hover:text-gray-700 dark:hover:text-[#E7E9EA]"
          >
            <ChevronLeft className="h-4 w-4" />
            {backLink.label}
          </Link>
        )}
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-[#E7E9EA] break-words">{title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-[#71767B]">{subtitle}</p>
      </div>
      {action && <div className="w-full sm:w-auto">{action}</div>}
    </div>
  );
}
