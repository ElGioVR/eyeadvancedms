'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import Tabs from '@/components/ui/Tabs';
import ProgressBar from '@/components/ui/ProgressBar';
import BarChart from '@/components/ui/BarChart';
import DonutChart from '@/components/ui/DonutChart';
import StatusBadge from '@/components/ui/StatusBadge';

const tabs = ['Resumen', 'Pacientes', 'Consultas', 'Financiero', 'Inventario'];
const periodoOptions = ['Este Mes', 'Últimos 3 Meses', 'Últimos 6 Meses', 'Este Año', 'Todo'];

interface ReportData {
  resumen: {
    totalPacientes: number;
    pacientesNuevos: number;
    totalConsultas: number;
    totalCobros: number;
    pagados: number;
    pendientes: number;
    totalLentes: number;
    lentesDisponibles: number;
    lentesStockBajo: number;
    lentesSinStock: number;
    pacientesConSeguro: number;
    pacientesParticulares: number;
  };
  pacientes: {
    porEdad: Array<{ label: string; value: number }>;
    porAseguradora: Array<{ name: string; value: number; color: string }>;
  };
  consultas: {
    porTipo: Array<{ label: string; value: number; displayValue: string }>;
    porDoctor: Array<{ label: string; value: number; displayValue: string }>;
  };
  diagnosticos: Array<{ name: string; casos: number; pct: number }>;
  financiero: {
    totalCobros: number;
    porMetodo: Array<{ name: string; value: number; color: string }>;
    ingresosMensuales: Array<{ label: string; value: number; displayValue: string }>;
  };
  inventario: {
    porCategoria: Array<{ label: string; value: number; displayValue: string }>;
    porProveedor: Array<{ label: string; value: number; displayValue: string }>;
  };
  actividadHoy: Array<{
    hora: string;
    paciente: string;
    tipo: string;
    doctor: string;
    estado: string;
  }>;
}

const estadoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  Completada: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'En Curso': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  Pendiente: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
};

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

async function exportPDF(data: ReportData, periodo: string) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Reportes Clinicos y Financieros', pageWidth / 2, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Periodo: ${periodo}`, pageWidth / 2, 28, { align: 'center' });
  doc.text(`Generado: ${new Date().toLocaleDateString('es-MX')}`, pageWidth / 2, 34, { align: 'center' });

  let y = 44;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumen General', 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['Metrica', 'Valor']],
    body: [
      ['Pacientes Totales', String(data.resumen.totalPacientes)],
      ['Pacientes Nuevos', String(data.resumen.pacientesNuevos)],
      ['Consultas del Periodo', String(data.resumen.totalConsultas)],
      ['Ingresos Totales', `$${data.resumen.totalCobros.toLocaleString()}`],
      ['Pendientes de Cobro', `$${data.resumen.pendientes.toLocaleString()}`],
      ['Lentes en Stock', String(data.resumen.lentesDisponibles)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [26, 58, 92] },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Consultas por Tipo', 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['Tipo', 'Cantidad']],
    body: data.consultas.porTipo.map((t) => [t.label, String(t.value)]),
    theme: 'grid',
    headStyles: { fillColor: [26, 58, 92] },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Consultas por Doctor', 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['Doctor', 'Consultas']],
    body: data.consultas.porDoctor.map((d) => [d.label, String(d.value)]),
    theme: 'grid',
    headStyles: { fillColor: [26, 58, 92] },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  if (data.diagnosticos.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Diagnosticos Frecuentes', 14, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Diagnostico', 'Casos']],
      body: data.diagnosticos.map((d) => [d.name, String(d.casos)]),
      theme: 'grid',
      headStyles: { fillColor: [26, 58, 92] },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  doc.addPage();
  y = 20;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Distribucion por Edad', 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['Rango', 'Pacientes']],
    body: data.pacientes.porEdad.map((e) => [e.label, String(e.value)]),
    theme: 'grid',
    headStyles: { fillColor: [26, 58, 92] },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Pacientes por Aseguradora', 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['Aseguradora', 'Pacientes']],
    body: data.pacientes.porAseguradora.map((a) => [a.name, String(a.value)]),
    theme: 'grid',
    headStyles: { fillColor: [26, 58, 92] },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Metodos de Pago', 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['Metodo', 'Porcentaje']],
    body: data.financiero.porMetodo.map((m) => [m.name, `${m.value}%`]),
    theme: 'grid',
    headStyles: { fillColor: [26, 58, 92] },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Inventario por Categoria', 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['Categoria', 'Unidades']],
    body: data.inventario.porCategoria.map((c) => [c.label, String(c.value)]),
    theme: 'grid',
    headStyles: { fillColor: [26, 58, 92] },
  });

  doc.save(`reporte-${periodo.toLowerCase().replace(/\s+/g, '-')}.pdf`);
}

async function exportExcel(data: ReportData, periodo: string) {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();

  const resumenData = [
    ['Metrica', 'Valor'],
    ['Pacientes Totales', data.resumen.totalPacientes],
    ['Pacientes Nuevos', data.resumen.pacientesNuevos],
    ['Consultas del Periodo', data.resumen.totalConsultas],
    ['Ingresos Totales', data.resumen.totalCobros],
    ['Pendientes de Cobro', data.resumen.pendientes],
    ['Lentes Disponibles', data.resumen.lentesDisponibles],
    ['Lentes Stock Bajo', data.resumen.lentesStockBajo],
    ['Lentes Sin Stock', data.resumen.lentesSinStock],
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  const consultasData = [
    ['Tipo', 'Cantidad'],
    ...data.consultas.porTipo.map((t) => [t.label, t.value]),
  ];
  const wsConsultas = XLSX.utils.aoa_to_sheet(consultasData);
  XLSX.utils.book_append_sheet(wb, wsConsultas, 'Consultas por Tipo');

  const doctoresData = [
    ['Doctor', 'Consultas'],
    ...data.consultas.porDoctor.map((d) => [d.label, d.value]),
  ];
  const wsDoctores = XLSX.utils.aoa_to_sheet(doctoresData);
  XLSX.utils.book_append_sheet(wb, wsDoctores, 'Consultas por Doctor');

  if (data.diagnosticos.length > 0) {
    const diagData = [
      ['Diagnostico', 'Casos'],
      ...data.diagnosticos.map((d) => [d.name, d.casos]),
    ];
    const wsDiag = XLSX.utils.aoa_to_sheet(diagData);
    XLSX.utils.book_append_sheet(wb, wsDiag, 'Diagnosticos');
  }

  const edadData = [
    ['Rango', 'Pacientes'],
    ...data.pacientes.porEdad.map((e) => [e.label, e.value]),
  ];
  const wsEdad = XLSX.utils.aoa_to_sheet(edadData);
  XLSX.utils.book_append_sheet(wb, wsEdad, 'Pacientes por Edad');

  const asegData = [
    ['Aseguradora', 'Pacientes'],
    ...data.pacientes.porAseguradora.map((a) => [a.name, a.value]),
  ];
  const wsAseg = XLSX.utils.aoa_to_sheet(asegData);
  XLSX.utils.book_append_sheet(wb, wsAseg, 'Pacientes por Seguro');

  const financieroData = [
    ['Concepto', 'Monto'],
    ['Ingresos Totales', data.financiero.totalCobros],
    ...data.financiero.ingresosMensuales.map((i) => [`Ingresos ${i.label}`, i.value * 1000]),
  ];
  const wsFin = XLSX.utils.aoa_to_sheet(financieroData);
  XLSX.utils.book_append_sheet(wb, wsFin, 'Financiero');

  const metodoData = [
    ['Metodo', 'Porcentaje'],
    ...data.financiero.porMetodo.map((m) => [m.name, `${m.value}%`]),
  ];
  const wsMetodo = XLSX.utils.aoa_to_sheet(metodoData);
  XLSX.utils.book_append_sheet(wb, wsMetodo, 'Metodos de Pago');

  const invCatData = [
    ['Categoria', 'Unidades'],
    ...data.inventario.porCategoria.map((c) => [c.label, c.value]),
  ];
  const wsInvCat = XLSX.utils.aoa_to_sheet(invCatData);
  XLSX.utils.book_append_sheet(wb, wsInvCat, 'Inventario por Categoria');

  const invProvData = [
    ['Proveedor', 'Unidades'],
    ...data.inventario.porProveedor.map((p) => [p.label, p.value]),
  ];
  const wsInvProv = XLSX.utils.aoa_to_sheet(invProvData);
  XLSX.utils.book_append_sheet(wb, wsInvProv, 'Inventario por Proveedor');

  XLSX.writeFile(wb, `reporte-${periodo.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
}

export default function ReportesPage() {
  const [activeTab, setActiveTab] = useState('Resumen');
  const [periodo, setPeriodo] = useState(periodoOptions[0]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/reportes?periodo=${encodeURIComponent(periodo)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Error al cargar reportes');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [periodo]);

  const handleExportPDF = useCallback(() => {
    if (data) exportPDF(data, periodo);
  }, [data, periodo]);

  const handleExportExcel = useCallback(() => {
    if (data) exportExcel(data, periodo);
  }, [data, periodo]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1440px] space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-72 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-4 w-96 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-36 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-10 w-36 animate-pulse rounded-lg bg-gray-200" />
          </div>
        </div>
        <div className="flex gap-1 border-b border-gray-200">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 w-28 animate-pulse rounded-t-lg bg-gray-100" />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
          <div className="h-10 w-48 animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-24 rounded bg-gray-200" />
                  <div className="h-7 w-16 rounded bg-gray-200" />
                </div>
                <div className="h-10 w-10 rounded-lg bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 h-4 w-40 animate-pulse rounded bg-gray-200" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-100 px-4 py-3">
                  <div className="h-3 w-12 animate-pulse rounded bg-gray-200" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3.5 w-36 animate-pulse rounded bg-gray-200" />
                    <div className="h-2.5 w-28 animate-pulse rounded bg-gray-100" />
                  </div>
                  <div className="h-5 w-16 animate-pulse rounded-full bg-gray-200" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 h-4 w-48 animate-pulse rounded bg-gray-200" />
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-32 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-14 animate-pulse rounded bg-gray-100" />
                  </div>
                  <div className="h-2.5 w-full animate-pulse rounded-full bg-gray-200" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1440px] space-y-6">
        <PageHeader title="REPORTES CLINICOS Y FINANCIEROS" subtitle="Error al cargar datos." />
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="REPORTES CLINICOS Y FINANCIEROS"
        subtitle="Monitorea el rendimiento del equipo, diagnosticos comunes y flujos financieros."
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" /> Exportar Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
            >
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
            <StatCard label="Pacientes Totales" value={String(data.resumen.totalPacientes)} icon={Users} color="text-primary-600" bgColor="bg-primary-50" />
            <StatCard label="Consultas del Periodo" value={String(data.resumen.totalConsultas)} icon={Calendar} color="text-sky-600" bgColor="bg-sky-50" />
            <StatCard label="Ingresos del Periodo" value={`$${data.resumen.totalCobros.toLocaleString()}`} icon={DollarSign} color="text-emerald-600" bgColor="bg-emerald-50" />
            <StatCard label="Lentes en Stock" value={String(data.resumen.lentesDisponibles)} icon={Package} color="text-amber-600" bgColor="bg-amber-50" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Actividad de Hoy</SectionTitle>
              <div className="space-y-3">
                {data.actividadHoy.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay actividad registrada hoy.</p>
                ) : (
                  data.actividadHoy.slice(0, 6).map((a, i) => (
                    <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-100 px-4 py-3 hover:bg-gray-50/60 transition-colors">
                      <span className="text-xs font-extrabold text-primary-600 w-12">{a.hora}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{a.paciente}</p>
                        <p className="text-xs text-gray-400">{a.tipo} · {a.doctor}</p>
                      </div>
                      <StatusBadge status={a.estado} config={estadoConfig} />
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Diagnosticos Mas Frecuentes</SectionTitle>
              <div className="space-y-4">
                {data.diagnosticos.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay diagnosticos registrados.</p>
                ) : (
                  data.diagnosticos.slice(0, 5).map((d) => (
                    <ProgressBarItem key={d.name} label={d.name} value={d.pct} maxValue={100} displayValue={`${d.casos} casos`} />
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'Pacientes' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Pacientes" value={String(data.resumen.totalPacientes)} icon={Users} color="text-primary-600" bgColor="bg-primary-50" />
            <StatCard label="Nuevos (Periodo)" value={String(data.resumen.pacientesNuevos)} icon={User} color="text-emerald-600" bgColor="bg-emerald-50" />
            <StatCard label="Con Seguro" value={String(data.resumen.pacientesConSeguro)} icon={Shield} color="text-sky-600" bgColor="bg-sky-50" />
            <StatCard label="Particulares" value={String(data.resumen.pacientesParticulares)} icon={User} color="text-amber-600" bgColor="bg-amber-50" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Distribucion por Edad</SectionTitle>
              <BarChart data={data.pacientes.porEdad} height={200} />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Pacientes por Aseguradora</SectionTitle>
              <div className="space-y-3">
                {data.pacientes.porAseguradora.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay datos de aseguradoras.</p>
                ) : (
                  data.pacientes.porAseguradora.map((s) => (
                    <ProgressBarItem key={s.name} label={s.name} value={s.value} maxValue={Math.max(...data.pacientes.porAseguradora.map((a) => a.value), 1)} displayValue={`${s.value} pacientes`} color={s.color} />
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'Consultas' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Consultas" value={String(data.resumen.totalConsultas)} icon={Stethoscope} color="text-primary-600" bgColor="bg-primary-50" />
            <StatCard label="Tipos Registrados" value={String(data.consultas.porTipo.length)} icon={Activity} color="text-sky-600" bgColor="bg-sky-50" />
            <StatCard label="Doctores Activos" value={String(data.consultas.porDoctor.length)} icon={User} color="text-emerald-600" bgColor="bg-emerald-50" />
            <StatCard label="Diagnosticos" value={String(data.diagnosticos.length)} icon={AlertTriangle} color="text-amber-600" bgColor="bg-amber-50" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Consultas por Tipo</SectionTitle>
              <BarChart data={data.consultas.porTipo} height={200} />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Consultas por Medico</SectionTitle>
              <div className="space-y-5">
                {data.consultas.porDoctor.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay consultas registradas.</p>
                ) : (
                  data.consultas.porDoctor.map((m) => (
                    <ProgressBarItem key={m.label} label={m.label} value={m.value} maxValue={Math.max(...data.consultas.porDoctor.map((d) => d.value), 1)} displayValue={m.displayValue} />
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
            <SectionTitle>Diagnosticos Mas Frecuentes</SectionTitle>
            <div className="space-y-4">
              {data.diagnosticos.length === 0 ? (
                <p className="text-sm text-gray-400">No hay diagnosticos registrados.</p>
              ) : (
                data.diagnosticos.map((d) => (
                  <ProgressBarItem key={d.name} label={d.name} value={d.pct} maxValue={100} displayValue={`${d.casos} casos`} />
                ))
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'Financiero' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Ingresos Totales" value={`$${data.financiero.totalCobros.toLocaleString()}`} icon={DollarSign} color="text-emerald-600" bgColor="bg-emerald-50" />
            <StatCard label="Pendientes" value={`$${data.resumen.pendientes.toLocaleString()}`} icon={Clock} color="text-amber-600" bgColor="bg-amber-50" />
            <StatCard label="Cobros Registrados" value={String(data.resumen.totalConsultas)} icon={FileText} color="text-primary-600" bgColor="bg-primary-50" />
            <StatCard label="Metodos de Pago" value={String(data.financiero.porMetodo.length)} icon={Activity} color="text-sky-600" bgColor="bg-sky-50" />
          </div>
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Ingresos Mensuales</SectionTitle>
              {data.financiero.ingresosMensuales.length === 0 ? (
                <p className="text-sm text-gray-400">No hay ingresos registrados.</p>
              ) : (
                <BarChart data={data.financiero.ingresosMensuales} height={220} />
              )}
            </div>
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Metodos de Pago (%)</SectionTitle>
              {data.financiero.porMetodo.length === 0 ? (
                <p className="text-sm text-gray-400">No hay datos de pago.</p>
              ) : (
                <DonutChart
                  data={data.financiero.porMetodo}
                  centerValue={`$${Math.round(data.financiero.totalCobros / 1000)}k`}
                  centerLabel="Total"
                />
              )}
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Consultas por Medico</SectionTitle>
              <div className="space-y-5">
                {data.consultas.porDoctor.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay datos.</p>
                ) : (
                  data.consultas.porDoctor.map((m) => (
                    <ProgressBarItem key={m.label} label={m.label} value={m.value} maxValue={Math.max(...data.consultas.porDoctor.map((d) => d.value), 1)} displayValue={m.displayValue} />
                  ))
                )}
              </div>
            </div>
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Diagnosticos Mas Frecuentes</SectionTitle>
              <div className="space-y-4">
                {data.diagnosticos.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay datos.</p>
                ) : (
                  data.diagnosticos.slice(0, 5).map((d) => (
                    <ProgressBarItem key={d.name} label={d.name} value={d.pct} maxValue={100} displayValue={`${d.casos} casos`} />
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'Inventario' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Lentes Totales" value={String(data.resumen.totalLentes)} icon={Package} color="text-primary-600" bgColor="bg-primary-50" />
            <StatCard label="Disponibles" value={String(data.resumen.lentesDisponibles)} icon={CheckCircle} color="text-emerald-600" bgColor="bg-emerald-50" />
            <StatCard label="Stock Bajo" value={String(data.resumen.lentesStockBajo)} icon={AlertTriangle} color="text-amber-600" bgColor="bg-amber-50" />
            <StatCard label="Sin Stock" value={String(data.resumen.lentesSinStock)} icon={XCircle} color="text-red-500" bgColor="bg-red-50" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Lentes por Categoria</SectionTitle>
              {data.inventario.porCategoria.length === 0 ? (
                <p className="text-sm text-gray-400">No hay categorias registradas.</p>
              ) : (
                <BarChart data={data.inventario.porCategoria} height={200} />
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <SectionTitle>Lentes por Proveedor</SectionTitle>
              {data.inventario.porProveedor.length === 0 ? (
                <p className="text-sm text-gray-400">No hay proveedores registrados.</p>
              ) : (
                <BarChart data={data.inventario.porProveedor} height={200} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
