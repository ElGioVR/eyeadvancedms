'use client';

import { useState } from 'react';
import {
  Users,
  Calendar,
  DollarSign,
  Activity,
  Download,
  FileText,
  User,
  Shield,
  Stethoscope,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import Tabs from '@/components/ui/Tabs';
import ProgressBar from '@/components/ui/ProgressBar';
import BarChart from '@/components/ui/BarChart';
import DonutChart from '@/components/ui/DonutChart';
import StatusBadge from '@/components/ui/StatusBadge';

const tabs = ['Resumen', 'Pacientes', 'Consultas', 'Financiero', 'Inventario'];
const periodoOptions = ['Este Mes (Septiembre 2026)', 'Últimos 3 Meses', 'Últimos 6 Meses', 'Este Año', 'Todo'];

const resumenStats = [
  { label: 'Pacientes Totales', value: '156', trend: '+8%', icon: Users, color: 'text-primary-600', bgColor: 'bg-primary-50' },
  { label: 'Consultas del Mes', value: '42', trend: '+12%', icon: Calendar, color: 'text-sky-600', bgColor: 'bg-sky-50' },
  { label: 'Ingresos del Mes', value: '$141,300', trend: '+21%', icon: DollarSign, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  { label: 'Lentes en Stock', value: '31', trend: '-3', icon: Package, color: 'text-amber-600', bgColor: 'bg-amber-50' },
];

const resumenActividad = [
  { hora: '09:00', paciente: 'Mateo Rodríguez', tipo: 'Seguimiento', doctor: 'Dra. Irina', estado: 'Completada' },
  { hora: '09:45', paciente: 'Sofía González', tipo: 'Primera Vez', doctor: 'Dra. Irina', estado: 'En Curso' },
  { hora: '10:30', paciente: 'Carlos Mendoza', tipo: 'Graduación', doctor: 'Dr. Sánchez', estado: 'Pendiente' },
  { hora: '11:00', paciente: 'Lucía Ortiz', tipo: 'Seguimiento', doctor: 'Dra. Irina', estado: 'Pendiente' },
  { hora: '11:30', paciente: 'Roberto Vega', tipo: 'Primera Vez', doctor: 'Dra. Martha', estado: 'Completada' },
  { hora: '12:00', paciente: 'Ana Luisa Pérez', tipo: 'Seguimiento', doctor: 'Dr. Bayardo', estado: 'En Curso' },
];

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  Completada: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'En Curso': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  Pendiente: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
};

const diagnosticos = [
  { name: 'Miopía Progresiva', casos: 112, pct: 100 },
  { name: 'Astigmatismo', casos: 84, pct: 75 },
  { name: 'Catarata Senil', casos: 56, pct: 50 },
  { name: 'Estrabismo Infantil', casos: 38, pct: 34 },
  { name: 'Glaucoma de Ángulo Abierto', casos: 24, pct: 21 },
];

const consultasPorTipo = [
  { label: 'Seguimiento', value: 98, displayValue: '98 consultas' },
  { label: 'Primera Vez', value: 72, displayValue: '72 consultas' },
  { label: 'Graduación', value: 45, displayValue: '45 consultas' },
  { label: 'Control', value: 19, displayValue: '19 consultas' },
];

const consultasPorDoctor = [
  { label: 'Dra. Irina R.', value: 98, displayValue: '98 consultas' },
  { label: 'Dr. Sánchez K.', value: 72, displayValue: '72 consultas' },
  { label: 'Dra. Martínez P.', value: 45, displayValue: '45 consultas' },
  { label: 'Dr. Gomez T.', value: 19, displayValue: '19 consultas' },
];

const pacientesPorEdad = [
  { label: '0-17', value: 22, displayValue: '22' },
  { label: '18-35', value: 41, displayValue: '41' },
  { label: '36-50', value: 38, displayValue: '38' },
  { label: '51-65', value: 34, displayValue: '34' },
  { label: '65+', value: 21, displayValue: '21' },
];

const pacientesPorSeguro = [
  { name: 'ISSSTECALI', value: 32, color: 'bg-sky-500' },
  { name: 'Seguros Monterrey', value: 24, color: 'bg-sky-500' },
  { name: 'MetLife', value: 18, color: 'bg-sky-500' },
  { name: 'GNP', value: 15, color: 'bg-sky-500' },
  { name: 'AXA', value: 12, color: 'bg-sky-500' },
  { name: 'Particular', value: 55, color: 'bg-sky-500' },
];

const ingresosMensuales = [
  { label: 'Ene', value: 180, displayValue: '$180k' },
  { label: 'Feb', value: 210, displayValue: '$210k' },
  { label: 'Mar', value: 245, displayValue: '$245k' },
  { label: 'Abr', value: 195, displayValue: '$195k' },
  { label: 'May', value: 280, displayValue: '$280k' },
  { label: 'Jun', value: 346, displayValue: '$346k' },
];

const metodosPago = [
  { name: 'Tarjeta de Crédito', value: 45, color: '#1a3a5c' },
  { name: 'Efectivo', value: 30, color: '#00b4d8' },
  { name: 'Aseguradora (Directo)', value: 15, color: '#2e86c1' },
  { name: 'Transferencia', value: 10, color: '#94a3b8' },
];

const inventarioPorCategoria = [
  { label: 'Lente Intraocular (LIO)', value: 28, displayValue: '28 unidades' },
  { label: 'Lente Monofocal', value: 12, displayValue: '12 unidades' },
  { label: 'Lente Bifocal', value: 5, displayValue: '5 unidades' },
  { label: 'Lente Progresivo', value: 3, displayValue: '3 unidades' },
];

const inventarioPorProveedor = [
  { label: 'Alcon México', value: 20, displayValue: '20 unidades' },
  { label: 'Johnson & Johnson Vision', value: 15, displayValue: '15 unidades' },
  { label: 'Zeiss', value: 8, displayValue: '8 unidades' },
  { label: 'Hoya', value: 5, displayValue: '5 unidades' },
];

const pacienteStats = [
  { label: 'Total Pacientes', value: '156', icon: Users, color: 'text-primary-600', bgColor: 'bg-primary-50' },
  { label: 'Nuevos (Mes)', value: '18', icon: User, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  { label: 'Con Seguro', value: '89', icon: Shield, color: 'text-sky-600', bgColor: 'bg-sky-50' },
  { label: 'Particulares', value: '67', icon: User, color: 'text-amber-600', bgColor: 'bg-amber-50' },
];

const consultaStats = [
  { label: 'Total Consultas', value: '234', trend: '+14%', icon: Stethoscope, color: 'text-primary-600', bgColor: 'bg-primary-50' },
  { label: 'Completadas', value: '198', trend: '85%', icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  { label: 'Pendientes', value: '24', icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  { label: 'Canceladas', value: '12', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-50' },
];

const financieroStats = [
  { label: 'Pacientes Totales', value: '156', trend: '+8%', icon: Users, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
  { label: 'Consultas Registradas', value: '234', trend: '+14%', icon: Calendar, color: 'text-primary-700', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
  { label: 'Ingresos Totales', value: '$345,600', trend: '+21%', icon: DollarSign, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
  { label: 'Procedimientos Quirúrgicos', value: '45', trend: '+5%', icon: Activity, color: 'text-primary-700', bgColor: 'bg-primary-50', borderColor: 'border-primary-100' },
];

const inventarioStats = [
  { label: 'Lentes Totales', value: '48', icon: Package, color: 'text-primary-600', bgColor: 'bg-primary-50' },
  { label: 'Disponibles', value: '31', icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  { label: 'Stock Bajo', value: '12', icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  { label: 'Sin Stock', value: '5', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-50' },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-gray-900">{children}</h3>;
}

function ProgressBarItem({ label, value, maxValue, displayValue, color }: { label: string; value: number; maxValue: number; displayValue?: string; color?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-bold text-gray-700">{label}</span>
        <span className="text-xs font-bold text-gray-400">{displayValue}</span>
      </div>
      <ProgressBar value={value} maxValue={maxValue} color={color} />
    </div>
  );
}

export default function ReportesPage() {
  const [activeTab, setActiveTab] = useState('Resumen');
  const [periodo, setPeriodo] = useState(periodoOptions[0]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="REPORTES CLÍNICOS Y FINANCIEROS"
        subtitle="Monitorea el rendimiento del equipo, diagnósticos comunes y flujos financieros."
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
              <Download className="h-4 w-4" /> Exportar Excel
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors">
              <FileText className="h-4 w-4" /> Exportar PDF
            </button>
          </div>
        }
      />

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="text-sm font-bold text-gray-500">Periodo:</span>
        <div className="relative w-full sm:w-auto">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-full appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-9 py-2 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
            {periodoOptions.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {activeTab === 'Resumen' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {resumenStats.map((stat) => <StatCard key={stat.label} {...stat} />)}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Actividad de Hoy</SectionTitle>
              <div className="space-y-3">
                {resumenActividad.map((a, i) => (
                  <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-100 px-4 py-3 hover:bg-gray-50/60 transition-colors">
                    <span className="text-xs font-extrabold text-primary-600 w-12">{a.hora}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{a.paciente}</p>
                      <p className="text-xs text-gray-400">{a.tipo} · {a.doctor}</p>
                    </div>
                    <StatusBadge status={a.estado} config={estadoConfig} />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Diagnósticos Más Frecuentes</SectionTitle>
              <div className="space-y-4">
                {diagnosticos.map((d) => (
                  <ProgressBarItem key={d.name} label={d.name} value={d.pct} maxValue={100} displayValue={`${d.casos} casos`} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'Pacientes' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {pacienteStats.map((stat) => <StatCard key={stat.label} {...stat} />)}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Distribución por Edad</SectionTitle>
              <BarChart data={pacientesPorEdad} height={200} />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Pacientes por Aseguradora</SectionTitle>
              <div className="space-y-3">
                {pacientesPorSeguro.map((s) => (
                  <ProgressBarItem key={s.name} label={s.name} value={s.value} maxValue={55} displayValue={`${s.value} pacientes`} color={s.color} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'Consultas' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {consultaStats.map((stat) => <StatCard key={stat.label} {...stat} />)}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Consultas por Tipo</SectionTitle>
              <BarChart data={consultasPorTipo} height={200} />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Consultas por Médico</SectionTitle>
              <div className="space-y-5">
                {consultasPorDoctor.map((m) => (
                  <ProgressBarItem key={m.label} label={m.label} value={m.value} maxValue={98} displayValue={m.displayValue} />
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
            <SectionTitle>Diagnósticos Más Frecuentes</SectionTitle>
            <div className="space-y-4">
              {diagnosticos.map((d) => (
                <ProgressBarItem key={d.name} label={d.name} value={d.pct} maxValue={100} displayValue={`${d.casos} casos`} />
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === 'Financiero' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {financieroStats.map((stat) => <StatCard key={stat.label} {...stat} />)}
          </div>
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Ingresos Mensuales (Últimos 6 Meses)</SectionTitle>
              <BarChart data={ingresosMensuales} height={220} />
            </div>
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Métodos de Pago (%)</SectionTitle>
              <DonutChart data={metodosPago} centerValue="$345k" centerLabel="Total" />
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Consultas por Médico</SectionTitle>
              <div className="space-y-5">
                {consultasPorDoctor.map((m) => (
                  <ProgressBarItem key={m.label} label={m.label} value={m.value} maxValue={98} displayValue={m.displayValue} />
                ))}
              </div>
            </div>
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Diagnósticos Más Frecuentes</SectionTitle>
              <div className="space-y-4">
                {diagnosticos.map((d) => (
                  <ProgressBarItem key={d.name} label={d.name} value={d.pct} maxValue={100} displayValue={`${d.casos} casos`} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'Inventario' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {inventarioStats.map((stat) => <StatCard key={stat.label} {...stat} />)}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Lentes por Categoría</SectionTitle>
              <BarChart data={inventarioPorCategoria} height={200} />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Lentes por Proveedor</SectionTitle>
              <BarChart data={inventarioPorProveedor} height={200} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
