'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, DollarSign, BarChart3, Calendar, Download,
  CheckCircle2, Clock, TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { useUser } from '@/hooks/useUser';

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

interface Tarifa {
  id: string;
  origen_tipo: string;
  concepto: string;
  porcentaje: number;
  activo: boolean;
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

type TabKey = 'eventos' | 'pendientes' | 'pagados' | 'tarifas';

export default function DoctorHonorariosPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const [doctor, setDoctor] = useState<DoctorInfo | null>(null);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [eventos, setEventos] = useState<EventoFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('eventos');
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [editingTarifa, setEditingTarifa] = useState<string | null>(null);
  const [tarifaPct, setTarifaPct] = useState('');

  const isDoctorJefe = user?.rol === 'admin';

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

  const fetchTarifas = useCallback(async () => {
    try {
      const res = await fetch(`/api/honorarios/tarifas?doctor_id=${id}`);
      if (res.ok) setTarifas(await res.json());
    } catch { /* silent */ }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (activeTab === 'tarifas') fetchTarifas(); }, [activeTab, fetchTarifas]);

  async function saveTarifa(tarifaId: string) {
    const pct = parseFloat(tarifaPct);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    try {
      await fetch('/api/honorarios/tarifas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctor_id: id, porcentaje: pct, concepto: tarifas.find(t => t.id === tarifaId)?.concepto, origen_tipo: tarifas.find(t => t.id === tarifaId)?.origen_tipo }),
      });
      setEditingTarifa(null);
      fetchTarifas();
    } catch { /* silent */ }
  }

  function exportCSV(data: EventoFila[], filename: string) {
    if (data.length === 0) return;
    const header = 'Fecha,Paciente,Concepto,Rol,Monto,Estado\n';
    const rows = data.map(e => `"${e.fecha_servicio}","${e.paciente_nombre || ''}","${e.origen_tipo}","${e.rol}",${e.monto_devengado},"${e.estado}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const tabs: { key: TabKey; label: string; icon: typeof Clock }[] = [
    { key: 'eventos', label: 'Todos los Eventos', icon: BarChart3 },
    { key: 'pendientes', label: 'Pendientes', icon: Clock },
    { key: 'pagados', label: 'Pagados', icon: CheckCircle2 },
    { key: 'tarifas', label: 'Tarifas', icon: DollarSign },
  ];

  const eventosPendientes = eventos.filter(e => e.estado === 'PENDIENTE' || e.estado === 'DEVENGADO');
  const eventosPagados = eventos.filter(e => e.estado === 'LIQUIDADO');
  const devengadoPendiente = eventosPendientes.reduce((s, e) => s + e.monto_devengado, 0);
  const devengadoPagado = eventosPagados.reduce((s, e) => s + e.monto_devengado, 0);
  const gananciaClinica = (kpis?.ingreso_generado || 0) - (kpis?.honorario_devengado || 0);

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
            <button
              onClick={() => exportCSV(eventos, `honorarios-${doctor?.nombre?.replace(/\s+/g, '-') || id}-${new Date().toISOString().slice(0,7)}.csv`)}
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] text-gray-700 dark:text-[#E7E9EA] rounded-lg hover:bg-gray-50 dark:hover:bg-[#1D1F23] text-sm"
            >
              <Download className="w-4 h-4" /> CSV del Doctor
            </button>
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
            <StatCard icon={Clock} label="Pendiente" value={fmtMoney(devengadoPendiente)} color="text-amber-600" bgColor="bg-amber-50" />
            <StatCard icon={TrendingUp} label="Ganancia Clínica" value={fmtMoney(gananciaClinica)} color="text-violet-600" bgColor="bg-violet-50" />
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-[#2F3336]">
            <div className="flex gap-0 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setPage(1); }}
                    className={cn(
                      'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                      activeTab === tab.key
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    )}
                  >
                    <Icon className="w-4 h-4" /> {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content: Tarifas */}
          {activeTab === 'tarifas' && (
            <div className="bg-white dark:bg-[#16181C] rounded-xl border border-gray-200 dark:border-[#2F3336] p-6">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA] mb-4">Tarifas porcentaje</h3>
              {tarifas.length === 0 ? (
                <p className="text-sm text-gray-400">Sin tarifas configuradas</p>
              ) : (
                <div className="space-y-3">
                  {tarifas.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-[#2F3336] last:border-0">
                      <div>
                        <span className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{t.concepto || t.origen_tipo}</span>
                        <span className="ml-2 text-xs text-gray-400">{t.origen_tipo}</span>
                      </div>
                      {editingTarifa === t.id ? (
                        <div className="flex items-center gap-2">
                          <input type="number" value={tarifaPct} onChange={(e) => setTarifaPct(e.target.value)} className="w-20 text-sm border border-gray-300 dark:border-[#2F3336] rounded px-2 py-1" min="0" max="100" />
                          <span className="text-xs text-gray-400">%</span>
                          <button onClick={() => saveTarifa(t.id)} className="text-xs font-bold text-primary-600 hover:text-primary-700">Guardar</button>
                          <button onClick={() => setEditingTarifa(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]">{t.porcentaje}%</span>
                          {isDoctorJefe && (
                            <button onClick={() => { setEditingTarifa(t.id); setTarifaPct(String(t.porcentaje)); }} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Editar</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab content: Event list */}
          {activeTab !== 'tarifas' && (
            <div className="bg-white dark:bg-[#16181C] rounded-xl border border-gray-200 dark:border-[#2F3336]">
              <div className="p-4 border-b border-gray-200 dark:border-[#2F3336] flex flex-wrap gap-3">
                <select value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value); setPage(1); }} className="text-sm border border-gray-300 dark:border-[#2F3336] rounded-lg px-3 py-1.5 bg-white dark:bg-[#16181C]">
                  <option value="">Todos los tipos</option>
                  <option value="CONSULTA">Consulta</option>
                  <option value="ESTUDIO">Estudio</option>
                  <option value="PROCEDIMIENTO">Procedimiento</option>
                  <option value="OPERACION">Operación</option>
                </select>
                <select value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value); setPage(1); }} className="text-sm border border-gray-300 dark:border-[#2F3336] rounded-lg px-3 py-1.5 bg-white dark:bg-[#16181C]">
                  <option value="">Todos los estados</option>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="DEVENGADO">Devengado</option>
                  <option value="LIQUIDADO">Liquidado</option>
                  <option value="REVERSADO">Reversado</option>
                </select>
              </div>

              {eventos.length === 0 ? (
                <div className="p-8">
                  <EmptyState icon={DollarSign} title="Sin eventos de honorarios" description="Los eventos se generan automáticamente al crear consultas y cirugías." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-[#202327] text-left text-xs text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Paciente</th>
                        <th className="px-4 py-3">Concepto</th>
                        <th className="px-4 py-3">Rol</th>
                        <th className="px-4 py-3 text-right">Monto</th>
                        <th className="px-4 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-[#2F3336]">
                      {eventos.map((ev) => (
                        <tr key={ev.id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23]">
                          <td className="px-4 py-3 text-gray-900 dark:text-[#E7E9EA]">{ev.fecha_servicio}</td>
                          <td className="px-4 py-3 text-gray-700 dark:text-[#E7E9EA]">{ev.paciente_nombre || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-[#202327] text-gray-700 dark:text-[#E7E9EA]">{ev.origen_tipo}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-[#71767B]">{ev.rol}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-[#E7E9EA]">{fmtMoney(ev.monto_devengado)}</td>
                          <td className="px-4 py-3">
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoBadge[ev.estado] || 'bg-gray-100 text-gray-700')}>{ev.estado}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {total > 20 && (
                <div className="p-4 border-t border-gray-200 dark:border-[#2F3336] flex items-center justify-between">
                  <span className="text-sm text-gray-500">{total} eventos totales</span>
                  <div className="flex gap-2">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50">Anterior</button>
                    <span className="px-3 py-1 text-sm text-gray-600">Página {page}</span>
                    <button onClick={() => setPage((p) => p + 1)} disabled={eventos.length < 20} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50">Siguiente</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
