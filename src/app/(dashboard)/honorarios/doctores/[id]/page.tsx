'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, DollarSign, BarChart3, Calendar, Download,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';

interface KPIs {
  servicios_ejecutados: number;
  ingreso_generado: number;
  honorario_devengado: number;
  ticket_promedio: number;
  consultas_totales: number;
  cancelaciones: number;
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

interface DoctorInfo {
  id: string;
  nombre: string;
  especialidad: string;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

const estadoBadge: Record<string, string> = {
  DEVENGADO: 'bg-emerald-100 text-emerald-700',
  PENDIENTE: 'bg-amber-100 text-amber-700',
  REVERSADO: 'bg-red-100 text-red-700',
  LIQUIDADO: 'bg-purple-100 text-purple-700',
};

export default function DoctorHonorariosPage() {
  const { id } = useParams<{ id: string }>();
  const [doctor, setDoctor] = useState<DoctorInfo | null>(null);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [eventos, setEventos] = useState<EventoFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filtroTipo) qs.set('tipo_concepto', filtroTipo);
      if (filtroEstado) qs.set('estado', filtroEstado);
      qs.set('page', String(page));
      qs.set('pageSize', '20');

      const [metricasRes, eventosRes] = await Promise.all([
        fetch(`/api/honorarios/doctores/${id}/metricas?${qs.toString()}`),
        fetch(`/api/honorarios/doctores/${id}/eventos?${qs.toString()}`),
      ]);

      if (metricasRes.ok) {
        const data = await metricasRes.json();
        setDoctor(data.doctor);
        setKpis(data.kpis);
      }

      if (eventosRes.ok) {
        const data = await eventosRes.json();
        setEventos(data.data);
        setTotal(data.total);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [id, page, filtroTipo, filtroEstado]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/honorarios" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <PageHeader
          title={loading ? 'Cargando...' : `Honorarios — ${doctor?.nombre || ''}`}
          subtitle={doctor?.especialidad || ''}
          action={
            <a
              href={`/api/honorarios/doctores/${id}/eventos?pageSize=9999`}
              className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
            >
              <Download className="w-4 h-4" />
              Exportar
            </a>
          }
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : kpis ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={BarChart3} label="Servicios" value={String(kpis.servicios_ejecutados)} color="text-blue-600" bgColor="bg-blue-50" />
            <StatCard icon={DollarSign} label="Devengado" value={fmtMoney(kpis.honorario_devengado)} color="text-emerald-600" bgColor="bg-emerald-50" />
            <StatCard icon={DollarSign} label="Ticket Promedio" value={fmtMoney(kpis.ticket_promedio)} color="text-violet-600" bgColor="bg-violet-50" />
            <StatCard icon={Calendar} label="Consultas" value={String(kpis.consultas_totales)} color="text-amber-600" bgColor="bg-amber-50" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex flex-wrap gap-3">
              <select
                value={filtroTipo}
                onChange={(e) => { setFiltroTipo(e.target.value); setPage(1); }}
                className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
              >
                <option value="">Todos los tipos</option>
                <option value="CONSULTA">Consulta</option>
                <option value="ESTUDIO">Estudio</option>
                <option value="PROCEDIMIENTO">Procedimiento</option>
                <option value="OPERACION">Operación</option>
              </select>
              <select
                value={filtroEstado}
                onChange={(e) => { setFiltroEstado(e.target.value); setPage(1); }}
                className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
              >
                <option value="">Todos los estados</option>
                <option value="DEVENGADO">Devengado</option>
                <option value="LIQUIDADO">Liquidado</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="REVERSADO">Reversado</option>
              </select>
            </div>

            {eventos.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={DollarSign}
                  title="Sin eventos de honorarios"
                  description="Los eventos se generan automáticamente al crear consultas y cirugías con conceptos normalizados."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Paciente</th>
                      <th className="px-4 py-3">Concepto</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3 text-right">Monto</th>
                      <th className="px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {eventos.map((ev) => (
                      <tr key={ev.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900">{ev.fecha_servicio}</td>
                        <td className="px-4 py-3 text-gray-700">{ev.paciente_nombre || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                            {ev.origen_tipo}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{ev.rol}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtMoney(ev.monto_devengado)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoBadge[ev.estado] || 'bg-gray-100 text-gray-700')}>
                            {ev.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {total > 20 && (
              <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                <span className="text-sm text-gray-500">{total} eventos totales</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-600">Página {page}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={eventos.length < 20}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
