'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRutaNavegacion, useVolver } from '@/components/layout/RutaNavegacion';
import { usePathname } from 'next/navigation';
import { rutaSinQuery } from '@/lib/navegacion/rutas';
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
  const ruta = useRutaNavegacion();
  const pathname = usePathname();
  const volver = useVolver(backLink ?? { href: '/dashboard', label: 'Inicio' });
  // Pantallas previas de la ruta recorrida (Pacientes › Agenda › …), sin la actual.
  const previas = ruta.filter((e) => rutaSinQuery(e.href) !== rutaSinQuery(pathname ?? '')).slice(-3);
  const usarRuta = !!backLink && volver.hayRuta && previas.length > 0;
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:mb-5">
      <div className="min-w-0">
        {/* Móvil: botón «Volver» grande y visible para todos los roles. */}
        {backLink && (
          <Link
            href={volver.href}
            onClick={backLink.onClick}
            className="mb-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 text-sm font-bold text-primary-700 shadow-sm transition-colors active:scale-[0.98] dark:border-primary-500/40 dark:bg-primary-500/15 dark:text-primary-200 lg:hidden"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
            Volver a {volver.label}
          </Link>
        )}
        {backLink && !usarRuta && (
          <Link
            href={backLink.href}
            onClick={backLink.onClick}
            className="mb-2 hidden items-center gap-1 rounded-lg py-1 pr-2 text-sm font-medium text-muted transition-colors hover:text-fg lg:inline-flex"
          >
            <ChevronLeft className="h-4 w-4" />
            {backLink.label}
          </Link>
        )}
        {usarRuta && (
          <nav aria-label="Ruta de navegación" className="mb-2 hidden flex-wrap lg:flex items-center gap-x-0.5 gap-y-1 text-sm font-medium text-muted">
            {previas.map((e, i) => (
              <span key={`${e.href}-${i}`} className="inline-flex items-center">
                {i > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 opacity-60" aria-hidden />}
                <Link
                  href={e.href}
                  className="inline-flex items-center gap-0.5 rounded-lg py-1 pr-1.5 transition-colors hover:text-fg"
                  title={i === previas.length - 1 ? `Volver a ${e.label}` : e.label}
                >
                  {i === previas.length - 1 && <ChevronLeft className="h-4 w-4" aria-hidden />}
                  {e.label}
                </Link>
              </span>
            ))}
          </nav>
        )}
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-600 dark:text-primary-300">
            {eyebrow}
          </p>
        )}
        <h1
          className={cn(
            'break-words text-2xl font-semibold tracking-tight text-fg lg:text-[26px] lg:leading-8',
            acento && "relative pl-4 before:absolute before:left-0 before:top-1/2 before:h-[1.6rem] before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-gradient-to-b before:from-primary-400 before:to-primary-700 before:content-['']",
          )}
        >
          {title}
        </h1>
        <div className={cn('mt-1 text-sm text-muted', acento && 'pl-4')}>{subtitle}</div>
      </div>
      {action && <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{action}</div>}
    </div>
  );
}
