'use client';

import useSWR from 'swr';
import Modal from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import type { Insumo, MovimientoInsumo, UbicacionInsumo } from '@/lib/insumos';
import { fmtFecha } from './comun';

const ETIQUETA: Record<MovimientoInsumo['tipo'], string> = { ENTRADA: 'Entrada', SALIDA: 'Salida', AJUSTE: 'Ajuste', TRASLADO: 'Traslado', MERMA: 'Merma' };

export default function KardexInsumo({ insumo, ubicaciones, onClose }: { insumo: Insumo; ubicaciones: UbicacionInsumo[]; onClose: () => void }) {
  const { data, isLoading } = useSWR<{ movimientos: MovimientoInsumo[] }>(`/api/inventario/insumos/movimientos?insumo_id=${insumo.id}`);
  const ubic = (id: string | null) => (id ? ubicaciones.find((u) => u.id === id)?.nombre ?? '—' : '—');
  const movs = data?.movimientos ?? [];
  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-2xl">
      <h3 className="text-lg font-bold text-fg">Kardex · {insumo.nombre}</h3>
      <p className="mb-3 text-xs text-muted">Últimos 300 movimientos.</p>
      {isLoading ? <div className="h-32 animate-pulse rounded-xl bg-surface-2" /> : movs.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Sin movimientos.</p>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
          {movs.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-fg">
                  {ETIQUETA[m.tipo]} · {ubic(m.ubicacion_id)}
                  {m.tipo === 'TRASLADO' && m.ubicacion_destino_id ? (m.cantidad < 0 ? ` → ${ubic(m.ubicacion_destino_id)}` : ` ← ${ubic(m.ubicacion_destino_id)}`) : ''}
                </p>
                <p className="truncate text-xs text-muted">
                  {[m.lote ? `Lote ${m.lote}` : null, m.fecha_caducidad ? `vence ${fmtFecha(m.fecha_caducidad)}` : null, m.motivo, m.usuario_nombre].filter(Boolean).join(' · ') || '—'}
                </p>
                <p className="text-[11px] text-muted">{new Date(m.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn('font-bold tabular-nums', m.cantidad > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}</p>
                {m.cantidad_resultante !== null && <p className="text-[11px] text-muted">quedan {m.cantidad_resultante} en el lote</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
