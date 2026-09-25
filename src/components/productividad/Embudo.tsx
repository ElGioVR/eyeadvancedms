'use client';

import { formatCurrency } from '@/lib/money';
import type { HonorariosResumen } from '@/types/productividad';

interface Etapa {
  grupo: 'Eventos' | 'Monto';
  label: string;
  valor: number;
  base: number;
  formato: 'dinero' | 'numero';
  color: string;
}

function pct(valor: number, base: number): number {
  if (!base) return 0;
  return Math.min(100, Math.round((valor / base) * 100));
}

export default function Embudo({ resumen }: { resumen: HonorariosResumen }) {
  const conTarifa = Math.max(0, resumen.total_eventos - resumen.sin_monto);
  const etapas: Etapa[] = [
    {
      grupo: 'Eventos',
      label: 'Eventos del rango',
      valor: resumen.total_eventos,
      base: resumen.total_eventos,
      formato: 'numero',
      color: '#1D9BF0',
    },
    {
      grupo: 'Eventos',
      label: 'Con tarifa configurada',
      valor: conTarifa,
      base: resumen.total_eventos,
      formato: 'numero',
      color: '#8B5CF6',
    },
    {
      grupo: 'Monto',
      label: 'Devengado',
      valor: resumen.total_filtrado,
      base: resumen.total_filtrado,
      formato: 'dinero',
      color: '#10B981',
    },
    {
      grupo: 'Monto',
      label: 'Por pagar',
      valor: resumen.por_pagar,
      base: resumen.total_filtrado,
      formato: 'dinero',
      color: '#F59E0B',
    },
    {
      grupo: 'Monto',
      label: 'Pagado',
      valor: resumen.pagado,
      base: resumen.total_filtrado,
      formato: 'dinero',
      color: '#14B8A6',
    },
  ];

  let grupoActual: string | null = null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">
          Embudo de honorarios
        </h3>
        <span className="text-[11px] text-gray-400">
          Conversión devengado → pagado:{' '}
          {pct(resumen.pagado, resumen.total_filtrado)}%
        </span>
      </div>
      <div className="space-y-2">
        {etapas.map((e) => {
          const ancho = pct(e.valor, e.base);
          const encabezado = e.grupo !== grupoActual;
          grupoActual = e.grupo;
          return (
            <div key={e.label}>
              {encabezado && (
                <p className="mt-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {e.grupo}
                </p>
              )}
              <div className="flex items-center gap-3">
                <span className="w-52 shrink-0 text-xs text-gray-600 dark:text-[#9BA1A6]">
                  {e.label}
                </span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-gray-100 dark:bg-[#202327]">
                  <div
                    className="h-6 rounded-md transition-all"
                    style={{ width: `${ancho}%`, backgroundColor: e.color }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs font-bold text-gray-900 dark:text-[#E7E9EA]">
                  {e.formato === 'dinero' ? formatCurrency(e.valor) : e.valor}
                </span>
                <span className="w-10 shrink-0 text-right text-[11px] text-gray-400">
                  {ancho}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
