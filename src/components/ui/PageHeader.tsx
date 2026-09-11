'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackLink {
  href: string;
  label: string;
}

interface PageHeaderProps {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  backLink?: BackLink;
}

export default function PageHeader({ title, subtitle, action, backLink }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        {backLink && (
          <Link
            href={backLink.href}
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-gray-500 dark:text-[#71767B] hover:text-gray-700 dark:hover:text-[#E7E9EA]"
          >
            <ChevronLeft className="h-4 w-4" />
            {backLink.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-[#E7E9EA]">{title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-[#71767B]">{subtitle}</p>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
