'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LIODisponible {
  id: string;
  marca: string;
  modelo: string | null;
  tipo_lio: string | null;
  potencia_dioptrias: number | null;
  lote: string | null;
  fecha_caducidad: string | null;
  stock: number;
}

interface LIOSelectorProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/** Clave de caché del catálogo de LIOs disponibles (misma URL en todas las pantallas). */
export const URL_LIOS_DISPONIBLES = '/api/inventario/disponible?tipo=LENTE_INTRAOCULAR';

async function obtenerLIOs(): Promise<LIODisponible[]> {
  const r = await fetch('/api/inventario/disponible?tipo=LENTE_INTRAOCULAR', { credentials: 'same-origin', cache: 'no-store' });
  // Error → lanzar (no cachear una lista vacía falsa); SWR reintenta
  if (!r.ok) throw new Error('No se pudieron cargar los LIO disponibles');
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

function formatearOpcion(item: LIODisponible): string {
  const partes: string[] = [item.marca];
  if (item.modelo) partes.push(item.modelo);
  if (item.tipo_lio) partes.push(`(${item.tipo_lio})`);
  if (item.potencia_dioptrias != null) partes.push(`${item.potencia_dioptrias}D`);
  partes.push(`— Lote: ${item.lote || 'N/A'}`);
  partes.push(`Cad: ${item.fecha_caducidad || 'N/A'}`);
  partes.push(`(${item.stock} pzas)`);
  return partes.join(' ');
}

function formatearResumen(item: LIODisponible): string {
  const partes = [
    `Marca: ${item.marca}`,
    `Modelo: ${item.modelo || 'N/A'}`,
    `Tipo: ${item.tipo_lio || 'N/A'}`,
    `Lote: ${item.lote || 'N/A'}`,
    `Caducidad: ${item.fecha_caducidad || 'N/A'}`,
  ];
  return partes.join(' · ');
}

export default function LIOSelector({
  value,
  onChange,
  disabled = false,
  placeholder = 'Seleccionar LIO desde inventario',
  className,
}: LIOSelectorProps) {
  // Catálogo compartido (SWR): se pide una vez y lo reutilizan agenda y cirugías.
  const { data, isLoading: loading } = useSWR<LIODisponible[]>(URL_LIOS_DISPONIBLES, obtenerLIOs, {
    revalidateOnFocus: false,
  });
  const items = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const selected = items.find((i) => i.id === value) || null;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled || loading}
          className={cn(
            'w-full rounded-lg border border-line',
            'bg-surface-2 px-4 py-2.5 text-sm',
            'text-fg',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
            'appearance-none disabled:opacity-60 pr-10'
          )}
        >
          <option value="">
            {loading ? 'Cargando LIOs...' : items.length === 0 ? 'Sin LIOs disponibles en inventario' : placeholder}
          </option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {formatearOpcion(item)}
            </option>
          ))}
        </select>
        {loading && (
          <Loader2 className="w-4 h-4 animate-spin text-primary-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        )}
      </div>
      {selected && (
        <div className="rounded-lg border border-line/70 bg-gray-50 dark:bg-surface-2/60 px-3 py-2 text-xs text-gray-600 dark:text-muted animate-fadeIn">
          {formatearResumen(selected)}
        </div>
      )}
    </div>
  );
}
