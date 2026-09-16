'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Users, TrendingUp, Award, Calendar,
  ChevronRight, BarChart3,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';

interface DoctorRanking {
  doctor_id: string;
  doctor_nombre: string;
  especialidad: string;
  servicios: number;
  devengado: number;
  ranking: number;
}

interface Periodo {
  id: string;
  codigo: string;
  fecha_desde: string;
  fecha_hasta: string;
  estado: string;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

const estadoColors: Record<string, string> = {
  ABIERTO: 'bg-emerald-100 text-emerald-700',
  EN_REVISION: 'bg-amber-100 text-amber-700',
  CERRADO: 'bg-sky-100 text-sky-700',
  PAGADO: 'bg-purple-100 text-purple-700',
};

export default function HonorariosPage() {
  const [ranking, setRanking] = useState<DoctorRanking[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const lastDayStr = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

      const [rankRes, periodRes] = await Promise.all([
        fetch(`/api/honorarios/metricas/ranking?fecha_desde=${firstDay}&fecha_hasta=${lastDayStr}`),
        fetch('/api/honorarios/periodos'),
      ]);

      if (rankRes.ok) setRanking(await rankRes.json());
      if (periodRes.ok) setPeriodos(await periodRes.json());
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalDevengado = ranking.reduce((s, d) => s + d.devengado, 0);
  const totalServicios = ranking.reduce((s, d) => s + d.servicios, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Honorarios y Productividad"
        subtitle="Dashboard médico — métricas, tarifas y liquidaciones"
        action={
          <Link
            href="/honorarios/tarifas"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            <DollarSign className="w-4 h-4" />
            Configurar Tarifas
          </Link>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Doctores Activos" value={String(ranking.length)} color="text-blue-600" bgColor="bg-blue-50" />
            <StatCard icon={BarChart3} label="Servicios del Mes" value={String(totalServicios)} color="text-emerald-600" bgColor="bg-emerald-50" />
            <StatCard icon={DollarSign} label="Devengado del Mes" value={fmtMoney(totalDevengado)} color="text-violet-600" bgColor="bg-violet-50" />
            <StatCard icon={TrendingUp} label="Promedio por Doctor" value={ranking.length > 0 ? fmtMoney(totalDevengado / ranking.length) : '$0'} color="text-amber-600" bgColor="bg-amber-50" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Ranking de Doctores</h2>
                <span className="text-xs text-gray-500">Este mes</span>
              </div>

              {ranking.length === 0 ? (
                <EmptyState
                  icon={Award}
                  title="Sin datos de honorarios"
                  description="Los honorarios se generarán automáticamente al crear consultas con conceptos normalizados."
                />
              ) : (
                <div className="space-y-3">
                  {ranking.map((doc) => (
                    <Link
                      key={doc.doctor_id}
                      href={`/honorarios/doctores/${doc.doctor_id}`}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white',
                        doc.ranking === 1 ? 'bg-amber-500' :
                        doc.ranking === 2 ? 'bg-gray-400' :
                        doc.ranking === 3 ? 'bg-orange-400' :
                        'bg-gray-300'
                      )}>
                        {doc.ranking}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.doctor_nombre}</p>
                        <p className="text-xs text-gray-500">{doc.especialidad} · {doc.servicios} servicios</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{fmtMoney(doc.devengado)}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Períodos</h2>
                <Link href="/honorarios/periodos" className="text-xs text-primary-600 hover:underline">
                  Ver todos
                </Link>
              </div>

              {periodos.length === 0 ? (
                <p className="text-sm text-gray-500">No hay períodos creados</p>
              ) : (
                <div className="space-y-2">
                  {periodos.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{p.codigo}</p>
                        <p className="text-xs text-gray-500">{p.fecha_desde} — {p.fecha_hasta}</p>
                      </div>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoColors[p.estado] || 'bg-gray-100 text-gray-700')}>
                        {p.estado}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Accesos Rápidos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link href="/honorarios/tarifas" className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors">
                <DollarSign className="w-8 h-8 text-primary-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Tarifas</p>
                  <p className="text-xs text-gray-500">Configurar honorarios por doctor</p>
                </div>
              </Link>
              <Link href="/honorarios/periodos" className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors">
                <Calendar className="w-8 h-8 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Períodos</p>
                  <p className="text-xs text-gray-500">Cerrar períodos y generar liquidaciones</p>
                </div>
              </Link>
              <Link href="/honorarios/liquidaciones" className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors">
                <BarChart3 className="w-8 h-8 text-violet-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Liquidaciones</p>
                  <p className="text-xs text-gray-500">Aprobar y exportar pagos</p>
                </div>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
