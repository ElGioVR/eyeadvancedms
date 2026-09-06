'use client';

import { useState } from 'react';
import {
  TrendingUp,
  Users,
  Calendar,
  DollarSign,
  Activity,
  Download,
  FileText,
  ChevronDown,
  Eye,
  Stethoscope,
  Package,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = ['Resumen', 'Pacientes', 'Consultas', 'Financiero', 'Inventario'];

const periodoOptions = ['Este Mes (Septiembre 2026)', 'Últimos 3 Meses', 'Últimos 6 Meses', 'Este Año', 'Todo'];

const resumenStats = [
  { label: 'Pacientes Totales', value: '156', trend: '+8%', icon: Users, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
  { label: 'Consultas del Mes', value: '42', trend: '+12%', icon: Calendar, color: 'text-sky-600', bgColor: 'bg-sky-50', borderColor: 'border-sky-100' },
  { label: 'Ingresos del Mes', value: '$141,300', trend: '+21%', icon: DollarSign, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-100' },
  { label: 'Lentes en Stock', value: '31', trend: '-3', icon: Package, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-100' },
];

const resumenActividad = [
  { hora: '09:00', paciente: 'Mateo Rodríguez', tipo: 'Seguimiento', doctor: 'Dra. Irina', estado: 'Completada' },
  { hora: '09:45', paciente: 'Sofía González', tipo: 'Primera Vez', doctor: 'Dra. Irina', estado: 'En Curso' },
  { hora: '10:30', paciente: 'Carlos Mendoza', tipo: 'Graduación', doctor: 'Dr. Sánchez', estado: 'Pendiente' },
  { hora: '11:00', paciente: 'Lucía Ortiz', tipo: 'Seguimiento', doctor: 'Dra. Irina', estado: 'Pendiente' },
  { hora: '11:30', paciente: 'Roberto Vega', tipo: 'Primera Vez', doctor: 'Dra. Martha', estado: 'Completada' },
  { hora: '12:00', paciente: 'Ana Luisa Pérez', tipo: 'Seguimiento', doctor: 'Dr. Bayardo', estado: 'En Curso' },
];

const pacientesStats = [
  { label: 'Total Pacientes', value: '156', icon: Users, color: 'text-primary-600', bgColor: 'bg-primary-50' },
  { label: 'Nuevos (Mes)', value: '18', icon: User, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  { label: 'Con Seguro', value: '89', icon: Shield, color: 'text-sky-600', bgColor: 'bg-sky-50' },
  { label: 'Particulares', value: '67', icon: User, color: 'text-amber-600', bgColor: 'bg-amber-50' },
];

const pacientesPorEdad = [
  { rango: '0-17', count: 22, pct: 14 },
  { rango: '18-35', count: 41, pct: 26 },
  { rango: '36-50', count: 38, pct: 24 },
  { rango: '51-65', count: 34, pct: 22 },
  { rango: '65+', count: 21, pct: 14 },
];

const pacientesPorSeguro = [
  { nombre: 'ISSSTECALI', count: 32, pct: 100 },
  { nombre: 'Seguros Monterrey', count: 24, pct: 75 },
  { nombre: 'MetLife', count: 18, pct: 56 },
  { nombre: 'GNP', count: 15, pct: 47 },
  { nombre: 'AXA', count: 12, pct: 38 },
  { nombre: 'Particular', count: 55, pct: 100 },
];

const consultasStats = [
  { label: 'Total Consultas', value: '234', trend: '+14%', icon: Stethoscope, color: 'text-primary-600', bgColor: 'bg-primary-50' },
  { label: 'Completadas', value: '198', trend: '85%', icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  { label: 'Pendientes', value: '24', icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  { label: 'Canceladas', value: '12', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-50' },
];

const consultasPorTipo = [
  { tipo: 'Seguimiento', count: 98, pct: 100 },
  { tipo: 'Primera Vez', count: 72, pct: 73 },
  { tipo: 'Graduación', count: 45, pct: 46 },
  { tipo: 'Control', count: 19, pct: 19 },
];

const consultasPorDoctor = [
  { name: 'Dra. Irina R.', consultas: 98, pct: 100 },
  { name: 'Dr. Sánchez K.', consultas: 72, pct: 73 },
  { name: 'Dra. Martínez P.', consultas: 45, pct: 46 },
  { name: 'Dr. Gomez T.', consultas: 19, pct: 19 },
];

const diagnosticos = [
  { name: 'Miopía Progresiva', casos: 112, pct: 100 },
  { name: 'Astigmatismo', casos: 84, pct: 75 },
  { name: 'Catarata Senil', casos: 56, pct: 50 },
  { name: 'Estrabismo Infantil', casos: 38, pct: 34 },
  { name: 'Glaucoma de Ángulo Abierto', casos: 24, pct: 21 },
];

const financieroStats = [
  { label: 'Pacientes Totales', value: '156', trend: '+8%', icon: Users, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
  { label: 'Consultas Registradas', value: '234', trend: '+14%', icon: Calendar, color: 'text-primary-700', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
  { label: 'Ingresos Totales', value: '$345,600', trend: '+21%', icon: DollarSign, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
  { label: 'Procedimientos Quirúrgicos', value: '45', trend: '+5%', icon: Activity, color: 'text-primary-700', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
];

const ingresosMensuales = [
  { mes: 'Ene', value: 180, height: 45 },
  { mes: 'Feb', value: 210, height: 52 },
  { mes: 'Mar', value: 245, height: 61 },
  { mes: 'Abr', value: 195, height: 48 },
  { mes: 'May', value: 280, height: 70 },
  { mes: 'Jun', value: 346, height: 86 },
];

const metodosPago = [
  { name: 'Tarjeta de Crédito', pct: 45, color: '#1a3a5c' },
  { name: 'Efectivo', pct: 30, color: '#00b4d8' },
  { name: 'Aseguradora (Directo)', pct: 15, color: '#2e86c1' },
  { name: 'Transferencia', pct: 10, color: '#94a3b8' },
];

const inventarioStats = [
  { label: 'Lentes Totales', value: '48', icon: Package, color: 'text-primary-600', bgColor: 'bg-primary-50' },
  { label: 'Disponibles', value: '31', icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  { label: 'Stock Bajo', value: '12', icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  { label: 'Sin Stock', value: '5', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-50' },
];

const inventarioPorCategoria = [
  { cat: 'Lente Intraocular (LIO)', count: 28, pct: 100 },
  { cat: 'Lente Monofocal', count: 12, pct: 43 },
  { cat: 'Lente Bifocal', count: 5, pct: 18 },
  { cat: 'Lente Progresivo', count: 3, pct: 11 },
];

const inventarioPorProveedor = [
  { prov: 'Alcon México', count: 20, pct: 100 },
  { prov: 'Johnson & Johnson Vision', count: 15, pct: 75 },
  { prov: 'Zeiss', count: 8, pct: 40 },
  { prov: 'Hoya', count: 5, pct: 25 },
];

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  Completada: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'En Curso': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  Pendiente: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
};

export default function ReportesPage() {
  const [activeTab, setActiveTab] = useState('Resumen');
  const [periodo, setPeriodo] = useState('Este Mes (Septiembre 2026)');

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">REPORTES CLÍNICOS Y FINANCIEROS</h1>
          <p className="mt-0.5 text-sm text-gray-400">Monitorea el rendimiento del equipo, diagnósticos comunes y flujos financieros.</p>
        </div>
        <div className="flex gap-3">
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4" /> Exportar Excel
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
            <FileText className="h-4 w-4" /> Exportar PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'relative px-6 py-3 text-sm font-bold transition-colors',
                activeTab === tab ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'
              )}
            >
              {tab}
              {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-full" />}
            </button>
          ))}
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-gray-500">Periodo:</span>
        <div className="relative">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-9 py-2 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
            {periodoOptions.map((p) => <option key={p}>{p}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* ==================== RESUMEN ==================== */}
      {activeTab === 'Resumen' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {resumenStats.map((stat) => (
              <div key={stat.label} className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide">{stat.label}</p>
                    <span className="mt-2 block text-[32px] font-extrabold leading-none text-gray-900">{stat.value}</span>
                  </div>
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', stat.bgColor)}>
                    <stat.icon className={cn('h-5 w-5', stat.color)} />
                  </div>
                </div>
                {stat.trend && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600 ring-1 ring-emerald-200">
                      <TrendingUp className="h-3 w-3" /> {stat.trend}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Actividad Hoy */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-gray-900">Actividad de Hoy</h3>
              <div className="space-y-3">
                {resumenActividad.map((a, i) => {
                  const est = estadoConfig[a.estado];
                  return (
                    <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-100 px-4 py-3 hover:bg-gray-50/60 transition-colors">
                      <span className="text-xs font-extrabold text-primary-600 w-12">{a.hora}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{a.paciente}</p>
                        <p className="text-xs text-gray-400">{a.tipo} · {a.doctor}</p>
                      </div>
                      <span className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-extrabold', est.bg, est.text)}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', est.dot)} />
                        {a.estado}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Diagnósticos frecuentes */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-gray-900">Diagnósticos Más Frecuentes</h3>
              <div className="space-y-4">
                {diagnosticos.map((d) => (
                  <div key={d.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-gray-700">{d.name}</span>
                      <span className="text-xs font-bold text-gray-400">{d.casos} casos</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${d.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== PACIENTES ==================== */}
      {activeTab === 'Pacientes' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {pacientesStats.map((stat) => (
              <div key={stat.label} className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide">{stat.label}</p>
                    <span className="mt-2 block text-[32px] font-extrabold leading-none text-gray-900">{stat.value}</span>
                  </div>
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', stat.bgColor)}>
                    <stat.icon className={cn('h-5 w-5', stat.color)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Por edad */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-gray-900">Distribución por Edad</h3>
              <div className="flex items-end gap-4 h-[200px]">
                {pacientesPorEdad.map((p) => (
                  <div key={p.rango} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-bold text-gray-600">{p.count}</span>
                    <div className="w-full flex justify-center">
                      <div className="w-full max-w-[48px] rounded-t-lg bg-primary-500 transition-all hover:bg-primary-600" style={{ height: `${p.pct * 1.8}%` }} />
                    </div>
                    <span className="text-xs font-bold text-gray-400">{p.rango}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Por aseguradora */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-gray-900">Pacientes por Aseguradora</h3>
              <div className="space-y-3">
                {pacientesPorSeguro.map((s) => (
                  <div key={s.nombre}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-gray-700">{s.nombre}</span>
                      <span className="text-xs font-bold text-gray-400">{s.count} pacientes</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== CONSULTAS ==================== */}
      {activeTab === 'Consultas' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {consultasStats.map((stat) => (
              <div key={stat.label} className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide">{stat.label}</p>
                    <span className="mt-2 block text-[32px] font-extrabold leading-none text-gray-900">{stat.value}</span>
                  </div>
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', stat.bgColor)}>
                    <stat.icon className={cn('h-5 w-5', stat.color)} />
                  </div>
                </div>
                {stat.trend && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600 ring-1 ring-emerald-200">
                      <TrendingUp className="h-3 w-3" /> {stat.trend}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Por tipo */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-gray-900">Consultas por Tipo</h3>
              <div className="space-y-4">
                {consultasPorTipo.map((t) => (
                  <div key={t.tipo}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-gray-700">{t.tipo}</span>
                      <span className="text-xs font-bold text-gray-400">{t.count} consultas</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${t.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Por doctor */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-gray-900">Consultas por Médico</h3>
              <div className="space-y-4">
                {consultasPorDoctor.map((m) => (
                  <div key={m.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-gray-700">{m.name}</span>
                      <span className="text-xs font-bold text-gray-400">{m.consultas} consultas</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${m.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Diagnósticos */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
            <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-gray-900">Diagnósticos Más Frecuentes</h3>
            <div className="space-y-4">
              {diagnosticos.map((d) => (
                <div key={d.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-gray-700">{d.name}</span>
                    <span className="text-xs font-bold text-gray-400">{d.casos} casos</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${d.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ==================== FINANCIERO ==================== */}
      {activeTab === 'Financiero' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {financieroStats.map((stat) => (
              <div key={stat.label} className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide">{stat.label}</p>
                    <span className="mt-2 block text-[32px] font-extrabold leading-none text-gray-900">{stat.value}</span>
                  </div>
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', stat.bgColor, 'ring-1', stat.borderColor)}>
                    <stat.icon className={cn('h-5 w-5', stat.color)} />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600 ring-1 ring-emerald-200">
                    <TrendingUp className="h-3 w-3" /> {stat.trend}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-5">
            <div className="xl:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="mb-6 text-xs font-extrabold uppercase tracking-widest text-gray-900">Ingresos Mensuales (Últimos 6 Meses)</h3>
              <div className="flex items-end gap-4 h-[220px]">
                {ingresosMensuales.map((item) => (
                  <div key={item.mes} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-bold text-gray-600">${item.value}k</span>
                    <div className="w-full flex justify-center">
                      <div className="w-full max-w-[52px] rounded-t-lg bg-primary-500 transition-all hover:bg-primary-600" style={{ height: `${item.height}%` }} />
                    </div>
                    <span className="text-xs font-bold text-gray-400">{item.mes}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="mb-6 text-xs font-extrabold uppercase tracking-widest text-gray-900">Métodos de Pago (%)</h3>
              <div className="flex items-center gap-8">
                <div className="relative w-[140px] h-[140px] shrink-0">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    {(() => {
                      let cumulative = 0;
                      return metodosPago.map((m) => {
                        const dashArray = `${m.pct} ${100 - m.pct}`;
                        const dashOffset = -cumulative;
                        cumulative += m.pct;
                        return (
                          <circle key={m.name} cx="18" cy="18" r="14" fill="none" stroke={m.color} strokeWidth="4" strokeDasharray={dashArray} strokeDashoffset={dashOffset} />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <span className="text-2xl font-extrabold text-gray-900">$345k</span>
                      <p className="text-[10px] font-bold text-gray-400">Total</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  {metodosPago.map((m) => (
                    <div key={m.name} className="flex items-center gap-2.5">
                      <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: m.color }} />
                      <span className="text-xs font-bold text-gray-600 flex-1">{m.name}</span>
                      <span className="text-xs font-extrabold text-gray-900">{m.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-6 xl:grid-cols-5">
            <div className="xl:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-gray-900">Consultas por Médico</h3>
              <div className="space-y-5">
                {consultasPorDoctor.map((m) => (
                  <div key={m.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-gray-900">{m.name}</span>
                      <span className="text-xs font-bold text-primary-600">{m.consultas} consultas</span>
                    </div>
                    <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${m.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-gray-900">Diagnósticos Más Frecuentes</h3>
              <div className="space-y-4">
                {diagnosticos.map((d) => (
                  <div key={d.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-gray-700">{d.name}</span>
                      <span className="text-xs font-bold text-gray-400">{d.casos} casos</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${d.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== INVENTARIO ==================== */}
      {activeTab === 'Inventario' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {inventarioStats.map((stat) => (
              <div key={stat.label} className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide">{stat.label}</p>
                    <span className="mt-2 block text-[32px] font-extrabold leading-none text-gray-900">{stat.value}</span>
                  </div>
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', stat.bgColor)}>
                    <stat.icon className={cn('h-5 w-5', stat.color)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Por categoría */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-gray-900">Lentes por Categoría</h3>
              <div className="space-y-4">
                {inventarioPorCategoria.map((c) => (
                  <div key={c.cat}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-gray-700">{c.cat}</span>
                      <span className="text-xs font-bold text-gray-400">{c.count} unidades</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${c.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Por proveedor */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-gray-900">Lentes por Proveedor</h3>
              <div className="space-y-4">
                {inventarioPorProveedor.map((p) => (
                  <div key={p.prov}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-gray-700">{p.prov}</span>
                      <span className="text-xs font-bold text-gray-400">{p.count} unidades</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${p.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
