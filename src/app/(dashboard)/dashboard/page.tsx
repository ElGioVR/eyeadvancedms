'use client';

import Link from 'next/link';
import { Users, Calendar, CreditCard, Package, AlertTriangle, ArrowRight } from 'lucide-react';

const stats = [
  { label: 'Pacientes Totales', value: '156', icon: Users, color: 'text-primary-500', bgColor: 'bg-primary-50', trend: '+8%' },
  { label: 'Consultas de Hoy', value: '12', icon: Calendar, color: 'text-accent', bgColor: 'bg-cyan-50' },
  { label: 'Cobros del Día', value: '$24,500', icon: CreditCard, color: 'text-primary-500', bgColor: 'bg-primary-50' },
  { label: 'Lentes Bajo Stock', value: '45', icon: Package, color: 'text-warning', bgColor: 'bg-orange-50', alert: true },
];

const citas = [
  { hora: '09:00 AM', paciente: 'Mateo Rodríguez', seguro: 'Seguros Monterrey', doctor: 'Dra. Irina', diagnostico: 'Miopía progresiva', tipo: 'Seguimiento', estado: 'COMPLETADO' },
  { hora: '10:15 AM', paciente: 'Sofía González', seguro: 'Particular', doctor: 'Dra. Irina', diagnostico: 'Estrabismo divergente', tipo: 'Primera Vez', estado: 'EN CURSO' },
  { hora: '11:30 AM', paciente: 'Carlos Mendoza', seguro: 'AXA', doctor: 'Dr. Sánchez', diagnostico: 'Astigmatismo', tipo: 'Graduación', estado: 'PENDIENTE' },
  { hora: '12:00 PM', paciente: 'Lucía Ortiz', seguro: 'MetLife', doctor: 'Dra. Irina', diagnostico: 'Chequeo General', tipo: 'Seguimiento', estado: 'PENDIENTE' },
];

const inventarioBajo = [
  { nombre: 'Lente de Contacto Acuvue Oasys', detalle: 'Miopía -2.50', stock: 5 },
  { nombre: 'Armazón Infantil Flexible Blue', detalle: 'Color Azul', stock: 2 },
  { nombre: 'Mica Policarbonato Anti-Reflejante', detalle: 'Corte estándar', stock: 8 },
];

const estadoColors: Record<string, string> = {
  COMPLETADO: 'bg-emerald-50 text-emerald-700',
  'EN CURSO': 'bg-sky-50 text-sky-700',
  PENDIENTE: 'bg-gray-100 text-gray-600',
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1180px]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-normal text-gray-900">HOLA, Dra. Irina</h1>
        <p className="mt-1 text-sm text-gray-500">Bienvenida de vuelta a tu panel clínico de hoy.</p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm shadow-gray-900/5">
            <div className="mb-3 flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-gray-500">{stat.label}</span>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            <div className="flex min-h-9 items-end gap-2">
              <span className="text-3xl font-extrabold leading-none text-gray-900">{stat.value}</span>
              {stat.trend && (
                <span className="mb-0.5 rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-600">▲ {stat.trend}</span>
              )}
              {stat.alert && (
                <span className="mb-0.5 rounded bg-orange-50 px-2 py-0.5 text-xs font-bold text-warning">Alert</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        {/* Citas de hoy */}
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm shadow-gray-900/5">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-extrabold text-gray-900">CITAS DE HOY</h2>
            <Link href="/consultas" className="inline-flex items-center gap-1 text-sm font-bold text-primary-500 hover:text-primary-700">
              Ver agenda completa <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {citas.map((cita, idx) => (
              <div key={idx} className="grid gap-3 px-4 py-4 transition-colors hover:bg-gray-50 md:grid-cols-[68px_minmax(150px,1fr)_minmax(130px,0.9fr)_120px_106px] md:items-center">
                <div className="text-sm font-extrabold leading-tight text-primary-700">{cita.hora}</div>
                <div className="min-w-0">
                  <div className="truncate font-bold text-gray-900">{cita.paciente}</div>
                  <div className="truncate text-sm text-gray-500">{cita.seguro}</div>
                </div>
                <div className="min-w-0 md:text-left">
                  <div className="truncate text-sm font-medium text-gray-700">{cita.doctor}</div>
                  <div className="truncate text-xs text-gray-400">{cita.diagnostico}</div>
                </div>
                <span className="rounded-md bg-gray-50 px-3 py-1.5 text-center text-xs font-medium text-gray-600">{cita.tipo}</span>
                <span className={`rounded-md px-3 py-1.5 text-center text-xs font-extrabold ${estadoColors[cita.estado]}`}>
                  {cita.estado}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Inventario bajo */}
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm shadow-gray-900/5">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-extrabold text-gray-900">INVENTARIO BAJO</h2>
            <Link href="/inventario" className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-bold text-primary-500 hover:text-primary-700">
              Ver inventario <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-3 p-4">
            {inventarioBajo.map((item, idx) => (
              <div key={idx} className="rounded-lg bg-orange-50/80 p-4 transition-colors hover:bg-orange-50">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                  <div className="flex-1">
                    <div className="text-sm font-bold leading-snug text-gray-900">{item.nombre}</div>
                    <div className="text-xs text-gray-500">{item.detalle}</div>
                  </div>
                  <span className="whitespace-nowrap rounded-md bg-white px-2.5 py-1 text-xs font-extrabold text-warning">
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
