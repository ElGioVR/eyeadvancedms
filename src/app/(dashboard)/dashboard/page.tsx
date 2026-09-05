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
} from 'lucide-react';

const stats = [
  {
    label: 'Pacientes Totales',
    value: '156',
    icon: Users,
    color: 'text-primary-500',
    bgColor: 'bg-primary-50',
    borderColor: 'border-primary-100',
    trend: '+8%',
    trendUp: true,
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
    color: 'text-primary-500',
    bgColor: 'bg-primary-50',
    borderColor: 'border-primary-100',
  },
  {
    label: 'Lentes Bajo Stock',
    value: '45',
    icon: Package,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-100',
    alert: true,
  },
];

const citas = [
  {
    hora: '09:00 AM',
    paciente: 'Mateo Rodríguez',
    seguro: 'Seguros Monterrey',
    doctor: 'Dra. Irina',
    diagnostico: 'Miopía progresiva',
    tipo: 'Seguimiento',
    estado: 'COMPLETADO',
  },
  {
    hora: '10:15 AM',
    paciente: 'Sofía González',
    seguro: 'Particular',
    doctor: 'Dra. Irina',
    diagnostico: 'Estrabismo divergente',
    tipo: 'Primera Vez',
    estado: 'EN CURSO',
  },
  {
    hora: '11:30 AM',
    paciente: 'Carlos Mendoza',
    seguro: 'AXA',
    doctor: 'Dr. Sánchez',
    diagnostico: 'Astigmatismo',
    tipo: 'Graduación',
    estado: 'PENDIENTE',
  },
  {
    hora: '12:00 PM',
    paciente: 'Lucía Ortiz',
    seguro: 'MetLife',
    doctor: 'Dra. Irina',
    diagnostico: 'Chequeo General',
    tipo: 'Seguimiento',
    estado: 'PENDIENTE',
  },
];

const inventarioBajo = [
  { nombre: 'Lente de Contacto Acuvue Oasys', detalle: 'Miopía -2.50', stock: 5 },
  { nombre: 'Armazón Infantil Flexible Blue', detalle: 'Color Azul', stock: 2 },
  { nombre: 'Mica Policarbonato Anti-Reflejante', detalle: 'Corte estándar', stock: 8 },
];

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  COMPLETADO: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'EN CURSO': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  PENDIENTE: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-gray-900">
            HOLA, Dra. Irina
          </h1>
          <p className="mt-1 text-[15px] text-gray-400">
            Bienvenida de vuelta a tu panel clínico de hoy.
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-500 shadow-sm sm:flex">
          <Clock className="h-4 w-4 text-gray-400" />
          <span className="font-medium">04 Septiembre, 2026</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide">
                  {stat.label}
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-[32px] font-extrabold leading-none text-gray-900">
                    {stat.value}
                  </span>
                  {stat.trend && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-600 ring-1 ring-emerald-200">
                      <TrendingUp className="h-3 w-3" />
                      {stat.trend}
                    </span>
                  )}
                  {stat.alert && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600 ring-1 ring-amber-200">
                      <AlertTriangle className="h-3 w-3" />
                      Alert
                    </span>
                  )}
                </div>
              </div>
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.bgColor} ring-1 ${stat.borderColor} transition-transform group-hover:scale-110`}
              >
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
            {/* Subtle bottom gradient */}
            <div
              className={`absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r ${
                stat.alert
                  ? 'from-amber-400 to-amber-300'
                  : stat.color.includes('sky')
                    ? 'from-sky-400 to-sky-300'
                    : 'from-primary-400 to-primary-300'
              } opacity-0 transition-opacity group-hover:opacity-100`}
            />
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        {/* Citas de hoy */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">
              Citas de Hoy
            </h2>
            <Link
              href="/consultas"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700"
            >
              Ver agenda completa
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {citas.map((cita, idx) => {
              const estado = estadoConfig[cita.estado];
              return (
                <div
                  key={idx}
                  className="group grid gap-3 px-6 py-4 transition-colors hover:bg-gray-50/60 md:grid-cols-[72px_minmax(160px,1fr)_minmax(140px,0.9fr)_110px_110px] md:items-center"
                >
                  {/* Hora */}
                  <div className="flex items-center gap-2">
                    <span className="hidden h-2 w-2 rounded-full bg-primary-400 md:block" />
                    <span className="text-sm font-extrabold leading-tight text-primary-700">
                      {cita.hora}
                    </span>
                  </div>

                  {/* Paciente */}
                  <div className="min-w-0">
                    <div className="truncate font-bold text-gray-900 group-hover:text-primary-700 transition-colors">
                      {cita.paciente}
                    </div>
                    <div className="truncate text-[13px] text-gray-400">{cita.seguro}</div>
                  </div>

                  {/* Doctor */}
                  <div className="min-w-0 md:text-left">
                    <div className="truncate text-[13px] font-medium text-gray-600">
                      {cita.doctor}
                    </div>
                    <div className="truncate text-xs text-gray-400">{cita.diagnostico}</div>
                  </div>

                  {/* Tipo */}
                  <span className="w-fit rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-center text-xs font-semibold text-gray-500">
                    {cita.tipo}
                  </span>

                  {/* Estado */}
                  <span
                    className={`inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold ${estado.bg} ${estado.text}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${estado.dot}`} />
                    {cita.estado}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Inventario bajo */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">
              Inventario Bajo
            </h2>
            <Link
              href="/inventario"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700"
            >
              Ver inventario
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-2.5 p-4">
            {inventarioBajo.map((item, idx) => (
              <div
                key={idx}
                className="group rounded-xl border border-amber-100 bg-gradient-to-r from-amber-50/80 to-orange-50/40 p-4 transition-all hover:shadow-sm hover:border-amber-200"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 ring-1 ring-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900 leading-snug">
                      {item.nombre}
                    </div>
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
    </div>
  );
}
