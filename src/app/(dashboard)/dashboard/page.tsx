'use client';

import Link from 'next/link';
import {
  Users,
  Calendar,
  CreditCard,
  Package,
  AlertTriangle,
  ArrowRight,
  Clock,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import { doctoresData } from '@/data/doctores';
import { aseguranzasData } from '@/data/config';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import Avatar from '@/components/ui/Avatar';
import ProgressBar from '@/components/ui/ProgressBar';
import BarChart from '@/components/ui/BarChart';
import StatusBadge from '@/components/ui/StatusBadge';

const stats = [
  {
    label: 'Pacientes Totales',
    value: '156',
    icon: Users,
    color: 'text-primary-500',
    bgColor: 'bg-primary-50',
    borderColor: 'border-primary-100',
    trend: '+8%',
  },
  {
    label: 'Consultas de Hoy',
    value: '12',
    icon: Calendar,
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-100',
  },
  {
    label: 'Cobros del Día',
    value: '$24,500',
    icon: CreditCard,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-100',
  },
  {
    label: 'Lentes Bajo Stock',
    value: '45',
    icon: Package,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-100',
  },
];

const citas = [
  { hora: '09:00 AM', paciente: 'Mateo Rodríguez', seguro: 'Seguros Monterrey', doctor: 'Dra. Irina', diagnostico: 'Miopía progresiva', tipo: 'Seguimiento', estado: 'COMPLETADO' },
  { hora: '10:15 AM', paciente: 'Sofía González', seguro: 'Particular', doctor: 'Dra. Irina', diagnostico: 'Estrabismo divergente', tipo: 'Primera Vez', estado: 'EN CURSO' },
  { hora: '11:30 AM', paciente: 'Carlos Mendoza', seguro: 'AXA', doctor: 'Dr. Sánchez', diagnostico: 'Astigmatismo', tipo: 'Graduación', estado: 'PENDIENTE' },
  { hora: '12:00 PM', paciente: 'Lucía Ortiz', seguro: 'MetLife', doctor: 'Dra. Irina', diagnostico: 'Chequeo General', tipo: 'Seguimiento', estado: 'PENDIENTE' },
  { hora: '12:30 PM', paciente: 'Roberto Vega', seguro: 'ISSSTECALI', doctor: 'Dra. Martha', diagnostico: 'Catarata senil', tipo: 'Primera Vez', estado: 'PENDIENTE' },
  { hora: '01:00 PM', paciente: 'Ana Luisa Pérez', seguro: 'GNP', doctor: 'Dr. Bayardo', diagnostico: 'Glaucoma', tipo: 'Seguimiento', estado: 'PENDIENTE' },
];

const inventarioBajo = [
  { nombre: 'Lente de Contacto Acuvue Oasys', detalle: 'Miopía -2.50', stock: 5 },
  { nombre: 'Armazón Infantil Flexible Blue', detalle: 'Color Azul', stock: 2 },
  { nombre: 'Mica Policarbonato Anti-Reflejante', detalle: 'Corte estándar', stock: 8 },
  { nombre: 'Lente Progresivo Zeiss', detalle: 'Crizal Forte UV', stock: 3 },
];

const ingresosSemana = [
  { dia: 'Lun', monto: 18500 },
  { dia: 'Mar', monto: 22000 },
  { dia: 'Mié', monto: 15800 },
  { dia: 'Jue', monto: 28500 },
  { dia: 'Vie', monto: 24500 },
  { dia: 'Sáb', monto: 32000 },
];

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  COMPLETADO: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'EN CURSO': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  PENDIENTE: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
};

const barData = ingresosSemana.map((i) => ({
  label: i.dia,
  value: i.monto,
  displayValue: `$${(i.monto / 1000).toFixed(1)}k`,
}));

const maxSeguroPacientes = Math.max(...aseguranzasData.map((s) => s.pacientes));

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div className="flex items-end justify-between">
        <PageHeader
          title="HOLA, Dra. Irina"
          subtitle="Bienvenida de vuelta a tu panel clínico de hoy."
        />
        <div className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-500 shadow-sm sm:flex">
          <Clock className="h-4 w-4 text-gray-400" />
          <span className="font-medium">04 Septiembre, 2026</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            trend={stat.trend}
            icon={stat.icon}
            color={stat.color}
            bgColor={stat.bgColor}
            borderColor={stat.borderColor}
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Citas de Hoy</h2>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary-100 px-1.5 text-[11px] font-bold text-primary-700">
                {citas.length}
              </span>
            </div>
            <Link href="/consultas" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700">
              Ver agenda completa
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {citas.map((cita) => (
              <div
                key={`${cita.hora}-${cita.paciente}`}
                className="group grid gap-3 px-6 py-4 transition-colors hover:bg-gray-50/60 md:grid-cols-[72px_minmax(160px,1fr)_minmax(140px,0.9fr)_110px_110px] md:items-center"
              >
                <div className="flex items-center gap-2">
                  <span className="hidden h-2 w-2 rounded-full bg-primary-400 md:block" />
                  <span className="text-sm font-extrabold leading-tight text-primary-700">{cita.hora}</span>
                </div>
                <div className="min-w-0">
                  <div className="truncate font-bold text-gray-900 group-hover:text-primary-700 transition-colors">{cita.paciente}</div>
                  <div className="truncate text-[13px] text-gray-400">{cita.seguro}</div>
                </div>
                <div className="min-w-0 md:text-left">
                  <div className="truncate text-[13px] font-medium text-gray-600">{cita.doctor}</div>
                  <div className="truncate text-xs text-gray-400">{cita.diagnostico}</div>
                </div>
                <span className="w-fit rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-center text-xs font-semibold text-gray-500">
                  {cita.tipo}
                </span>
                <StatusBadge status={cita.estado} config={estadoConfig} />
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Inventario Bajo</h2>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-700">
                {inventarioBajo.length}
              </span>
            </div>
            <Link href="/inventario" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700">
              Ver inventario
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-2.5 p-4">
            {inventarioBajo.map((item) => (
              <div
                key={item.nombre}
                className="group rounded-xl border border-amber-100 bg-gradient-to-r from-amber-50/80 to-orange-50/40 p-4 transition-all hover:shadow-sm hover:border-amber-200"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 ring-1 ring-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900 leading-snug">{item.nombre}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.detalle}</div>
                  </div>
                  <span className="whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-xs font-extrabold text-amber-600 ring-1 ring-amber-200 shadow-sm">
                    {item.stock} unidades
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,1fr)]">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Ingresos de la Semana</h2>
            <Link href="/reportes" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700">
              Ver reportes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="p-6">
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gray-900">$141,300</span>
              <span className="text-sm font-semibold text-gray-400">total semana</span>
            </div>
            <BarChart data={barData} color="bg-primary-500" height={160} />
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Doctores Activos</h2>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-sky-100 px-1.5 text-[11px] font-bold text-sky-700">
                {doctoresData.length}
              </span>
            </div>
            <Link href="/configuracion" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700">
              Ver todos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {doctoresData.map((doctor) => (
              <div
                key={doctor.id}
                className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50/60"
              >
                <Avatar initials={doctor.iniciales} className={doctor.color} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-900 group-hover:text-primary-700 transition-colors">{doctor.nombre}</div>
                  <div className="text-xs text-gray-400">{doctor.especialidad}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-extrabold text-gray-900">{doctor.consultas}</div>
                  <div className="text-[11px] text-gray-400">consultas</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">Pacientes por Aseguranza</h2>
          <Link href="/pacientes" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700">
            Ver pacientes
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {aseguranzasData.map((seguro) => (
              <div
                key={seguro.id}
                className="group rounded-xl border border-gray-100 bg-gray-50/50 p-4 text-center transition-all hover:bg-white hover:shadow-sm hover:border-gray-200"
              >
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
                  <ShieldCheck className="h-5 w-5 text-gray-600" />
                </div>
                <div className="text-lg font-extrabold text-gray-900">{seguro.pacientes}</div>
                <div className="mt-0.5 text-xs font-medium text-gray-400 leading-tight">{seguro.nombre}</div>
                <div className="mt-2">
                  <ProgressBar
                    value={seguro.pacientes}
                    maxValue={maxSeguroPacientes}
                    color={seguro.color}
                    height="h-1.5"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
