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
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = ['Resumen', 'Pacientes', 'Consultas', 'Financiero', 'Inventario'];

const stats = [
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

const diagnosticos = [
  { name: 'Miopía Progresiva', casos: 112, pct: 100 },
  { name: 'Astigmatismo', casos: 84, pct: 75 },
  { name: 'Catarata Senil', casos: 56, pct: 50 },
  { name: 'Estrabismo Infantil', casos: 38, pct: 34 },
  { name: 'Glaucoma de Ángulo Abierto', casos: 24, pct: 21 },
];

const medicos = [
  { name: 'Dra. Irina R.', consultas: 98, pct: 100 },
  { name: 'Dr. Sánchez K.', consultas: 72, pct: 73 },
  { name: 'Dra. Martínez P.', consultas: 45, pct: 46 },
  { name: 'Dr. Gomez T.', consultas: 19, pct: 19 },
];

const metodosPago = [
  { name: 'Tarjeta de Crédito', pct: 45, color: '#1a3a5c' },
  { name: 'Efectivo', pct: 30, color: '#00b4d8' },
  { name: 'Aseguradora (Directo)', pct: 15, color: '#2e86c1' },
  { name: 'Transferencia', pct: 10, color: '#94a3b8' },
];

export default function ReportesPage() {
  const [activeTab, setActiveTab] = useState('Financiero');
  const [periodo, setPeriodo] = useState('Este Mes (Enero 2026)');

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
                activeTab === tab
                  ? 'text-primary-600'
                  : 'text-gray-400 hover:text-gray-600'
              )}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-gray-500">Periodo:</span>
        <div className="relative">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-9 py-2 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          >
            <option>Este Mes (Enero 2026)</option>
            <option>Últimos 3 Meses</option>
            <option>Últimos 6 Meses</option>
            <option>Este Año</option>
            <option>Todo</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
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

      {/* Charts row 1 */}
      <div className="grid gap-6 xl:grid-cols-5">
        {/* Ingresos Mensuales */}
        <div className="xl:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
          <h3 className="mb-6 text-xs font-extrabold uppercase tracking-widest text-gray-900">Ingresos Mensuales (Últimos 6 Meses)</h3>
          <div className="flex items-end gap-4 h-[220px]">
            {ingresosMensuales.map((item) => (
              <div key={item.mes} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-bold text-gray-600">${item.value}k</span>
                <div className="w-full flex justify-center">
                  <div
                    className="w-full max-w-[52px] rounded-t-lg bg-primary-500 transition-all hover:bg-primary-600"
                    style={{ height: `${item.height}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-gray-400">{item.mes}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Diagnósticos */}
        <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
          <h3 className="mb-6 text-xs font-extrabold uppercase tracking-widest text-gray-900">Diagnósticos Más Frecuentes</h3>
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

      {/* Charts row 2 */}
      <div className="grid gap-6 xl:grid-cols-5">
        {/* Consultas por Médico */}
        <div className="xl:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
          <h3 className="mb-6 text-xs font-extrabold uppercase tracking-widest text-gray-900">Consultas por Médico Especialista</h3>
          <div className="space-y-5">
            {medicos.map((m) => (
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

        {/* Métodos de Pago */}
        <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
          <h3 className="mb-6 text-xs font-extrabold uppercase tracking-widest text-gray-900">Métodos de Pago (%)</h3>
          <div className="flex items-center gap-8">
            {/* Donut chart */}
            <div className="relative w-[140px] h-[140px] shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                {(() => {
                  let cumulative = 0;
                  return metodosPago.map((m) => {
                    const dashArray = `${m.pct} ${100 - m.pct}`;
                    const dashOffset = -cumulative;
                    cumulative += m.pct;
                    return (
                      <circle
                        key={m.name}
                        cx="18" cy="18" r="14"
                        fill="none"
                        stroke={m.color}
                        strokeWidth="4"
                        strokeDasharray={dashArray}
                        strokeDashoffset={dashOffset}
                        className="transition-all"
                      />
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
            {/* Legend */}
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
    </div>
  );
}
