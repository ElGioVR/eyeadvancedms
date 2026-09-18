'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Users,
  Calendar,
  CreditCard,
  Package,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  TrendingUp,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import Avatar from '@/components/ui/Avatar';
import ProgressBar from '@/components/ui/ProgressBar';
import BarChart from '@/components/ui/BarChart';
import type { DashboardData } from '@/lib/dashboard-data';

interface DashboardContentProps {
  data: DashboardData;
  userNombre: string;
  userIniciales: string;
  userAvatarUrl: string | null;
  userRol: string;
}

const formatCurrency = (value: number): string => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toLocaleString('es-MX')}`;
};

const formatMoneyFull = (value: number): string =>
  `$${value.toLocaleString('es-MX')}`;

export default function DashboardContent({ data, userNombre, userIniciales, userAvatarUrl, userRol }: DashboardContentProps) {
  const router = useRouter();
  const firstName = userNombre.split(' ')[0] || 'Usuario';
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Buenos días' : now.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);
  const [chartData, setChartData] = useState<{
    consultasPorEstatus: Record<string, number>;
    topProcedimientos: { nombre: string; cantidad: number }[];
    agendaOcupacion: { nombre: string; cantidad: number }[];
  } | null>(null);
  const [doctorMetrics, setDoctorMetrics] = useState<{
    servicios: number;
    devengado: number;
    pendiente: number;
    pagado: number;
  } | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/charts')
      .then((r) => r.json())
      .then(setChartData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (userRol !== 'doctor') return;
    fetch('/api/honorarios/metricas/ranking')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const me = data[0];
          setDoctorMetrics({
            servicios: me.servicios || 0,
            devengado: me.devengado || 0,
            pendiente: 0,
            pagado: 0,
          });
        }
      })
      .catch(() => {});
  }, [userRol]);

  const stats = [
    {
      label: 'Pacientes Totales',
      value: data.stats.totalPacientes.toString(),
      icon: Users,
      color: 'text-primary-500',
      bgColor: 'bg-primary-50',
      borderColor: 'border-primary-100',
    },
    {
      label: 'Consultas de Hoy',
      value: data.stats.consultasHoy.toString(),
      icon: Calendar,
      color: 'text-sky-600',
      bgColor: 'bg-sky-50',
      borderColor: 'border-sky-100',
    },
    {
      label: 'Cobros del Día',
      value: formatMoneyFull(data.stats.cobrosDelDia),
      icon: CreditCard,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-100',
    },
    {
      label: 'Lentes Bajo Stock',
      value: data.stats.lentesBajoStock.toString(),
      icon: Package,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-100',
    },
  ];

  const barData = data.ingresosSemana.map((i) => ({
    label: i.dia,
    value: i.monto,
    displayValue: formatCurrency(i.monto),
  }));

  const maxSeguroPacientes = Math.max(...data.aseguranzas.map((s) => s.pacientes), 1);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-6 sm:p-8 shadow-sm">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gray-50 dark:bg-[#202327]" />
        <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-gray-50 dark:bg-[#202327]" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-400 dark:text-[#71767B]">
              {greeting}
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-[#E7E9EA]">
              Hola, {firstName}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-[#71767B]">
              Bienvenido a tu panel clínico. Tienes {data.stats.consultasHoy} consulta{data.stats.consultasHoy !== 1 ? 's' : ''} programada{data.stats.consultasHoy !== 1 ? 's' : ''} para hoy.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {userRol !== 'doctor' && (
              <div className="relative">
                <button
                  onClick={() => setDoctorDropdownOpen(!doctorDropdownOpen)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-2 text-sm font-medium text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors"
                >
                  <Users className="h-4 w-4 text-gray-400 dark:text-[#71767B]" />
                  Ver como
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400 dark:text-[#71767B]" />
                </button>
                {doctorDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDoctorDropdownOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl shadow-lg z-50 overflow-hidden">
                      <div className="px-3 py-2 border-b border-gray-100 dark:border-[#2F3336]">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Filtrar por doctor</p>
                      </div>
                      <div className="p-1">
                        <button
                          onClick={() => { router.push('/dashboard'); setDoctorDropdownOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-[#1D1F23] rounded-lg text-sm font-medium text-gray-700 dark:text-[#E7E9EA] transition-colors"
                        >
                          Todos los doctores
                        </button>
                        {data.doctores.map((doctor) => (
                          <button
                            key={doctor.id}
                            onClick={() => { router.push(`/dashboard?doctor=${doctor.id}`); setDoctorDropdownOpen(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-[#1D1F23] rounded-lg text-sm transition-colors"
                          >
                            <Avatar initials={doctor.iniciales} className="h-6 w-6 text-[10px] bg-sky-500" />
                            <span className="truncate text-gray-700 dark:text-[#E7E9EA]">{doctor.nombre}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <Avatar initials={userIniciales} src={userAvatarUrl} className="h-16 w-16 text-xl" />
          </div>
        </div>
      </div>

      {/* Doctor Honorarios Section */}
      {userRol === 'doctor' && doctorMetrics && (
        <section className="overflow-hidden rounded-2xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
          <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Mis Honorarios</h2>
            <Link href="/mis-honorarios" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-500 hover:text-primary-700">
              Ver todo <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 p-6">
            <div className="rounded-xl bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-bold text-emerald-600">Devengado</span>
              </div>
              <p className="text-xl font-extrabold text-emerald-600">{formatMoneyFull(doctorMetrics.devengado)}</p>
            </div>
            <div className="rounded-xl bg-blue-500/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-bold text-blue-600">Servicios</span>
              </div>
              <p className="text-xl font-extrabold text-blue-600">{doctorMetrics.servicios}</p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            color={stat.color}
            bgColor={stat.bgColor}
            borderColor={stat.borderColor}
          />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Citas de Hoy</h2>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary-100 px-1.5 text-[11px] font-bold text-primary-700">
                {data.citas.length}
              </span>
            </div>
            <Link href="/consultas" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700">
              Ver agenda completa
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-[#2F3336]">
            {data.citas.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-gray-400 dark:text-[#71767B]">Sin citas programadas para hoy</div>
            )}
            {data.citas.map((cita) => (
              <div
                key={cita.id}
                className="group flex items-center gap-3 px-6 py-4 transition-colors hover:bg-gray-50/60 dark:hover:bg-[#1D1F23]/60 md:grid md:grid-cols-[72px_minmax(160px,1fr)_minmax(140px,0.9fr)_110px] md:items-center md:gap-0"
              >
                <div className="flex items-center gap-2 shrink-0">
                  <span className="hidden h-2 w-2 rounded-full bg-primary-400 md:block" />
                  <span className="text-sm font-extrabold leading-tight text-primary-700">{cita.hora}</span>
                </div>
                <div className="flex-1 min-w-0 md:order-none">
                  <div className="truncate font-bold text-gray-900 dark:text-[#E7E9EA] group-hover:text-primary-700 transition-colors">{cita.paciente}</div>
                </div>
                <div className="hidden min-w-0 md:block md:text-left">
                  <div className="truncate text-[13px] font-medium text-gray-600 dark:text-[#E7E9EA]">{cita.doctor}</div>
                  <div className="truncate text-xs text-gray-400 dark:text-[#71767B]">{cita.diagnostico}</div>
                </div>
                <span className="hidden w-fit rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-3 py-1.5 text-center text-xs font-semibold text-gray-500 dark:text-[#71767B] md:block">
                  {cita.tipo}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Inventario Bajo</h2>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-700">
                {data.lentesBajoStock.length}
              </span>
            </div>
            <Link href="/inventario" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700">
              Ver inventario
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-2.5 p-4">
            {data.lentesBajoStock.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-[#71767B]">Todo en orden — sin stock bajo</div>
            )}
            {data.lentesBajoStock.map((item) => (
              <div
                key={item.id}
                className="group rounded-xl border border-amber-100 dark:border-amber-800 bg-gradient-to-r from-amber-50/80 to-orange-50/40 dark:from-amber-900/20 dark:to-orange-900/10 p-4 transition-all hover:shadow-sm hover:border-amber-200 dark:hover:border-amber-700"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 ring-1 ring-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] leading-snug">{item.nombre}</div>
                    <div className="text-xs text-gray-500 dark:text-[#71767B] mt-0.5">{item.detalle}</div>
                  </div>
                  <span className="whitespace-nowrap rounded-lg bg-white dark:bg-[#202327] px-3 py-1.5 text-xs font-extrabold text-amber-600 ring-1 ring-amber-200 shadow-sm">
                    {item.stock} unidades
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,1fr)]">
        <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Ingresos de la Semana</h2>
            <Link href="/reportes" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700">
              Ver reportes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="p-6">
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gray-900 dark:text-[#E7E9EA]">{formatMoneyFull(data.totalIngresosSemana)}</span>
              <span className="text-sm font-semibold text-gray-400 dark:text-[#71767B]">total semana</span>
            </div>
            {barData.length > 0 ? (
              <BarChart data={barData} color="bg-primary-500" height={160} />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-gray-400 dark:text-[#71767B]">Sin datos de ingresos esta semana</div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Doctores Activos</h2>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-sky-100 px-1.5 text-[11px] font-bold text-sky-700">
                {data.doctores.length}
              </span>
            </div>
            <Link href="/configuracion/doctores" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700">
              Ver todos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-[#2F3336]">
            {data.doctores.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-gray-400 dark:text-[#71767B]">Sin doctores registrados</div>
            )}
            {data.doctores.map((doctor) => (
              <div
                key={doctor.id}
                className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50/60 dark:hover:bg-[#1D1F23]/60"
              >
                <Avatar initials={doctor.iniciales} className="bg-sky-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] group-hover:text-primary-700 transition-colors">{doctor.nombre}</div>
                  <div className="text-xs text-gray-400 dark:text-[#71767B]">{doctor.especialidad}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-extrabold text-gray-900 dark:text-[#E7E9EA]">{doctor.consultas}</div>
                  <div className="text-[11px] text-gray-400 dark:text-[#71767B]">consultas</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

        <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Pacientes por Aseguranza</h2>
          <Link href="/pacientes" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700">
            Ver pacientes
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="p-6">
          {data.aseguranzas.length === 0 ? (
            <div className="text-center text-sm text-gray-400 dark:text-[#71767B]">Sin datos de aseguranzas</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {data.aseguranzas.map((seguro) => (
                <div
                  key={seguro.id}
                  className="group rounded-xl border border-gray-100 dark:border-[#2F3336] bg-gray-50/50 dark:bg-[#202327]/50 p-4 text-center transition-all hover:bg-white dark:hover:bg-[#1D1F23] hover:shadow-sm hover:border-gray-200 dark:hover:border-[#536471]"
                >
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-[#202327] shadow-sm ring-1 ring-gray-100 dark:ring-[#2F3336]">
                    <ShieldCheck className="h-5 w-5 text-gray-600 dark:text-[#E7E9EA]" />
                  </div>
                  <div className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA]">{seguro.pacientes}</div>
                  <div className="mt-0.5 text-xs font-medium text-gray-400 dark:text-[#71767B] leading-tight">{seguro.nombre}</div>
                  <div className="mt-2">
                    <ProgressBar
                      value={seguro.pacientes}
                      maxValue={maxSeguroPacientes}
                      color="bg-primary-500"
                      height="h-1.5"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {chartData && (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Consultas por Estatus */}
          <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Consultas (30 días)</h2>
            </div>
            <div className="p-4 space-y-2">
              {Object.entries(chartData.consultasPorEstatus).length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-[#71767B] text-center py-4">Sin datos</p>
              ) : (
                Object.entries(chartData.consultasPorEstatus).map(([estatus, count]) => {
                  const max = Math.max(...Object.values(chartData.consultasPorEstatus), 1);
                  const colors: Record<string, string> = {
                    BORRADOR: 'bg-gray-400', PROCESADA: 'bg-blue-500',
                    PENDIENTE_ESTUDIO: 'bg-amber-500', PENDIENTE_CIRUGIA: 'bg-orange-500',
                    FINALIZADA: 'bg-emerald-500',
                  };
                  return (
                    <div key={estatus} className="flex items-center gap-3">
                      <span className="w-28 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-[#71767B] truncate">{estatus.replace('_', ' ')}</span>
                      <div className="flex-1 h-5 bg-gray-100 dark:bg-[#202327] rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', colors[estatus] || 'bg-gray-400')} style={{ width: `${(count / max) * 100}%` }} />
                      </div>
                      <span className="text-xs font-extrabold text-gray-900 dark:text-[#E7E9EA] w-8 text-right">{count}</span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Top Procedimientos */}
          <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Top Procedimientos</h2>
            </div>
            <div className="p-4 space-y-2">
              {chartData.topProcedimientos.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-[#71767B] text-center py-4">Sin datos</p>
              ) : (
                chartData.topProcedimientos.map((proc, i) => {
                  const max = chartData.topProcedimientos[0]?.cantidad || 1;
                  const colors = ['bg-primary-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500'];
                  return (
                    <div key={proc.nombre} className="flex items-center gap-3">
                      <span className="w-6 text-xs font-extrabold text-gray-400 dark:text-[#71767B]">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] truncate">{proc.nombre}</p>
                        <div className="mt-1 h-2 bg-gray-100 dark:bg-[#202327] rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', colors[i % colors.length])} style={{ width: `${(proc.cantidad / max) * 100}%` }} />
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-gray-900 dark:text-[#E7E9EA]">{proc.cantidad}</span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Ocupación de Agenda */}
          <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Agenda (7 días)</h2>
            </div>
            <div className="p-4 space-y-2">
              {chartData.agendaOcupacion.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-[#71767B] text-center py-4">Sin cirugías programadas</p>
              ) : (
                chartData.agendaOcupacion.map((doc, i) => {
                  const max = chartData.agendaOcupacion[0]?.cantidad || 1;
                  const colors = ['bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-primary-500'];
                  return (
                    <div key={doc.nombre} className="flex items-center gap-3">
                      <span className="w-6 text-xs font-extrabold text-gray-400 dark:text-[#71767B]">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] truncate">{doc.nombre}</p>
                        <div className="mt-1 h-2 bg-gray-100 dark:bg-[#202327] rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', colors[i % colors.length])} style={{ width: `${(doc.cantidad / max) * 100}%` }} />
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-gray-900 dark:text-[#E7E9EA]">{doc.cantidad}</span>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
