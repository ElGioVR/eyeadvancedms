'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Users, DollarSign, TrendingUp, Award, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import FiltrosReporte from '@/components/honorarios/FiltrosReporte';
import { formatCurrency } from '@/lib/money';

interface ReporteGlobalFila {
  doctor_id: string;
  doctor_nombre: string;
  especialidad: string;
  num_consultas: number;
  total_cobrado: number;
  total_honorarios: number;
  pagado: number;
  pendiente: number;
  porcentaje_participacion: number;
}

interface ReporteGlobal {
  doctores: ReporteGlobalFila[];
  totales: {
    total_cobrado: number;
    total_honorarios: number;
    pagado: number;
    pendiente: number;
    num_doctores: number;
  };
}

interface Doctor {
  id: string;
  nombre_completo: string;
  nombre?: string;
}

export default function ReportesHonorariosPage() {
  const router = useRouter();
  const [reporte, setReporte] = useState<ReporteGlobal | null>(null);
  const [doctores, setDoctores] = useState<Array<{ id: string; nombre: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState<{ fecha_desde?: string; fecha_hasta?: string }>({});

  const fetchData = useCallback(async (f: { fecha_desde?: string; fecha_hasta?: string }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.fecha_desde) params.set('fecha_desde', f.fecha_desde);
      if (f.fecha_hasta) params.set('fecha_hasta', f.fecha_hasta);

      const [reporteRes, doctoresRes] = await Promise.all([
        fetch(`/api/honorarios/reportes?${params}`),
        fetch('/api/configuracion/doctores'),
      ]);

      if (reporteRes.ok) setReporte(await reporteRes.json());
      if (doctoresRes.ok) {
        const docs: Doctor[] = await doctoresRes.json();
        setDoctores(docs.map((d) => ({ id: d.id, nombre: d.nombre_completo })));
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const lastDayStr = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    const defaultFiltros = { fecha_desde: firstDay, fecha_hasta: lastDayStr };
    setFiltros(defaultFiltros);
    fetchData(defaultFiltros);
  }, [fetchData]);

  const handleFilter = useCallback((f: { fecha_desde?: string; fecha_hasta?: string }) => {
    setFiltros(f);
    fetchData(f);
  }, [fetchData]);

  const totals = reporte?.totales;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reporte de Honorarios"
        subtitle="Vista global de honorarios por doctor"
      />

      <FiltrosReporte onFilter={handleFilter} showDoctor doctores={doctores} loading={loading} />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : totals ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Doctores" value={String(totals.num_doctores)} color="text-blue-600" bgColor="bg-blue-50" />
            <StatCard icon={DollarSign} label="Total Cobrado" value={formatCurrency(totals.total_cobrado)} color="text-emerald-600" bgColor="bg-emerald-50" />
            <StatCard icon={Award} label="Total Honorarios" value={formatCurrency(totals.total_honorarios)} color="text-primary-600" bgColor="bg-primary-50" />
            <StatCard icon={TrendingUp} label="Pendiente" value={formatCurrency(totals.pendiente)} color="text-amber-600" bgColor="bg-amber-50" />
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-[#2F3336]">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Desglose por Doctor</h3>
            </div>
            {reporte!.doctores.length === 0 ? (
              <EmptyState icon={Users} title="Sin movimientos" description="No hay honorarios en el rango seleccionado" />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#202327]/50">
                    <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Doctor</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Consultas</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Cobrado</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Honorarios</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Pagado</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Pendiente</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">% Part.</th>
                    <th className="px-6 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                  {reporte!.doctores.map((d) => (
                    <tr key={d.doctor_id} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23] cursor-pointer transition-colors"
                      onClick={() => router.push(`/honorarios/reportes/doctor/${d.doctor_id}?fecha_desde=${filtros.fecha_desde || ''}&fecha_hasta=${filtros.fecha_hasta || ''}`)}>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{d.doctor_nombre}</div>
                        <div className="text-xs text-gray-400">{d.especialidad}</div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-gray-600 dark:text-[#71767B]">{d.num_consultas}</td>
                      <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-[#E7E9EA]">{formatCurrency(d.total_cobrado)}</td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-primary-600">{formatCurrency(d.total_honorarios)}</td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-emerald-600">{formatCurrency(d.pagado)}</td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-amber-600">{formatCurrency(d.pendiente)}</td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-gray-500">{d.porcentaje_participacion.toFixed(1)}%</td>
                      <td className="px-6 py-4"><ChevronRight className="h-4 w-4 text-gray-300" /></td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 dark:bg-[#202327]/80 font-bold">
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-[#E7E9EA]">TOTALES</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-[#E7E9EA]">{reporte!.doctores.reduce((s, d) => s + d.num_consultas, 0)}</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-[#E7E9EA]">{formatCurrency(totals.total_cobrado)}</td>
                    <td className="px-6 py-4 text-right text-sm text-primary-600">{formatCurrency(totals.total_honorarios)}</td>
                    <td className="px-6 py-4 text-right text-sm text-emerald-600">{formatCurrency(totals.pagado)}</td>
                    <td className="px-6 py-4 text-right text-sm text-amber-600">{formatCurrency(totals.pendiente)}</td>
                    <td className="px-6 py-4"></td>
                    <td className="px-6 py-4"></td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <EmptyState icon={DollarSign} title="Sin datos" description="No se pudieron cargar los reportes" />
      )}
    </div>
  );
}
