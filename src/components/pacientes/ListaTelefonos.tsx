import { Briefcase, Home, Smartphone, Star, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EtiquetaTelefono, TelefonoPaciente } from '@/lib/telefonos-paciente';

const ICONOS: Record<EtiquetaTelefono, LucideIcon> = {
  Celular: Smartphone,
  Casa: Home,
  Trabajo: Briefcase,
  Familiar: Users,
};

/** 6641239439 → «664 123 9439»; con lada de país → «+52 664 123 9439». */
export function formatearTelefono(numero: string): string {
  const d = numero.replace(/\D/g, '');
  const local = (n: string) => `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  if (d.length === 10) return local(d);
  if (d.length === 12 && d.startsWith('52')) return `+52 ${local(d.slice(2))}`;
  if (d.length === 11 && d.startsWith('1')) return `+1 ${local(d.slice(1))}`;
  return numero.trim();
}

interface Props {
  telefonos: TelefonoPaciente[];
  /** 'derecha' = alineado a la derecha (cabecera en escritorio) · 'izquierda' = móvil / tarjetas. */
  alineacion?: 'derecha' | 'izquierda';
  className?: string;
}

/**
 * Teléfonos del paciente: ícono según la etiqueta, número con espacios, la
 * etiqueta como chip y una estrella en el principal. Cada número es un enlace
 * para llamar (útil en celular).
 */
export default function ListaTelefonos({ telefonos, alineacion = 'izquierda', className }: Props) {
  if (!telefonos.length) return <p className={cn('text-sm font-bold text-fg', className)}>—</p>;
  const varios = telefonos.length > 1;
  return (
    <ul className={cn('space-y-1.5', alineacion === 'derecha' && 'flex flex-col items-end', className)}>
      {telefonos.map((t) => {
        const Icono = ICONOS[t.etiqueta] ?? Smartphone;
        return (
          <li key={t.numero} className={cn('flex items-center gap-2', alineacion === 'derecha' && 'flex-row-reverse')}>
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                t.principal && varios
                  ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300'
                  : 'bg-surface-2 text-muted',
              )}
              aria-hidden
            >
              <Icono className="h-3.5 w-3.5" />
            </span>
            <div className={cn('flex flex-col leading-tight', alineacion === 'derecha' && 'items-end')}>
              <a href={`tel:${t.numero.replace(/[^\d+]/g, '')}`} className="text-sm font-bold tabular-nums text-fg hover:text-primary-600">
                {formatearTelefono(t.numero)}
              </a>
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                {t.etiqueta}
                {t.principal && varios && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-px text-[9px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    <Star className="h-2.5 w-2.5 fill-current" /> Principal
                  </span>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
