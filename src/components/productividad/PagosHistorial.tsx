'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { Download, History, Loader2 } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/money';
import { formatFechaCsv } from '@/lib/rangos';
import type { PagoHonorarioFila } from '@/types/productividad';

interface RespuestaPagos {
  items: PagoHonorarioFila[];
  total: number;
  page: number;
  pageSize: number;
  total_monto: number;
}

const th =
  'px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400';
const thR = 'px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400';
const td = 'px-4 py-3 text-sm text-fg-2';
const tdR = 'px-4 py-3 text-right text-sm font-semibold text-fg';

export default function PagosHistorial({
  desde,
  hasta,
  doctorId,
}: {
  desde: string;
  hasta: string;
  doctorId: string;
}) {
  const { toast } = useToast();
  // La página vuelve a 1 al cambiar rango/doctor sin pedir la página vieja del filtro nuevo.
  const filtro = `${desde}|${hasta}|${doctorId}`;
  const [paginado, setPaginado] = useState({ filtro, page: 1 });
  const page = paginado.filtro === filtro ? paginado.page : 1;
  const [descargando, setDescargando] = useState(false);

  let url: string | null = null;
  if (desde && hasta) {
    const params = new URLSearchParams({ desde, hasta, page: String(page), pageSize: '50' });
    if (doctorId) params.set('doctor_id', doctorId);
    url = `/api/productividad/honorarios/pagos?${params}`;
  }
  const { data, error: errorSwr, isLoading, isValidating } = useSWR<RespuestaPagos>(url);
  const error = errorSwr ? (errorSwr instanceof Error ? errorSwr.message : 'Error al cargar historial') : null;

  const cambiarPagina = useCallback((p: number) => setPaginado({ filtro, page: p }), [filtro]);

  const descargarCsv = useCallback(async () => {
    if (!desde || !hasta || descargando) return;
    setDescargando(true);
    try {
      const params = new URLSearchParams({ desde, hasta, formato: 'csv' });
      if (doctorId) params.set('doctor_id', doctorId);
      const res = await fetch(`/api/productividad/honorarios/pagos?${params}`, { credentials: 'same-origin' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'No se pudo generar el CSV');
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `historial-pagos-${desde}_${hasta}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al descargar CSV', 'error');
    } finally {
      setDescargando(false);
    }
  }, [desde, hasta, doctorId, descargando, toast]);

  if (!data && (isLoading || !url)) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
        {error}
      </div>
    );
  }

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="valor-suave text-sm font-semibold text-fg" data-validando={isValidating}>
            {data?.total || 0} pagos
          </span>
          <span className="valor-suave text-sm font-bold text-emerald-600" data-validando={isValidating}>
            {formatCurrency(data?.total_monto || 0)}
          </span>
          <span className="text-xs text-gray-400">
            {formatFechaCsv(desde)} – {formatFechaCsv(hasta)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void descargarCsv()}
          disabled={descargando}
          className="inline-flex items-center gap-2 px-4 py-2 border border-line bg-surface text-fg-2 rounded-lg transition-colors hover:bg-surface-2 text-sm font-medium disabled:opacity-50"
        >
          {descargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {descargando ? 'Generando…' : 'CSV'}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
      )}

      <div className="relative rounded-2xl border border-line bg-surface overflow-hidden" aria-busy={isValidating}>
        <BarraRevalidando activo={isValidating} />
        {items.length === 0 ? (
          <EmptyState
            icon={History}
            title="Sin pagos en el rango"
            description="No hay honorarios pagados con fecha de pago en el rango seleccionado"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-surface-2/50">
                  <th className={th}>Fecha pago</th>
                  <th className={th}>Doctor</th>
                  <th className={th}>Fecha servicio</th>
                  <th className={th}>Fuente</th>
                  <th className={thR}>Monto</th>
                  <th className={th}>Pagado por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 anim-lista">
                {items.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-surface-2">
                    <td className={`${td} font-semibold`}>
                      {p.fecha_pago ? formatFechaCsv(p.fecha_pago) : '—'}
                    </td>
                    <td className={td}>{p.doctor_nombre}</td>
                    <td className={td}>{p.fecha_servicio ? formatFechaCsv(p.fecha_servicio) : '—'}</td>
                    <td className={td}>{p.fuente}</td>
                    <td className={tdR}>{formatCurrency(p.monto)}</td>
                    <td className={td}>{p.pagado_por_nombre || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={data?.page || page}
              total={data?.total || 0}
              pageSize={data?.pageSize || 50}
              totalItems={data?.total || 0}
              onPageChange={cambiarPagina}
              label="pagos"
            />
          </div>
        )}
      </div>
    </div>
  );
}
