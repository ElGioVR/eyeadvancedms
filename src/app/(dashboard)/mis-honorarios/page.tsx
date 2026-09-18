'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, Clock, CheckCircle2, DollarSign, ArrowDownLeft, ArrowUpRight, Calendar } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { cn } from '@/lib/utils';
import Skeleton from '@/components/ui/Skeleton';

interface KPIs {
  servicios_ejecutados: number;
  honorario_devengado: number;
  ticket_promedio: number;
  consultas_totales: number;
}

interface EventoFila {
  id: string;
  fecha_servicio: string;
  paciente_nombre: string;
  origen_tipo: string;
  rol: string;
  monto_devengado: number;
  estado: string;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

const estadoBadge: Record<string, { bg: string; text: string }> = {
  DEVENGADO: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  PENDIENTE: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  LIQUIDADO: { bg: 'bg-violet-500/15', text: 'text-violet-400' },
  REVERSADO: { bg: 'bg-red-500/15', text: 'text-red-400' },
};

const tipoIcons: Record<string, typeof DollarSign> = {
  CONSULTA: TrendingUp,
  ESTUDIO: TrendingUp,
  PROCEDIMIENTO: TrendingUp,
  OPERACION: TrendingUp,
};

export default function MisHonorariosPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [eventos, setEventos] = useState<EventoFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    if (!user?.doctor_id) return;
    setLoading(true);
    try {
      const [metricasRes, eventosRes] = await Promise.all([
        fetch(`/api/honorarios/doctores/${user.doctor_id}/metricas`),
        fetch(`/api/honorarios/doctores/${user.doctor_id}/eventos?page=${page}&pageSize=15`),
      ]);
      if (metricasRes.ok) {
        const data = await metricasRes.json();
        setKpis(data.kpis);
      }
      if (eventosRes.ok) {
        const data = await eventosRes.json();
        setEventos(data.data || []);
        setTotal(data.total || 0);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [user?.doctor_id, page]);

  useEffect(() => {
    if (!userLoading) {
      if (user?.doctor_id) {
        fetchData();
      } else {
        setLoading(false);
      }
    }
  }, [userLoading, user?.doctor_id, fetchData]);

  if (userLoading || loading) {
    return (
      <div className="mx-auto max-w-[600px] space-y-5">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user?.doctor_id) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No se encontró información del doctor.</p>
      </div>
    );
  }

  const devengadoPendiente = eventos.filter(e => e.estado === 'PENDIENTE' || e.estado === 'DEVENGADO').reduce((s, e) => s + e.monto_devengado, 0);
  const devengadoPagado = eventos.filter(e => e.estado === 'LIQUIDADO').reduce((s, e) => s + e.monto_devengado, 0);

  return (
    <div className="mx-auto max-w-[600px] space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-gray-900 dark:text-[#E7E9EA]">Mis Honorarios</h1>
        <p className="text-sm text-gray-400 dark:text-[#71767B]">Tu registro de ingresos por servicios</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-[#E7E9EA]">{fmtMoney(devengadoPendiente)}</p>
          <p className="text-xs text-gray-400 dark:text-[#71767B] mt-0.5">Pendiente</p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-emerald-600">{fmtMoney(devengadoPagado)}</p>
          <p className="text-xs text-gray-400 dark:text-[#71767B] mt-0.5">Pagado</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4">
          <p className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA]">{kpis?.servicios_ejecutados ?? 0}</p>
          <p className="text-xs text-gray-400 dark:text-[#71767B]">Servicios</p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-4">
          <p className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA]">{fmtMoney(kpis?.ticket_promedio ?? 0)}</p>
          <p className="text-xs text-gray-400 dark:text-[#71767B]">Ticket promedio</p>
        </div>
      </div>

      {/* Transaction list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">Movimientos</h2>
          <span className="text-xs text-gray-400 dark:text-[#71767B]">{total} total</span>
        </div>

        {eventos.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C]">
            <TrendingUp className="h-10 w-10 text-gray-300 dark:text-[#2F3336] mx-auto mb-3" />
            <p className="text-sm text-gray-400 dark:text-[#71767B]">Sin movimientos registrados</p>
          </div>
        ) : (
          <div className="space-y-2">
            {eventos.map((ev) => {
              const badge = estadoBadge[ev.estado] || estadoBadge.PENDIENTE;
              return (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-3"
                >
                  <div className={cn('h-10 w-10 rounded-full flex items-center justify-center shrink-0', badge.bg)}>
                    <ArrowUpRight className={cn('h-5 w-5', badge.text)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] truncate">{ev.origen_tipo}</p>
                    <p className="text-xs text-gray-400 dark:text-[#71767B] truncate">{ev.paciente_nombre || 'Paciente'} · {ev.fecha_servicio}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-emerald-600">+{fmtMoney(ev.monto_devengado)}</p>
                    <span className={cn('text-[10px] font-bold uppercase', badge.text)}>{ev.estado}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {total > 15 && (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-[#2F3336] rounded-xl disabled:opacity-30 text-gray-700 dark:text-[#E7E9EA]"
            >
              Anterior
            </button>
            <span className="text-xs text-gray-400">Página {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={eventos.length < 15}
              className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-[#2F3336] rounded-xl disabled:opacity-30 text-gray-700 dark:text-[#E7E9EA]"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
