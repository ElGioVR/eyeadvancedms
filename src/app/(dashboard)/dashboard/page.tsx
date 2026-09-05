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
  Stethoscope,
  Activity,
  DollarSign,
  Eye,
  ShieldCheck,
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
  {
    hora: '12:30 PM',
    paciente: 'Roberto Vega',
    seguro: 'ISSSTECALI',
    doctor: 'Dra. Martha',
    diagnostico: 'Catarata senil',
    tipo: 'Primera Vez',
    estado: 'PENDIENTE',
  },
  {
    hora: '01:00 PM',
    paciente: 'Ana Luisa Pérez',
    seguro: 'GNP',
    doctor: 'Dr. Bayardo',
    diagnostico: 'Glaucoma',
    tipo: 'Seguimiento',
    estado: 'PENDIENTE',
  },
];

const inventarioBajo = [
  { nombre: 'Lente de Contacto Acuvue Oasys', detalle: 'Miopía -2.50', stock: 5, categoria: 'Lente de Contacto' },
  { nombre: 'Armazón Infantil Flexible Blue', detalle: 'Color Azul', stock: 2, categoria: 'Armazón' },
  { nombre: 'Mica Policarbonato Anti-Reflejante', detalle: 'Corte estándar', stock: 8, categoria: 'Mica' },
  { nombre: 'Lente Progresivo Zeiss', detalle: 'Crizal Forte UV', stock: 3, categoria: 'Lente Progresivo' },
];

const doctoresActivos = [
  { nombre: 'Dra. Irina', especialidad: 'Oftalmóloga Pediatra', consultas: 5, avatar: 'DI', color: 'bg-primary-500' },
  { nombre: 'Dr. Bayardo', especialidad: 'Oftalmólogo General', consultas: 4, avatar: 'DB', color: 'bg-sky-500' },
  { nombre: 'Dra. Martha', especialidad: 'Especialista en Cataratas', consultas: 3, avatar: 'DM', color: 'bg-emerald-500' },
  { nombre: 'Dra. Sadia', especialidad: 'Glaucoma y Retina', consultas: 2, avatar: 'DS', color: 'bg-amber-500' },
];

const ingresosSemana = [
  { dia: 'Lun', monto: 18500 },
  { dia: 'Mar', monto: 22000 },
  { dia: 'Mié', monto: 15800 },
  { dia: 'Jue', monto: 28500 },
  { dia: 'Vie', monto: 24500 },
  { dia: 'Sáb', monto: 32000 },
];

const maxIngreso = Math.max(...ingresosSemana.map((i) => i.monto));

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  COMPLETADO: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'EN CURSO': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  PENDIENTE: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
};

const segurosData = [
  { nombre: 'ISSSTECALI', pacientes: 42, color: 'bg-blue-500' },
  { nombre: 'Particular', pacientes: 35, color: 'bg-emerald-500' },
  { nombre: 'GNP', pacientes: 28, color: 'bg-sky-500' },
  { nombre: 'AXA', pacientes: 22, color: 'bg-amber-500' },
  { nombre: 'MetLife', pacientes: 18, color: 'bg-purple-500' },
  { nombre: 'Seguros Monterrey', pacientes: 11, color: 'bg-rose-500' },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
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
            <div
              className={`absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r ${
                stat.alert
                  ? 'from-amber-400 to-amber-300'
                  : stat.color.includes('sky')
                    ? 'from-sky-400 to-sky-300'
                    : stat.color.includes('emerald')
                      ? 'from-emerald-400 to-emerald-300'
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
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">
                Citas de Hoy
              </h2>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary-100 px-1.5 text-[11px] font-bold text-primary-700">
                {citas.length}
              </span>
            </div>
            <Link
              href="/consultas"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700"
            >
              Ver agenda completa
              <ArrowRight className="h-4 w-4" />
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
                  <div className="flex items-center gap-2">
                    <span className="hidden h-2 w-2 rounded-full bg-primary-400 md:block" />
                    <span className="text-sm font-extrabold leading-tight text-primary-700">
                      {cita.hora}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-gray-900 group-hover:text-primary-700 transition-colors">
                      {cita.paciente}
                    </div>
                    <div className="truncate text-[13px] text-gray-400">{cita.seguro}</div>
                  </div>
                  <div className="min-w-0 md:text-left">
                    <div className="truncate text-[13px] font-medium text-gray-600">
                      {cita.doctor}
                    </div>
                    <div className="truncate text-xs text-gray-400">{cita.diagnostico}</div>
                  </div>
                  <span className="w-fit rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-center text-xs font-semibold text-gray-500">
                    {cita.tipo}
                  </span>
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
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">
                Inventario Bajo
              </h2>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-700">
                {inventarioBajo.length}
              </span>
            </div>
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

      {/* Row 3: Gráfica de ingresos + Doctores activos */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,1fr)]">
        {/* Ingresos de la semana */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">
                Ingresos de la Semana
              </h2>
            </div>
            <Link
              href="/reportes"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700"
            >
              Ver reportes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="p-6">
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gray-900">$141,300</span>
              <span className="text-sm font-semibold text-gray-400">total semana</span>
            </div>
            <div className="flex items-end gap-3 h-40">
              {ingresosSemana.map((item, idx) => {
                const height = (item.monto / maxIngreso) * 100;
                const isMax = item.monto === maxIngreso;
                return (
                  <div key={idx} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-xs font-bold text-gray-500">
                      ${((item.monto) / 1000).toFixed(1)}k
                    </span>
                    <div className="relative w-full flex justify-center">
                      <div
                        className={`w-full max-w-[40px] rounded-lg transition-all duration-500 hover:opacity-80 ${
                          isMax
                            ? 'bg-gradient-to-t from-primary-600 to-primary-400'
                            : 'bg-gradient-to-t from-primary-200 to-primary-100'
                        }`}
                        style={{ height: `${height * 1.2}px` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold ${isMax ? 'text-primary-700' : 'text-gray-400'}`}>
                      {item.dia}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Doctores activos */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">
                Doctores Activos
              </h2>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-sky-100 px-1.5 text-[11px] font-bold text-sky-700">
                {doctoresActivos.length}
              </span>
            </div>
            <Link
              href="/configuracion"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700"
            >
              Ver todos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {doctoresActivos.map((doctor, idx) => (
              <div
                key={idx}
                className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50/60"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${doctor.color} text-sm font-bold text-white shadow-sm`}
                >
                  {doctor.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-900 group-hover:text-primary-700 transition-colors">
                    {doctor.nombre}
                  </div>
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

      {/* Row 4: Aseguranzas distribution */}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">
              Pacientes por Aseguranza
            </h2>
          </div>
          <Link
            href="/pacientes"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-500 transition-colors hover:text-primary-700"
          >
            Ver pacientes
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {segurosData.map((seguro, idx) => (
              <div
                key={idx}
                className="group rounded-xl border border-gray-100 bg-gray-50/50 p-4 text-center transition-all hover:bg-white hover:shadow-sm hover:border-gray-200"
              >
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100">
                  <ShieldCheck className="h-5 w-5 text-gray-600" />
                </div>
                <div className="text-lg font-extrabold text-gray-900">{seguro.pacientes}</div>
                <div className="mt-0.5 text-xs font-medium text-gray-400 leading-tight">{seguro.nombre}</div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${seguro.color} transition-all duration-700`}
                    style={{ width: `${(seguro.pacientes / 42) * 100}%` }}
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
