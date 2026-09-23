'use client';

import { useEffect, useState } from 'react';
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
  const [items, setItems] = useState<LIODisponible[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/inventario/disponible?tipo=LENTE_INTRAOCULAR')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setItems(list);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = items.find((i) => i.id === value) || null;

  return (
    <div className={cn('space-y-2', className)}>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled || loading}
        className={cn(
          'w-full rounded-lg border border-gray-200 dark:border-[#2F3336]',
          'bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm',
          'text-gray-900 dark:text-[#E7E9EA]',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
          'appearance-none disabled:opacity-60'
        )}
      >
        <option value="">{placeholder}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {formatearOpcion(item)}
          </option>
        ))}
      </select>
      {selected && (
        <div className="rounded-lg border border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327]/60 px-3 py-2 text-xs text-gray-600 dark:text-[#71767B]">
          {formatearResumen(selected)}
        </div>
      )}
    </div>
  );
}
