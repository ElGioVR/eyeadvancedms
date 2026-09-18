'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, DollarSign, Calendar, TrendingUp, FileText } from 'lucide-react';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import FiltrosReporte from '@/components/honorarios/FiltrosReporte';
import { formatCurrency } from '@/lib/money';

interface ReporteDoctorFila {
  fecha: string;
  folio: string | null;
  paciente: string;
  tipo_concepto: string;
  aseguranza: string | null;
  metodo_pago: string | null;
  moneda: string;
  monto_cobrado: number;
  base_calculo: number;
  tarifa_aplicada: number;
  honorario_doctor: number;
  estado_pago: string;
}

interface ReporteDoctorTotales {
  num_consultas: number;
  total_cobrado: number;
  total_honorarios: number;
  pagado: number;
  pendiente: number;
}

interface ReporteDoctor {
  doctor_nombre: string;
  detalles: ReporteDoctorFila[];
  totales: ReporteDoctorTotales;
}

interface HistoricoPunto {
  fecha: string;
  honorarios: number;
  servicios: number;
}

export default function ReporteDoctorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const doctorId = params.id as string;

  const [reporte, setReporte] = useState<ReporteDoctor | null>(null);
  const [historico, setHistorico] = useState<HistoricoPunto[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const ROWS_PER_PAGE = 15;

  const fetchData = useCallback(async (filtros: { fecha_desde?: string; fecha_hasta?: string }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.fecha_desde) params.set('fecha_desde', filtros.fecha_desde);
      if (filtros.fecha_hasta) params.set('fecha_hasta', filtros.fecha_hasta);

      const [reporteRes, historicoRes] = await Promise.all([
        fetch(`/api/honorarios/reportes/doctor/${doctorId}?${params}`),
        fetch(`/api/honorarios/reportes/historico?doctor_id=${doctorId}&granularidad=mes&meses=12`),
      ]);

      if (reporteRes.ok) setReporte(await reporteRes.json());
      if (historicoRes.ok) {
        const hist = await historicoRes.json();
        setHistorico(hist.serie || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    const fd = searchParams.get('fecha_desde') || undefined;
    const fh = searchParams.get('fecha_hasta') || undefined;
    fetchData({ fecha_desde: fd, fecha_hasta: fh });
  }, [searchParams, fetchData]);

  const handleFilter = useCallback((f: { fecha_desde?: string; fecha_hasta?: string }) => {
    setPage(1);
    fetchData(f);
  }, [fetchData]);

  const paginated = reporte?.detalles.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE) || [];
  const totalPages = Math.ceil((reporte?.detalles.length || 0) / ROWS_PER_PAGE);
  const totales = reporte?.totales;

  const maxHistorico = historico.length > 0 ? Math.max(...historico.map((h) => h.honorarios)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Reporte: ${reporte?.doctor_nombre || 'Doctor'}`}
        subtitle="Detalle de honorarios por rango de fechas"
        backLink={{ href: '/honorarios/reportes', label: 'Reportes' }}
        action={
          <Link href={`/honorarios/doctores/${doctorId}`} className="inline-flex items-center gap-2 text-sm font-bold text-primary-600 hover:text-primary-800">
            Ver perfil completo
          </Link>
        }
      />

      <FiltrosReporte onFilter={handleFilter} />

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : totales ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={FileText} label="Consultas" value={String(totales.num_consultas)} color="text-blue-600" bgColor="bg-blue-50" />
            <StatCard icon={DollarSign} label="Total Cobrado" value={formatCurrency(totales.total_cobrado)} color="text-emerald-600" bgColor="bg-emerald-50" />
            <StatCard icon={TrendingUp} label="Honorarios" value={formatCurrency(totales.total_honorarios)} color="text-primary-600" bgColor="bg-primary-50" />
            <StatCard icon={Calendar} label="Pendiente" value={formatCurrency(totales.pendiente)} color="text-amber-600" bgColor="bg-amber-50" />
          </div>

          {historico.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-6">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA] mb-4">Evolución Mensual</h3>
              <div className="flex items-end gap-1 h-32">
                {historico.map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-primary-500 rounded-t" style={{ height: `${(h.honorarios / maxHistorico) * 100}%`, minHeight: 2 }} />
                    <span className="text-[9px] text-gray-400 truncate w-full text-center">{h.fecha.substring(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-[#2F3336]">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">
                Detalle ({reporte!.detalles.length} registros)
              </h3>
            </div>
            {paginated.length === 0 ? (
              <EmptyState icon={FileText} title="Sin movimientos" description="No hay registros en el rango seleccionado" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-[#202327]/50">
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Fecha</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Paciente</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Tipo</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Folio</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Método</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Cobrado</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Base</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Honorario</th>
                        <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-[#2F3336]">
                      {paginated.map((fila, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-[#E7E9EA] whitespace-nowrap">{fila.fecha}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">{fila.paciente}</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#202327] text-gray-600 dark:text-[#71767B]">
                              {fila.tipo_concepto}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 font-mono">{folioText(fila.folio)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-[#71767B]">{fila.metodo_pago || '-'}</td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-[#E7E9EA]">{formatCurrency(fila.monto_cobrado)}</td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-[#71767B]">{formatCurrency(fila.base_calculo)}</td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-primary-600">{formatCurrency(fila.honorario_doctor)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              fila.estado_pago === 'PAGADO' ? 'bg-emerald-100 text-emerald-700' :
                              fila.estado_pago === 'PENDIENTE' ? 'bg-amber-100 text-amber-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {fila.estado_pago}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 dark:bg-[#202327]/80 font-bold">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-[#E7E9EA]" colSpan={5}>TOTALES</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-[#E7E9EA]">{formatCurrency(totales.total_cobrado)}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-[#E7E9EA]"></td>
                        <td className="px-4 py-3 text-right text-sm text-primary-600">{formatCurrency(totales.total_honorarios)}</td>
                        <td className="px-4 py-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="px-6 py-3 border-t border-gray-100 dark:border-[#2F3336] flex items-center justify-between text-sm">
                    <span className="text-gray-400">
                      Página {page} de {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                        className="px-3 py-1 rounded-lg border border-gray-200 dark:border-[#2F3336] text-xs font-bold disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-[#202327]">
                        Anterior
                      </button>
                      <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        className="px-3 py-1 rounded-lg border border-gray-200 dark:border-[#2F3336] text-xs font-bold disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-[#202327]">
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <EmptyState icon={DollarSign} title="Sin datos" description="No se pudieron cargar los reportes" />
      )}
    </div>
  );
}

function folioText(folio: string | null): string {
  return folio || '-';
}
