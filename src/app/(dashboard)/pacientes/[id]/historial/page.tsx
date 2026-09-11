'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  FileText,
  Pill,
  Glasses,
  FlaskConical,
  AlertTriangle,
  Eye,
  Clock,
  CheckCircle,
  Download,
  Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Skeleton from '@/components/ui/Skeleton';

const historialTabs = [
  { label: 'Resumen', icon: FileText },
  { label: 'Consultas', icon: Calendar },
  { label: 'Procedimientos', icon: FlaskConical },
  { label: 'Lentes', icon: Glasses },
  { label: 'Estudios', icon: Eye },
];

interface PacienteData {
  id: string;
  nombre_completo: string;
  iniciales: string;
  sexo: string;
  fecha_nacimiento: string;
  edad: number;
  telefono: string;
  email: string;
  direccion: string;
  created_at: string;
  consultas: ConsultaData[];
  total_consultas: number;
}

interface ConsultaData {
  id: string;
  folio: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  tipo_consulta: string;
  tipo_visita: string;
  diagnostico: string;
  estudios: string[];
  procedimiento: string;
  notas: string;
  doctor: string;
  especialidad: string;
  monto: number;
  moneda: string;
  metodo_pago: string;
  pagado: boolean;
}

const tipoConsultaColors: Record<string, string> = {
  'CONSULTA': 'bg-sky-50 text-sky-700 ring-sky-200',
  'ESTUDIO': 'bg-purple-50 text-purple-700 ring-purple-200',
  'REVISION': 'bg-amber-50 text-amber-700 ring-amber-200',
  'PROCEDIMIENTO': 'bg-rose-50 text-rose-700 ring-rose-200',
};

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMoney(amount: number, currency: string) {
  if (!amount) return '—';
  return currency === 'DOLARES' ? `$${amount.toLocaleString('en-US')} USD` : `$${amount.toLocaleString('es-MX')} MXN`;
}

export default function HistorialMedicoPage() {
  const params = useParams();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState('Resumen');
  const [paciente, setPaciente] = useState<PacienteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchPaciente() {
      try {
        const res = await fetch(`/api/pacientes/${id}`);
        if (!res.ok) throw new Error('No se encontró el paciente');
        const data = await res.json();
        setPaciente(data);
      } catch (err: any) {
        setError(err.message || 'Error al cargar paciente');
      } finally {
        setLoading(false);
      }
    }
    fetchPaciente();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1440px] space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-80" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-[#2F3336] dark:bg-[#16181C]">
          <div className="flex items-center gap-6">
            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
        </div>
        <div className="flex gap-1 border-b border-gray-200 dark:border-[#2F3336]">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-t-lg" />
          ))}
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white dark:border-[#2F3336] dark:bg-[#16181C]">
                <div className="flex items-center gap-3 border-b border-gray-100 dark:border-[#2F3336] px-6 py-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <div className="grid grid-cols-4 gap-4 px-6 py-4">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="space-y-1">
                      <Skeleton className="h-2.5 w-16" />
                      <Skeleton className="h-3.5 w-28" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="w-full lg:w-[360px] space-y-5">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !paciente) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <p className="text-sm font-bold text-red-600">{error || 'Paciente no encontrado'}</p>
          <Link href="/pacientes" className="inline-flex items-center gap-2 text-sm font-bold text-primary-600 hover:text-primary-800">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
        </div>
      </div>
    );
  }

  const consultas = paciente.consultas || [];
  const consultasConProcedimiento = consultas.filter((c) => c.procedimiento);
  const estudiosFromConsultas = consultas.flatMap((c, i) =>
    c.estudios.map((est, j) => ({
      id: `${c.id}-${j}`,
      fecha: c.fecha,
      estudio: est,
      doctor: c.doctor,
      ojo: 'OD / OI',
      resultado: c.diagnostico,
    }))
  );

  // Unique diagnoses from consultations
  const diagnosticos = Array.from(new Set(consultas.map((c) => c.diagnostico).filter(Boolean)));

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Link
          href="/pacientes"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 dark:border-[#2F3336] dark:bg-[#16181C] dark:text-[#E7E9EA] dark:hover:bg-[#1D1F23] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-[#E7E9EA]">
            HISTORIAL MÉDICO - {paciente.nombre_completo}
          </h1>
          <p className="mt-0.5 text-sm text-gray-400 dark:text-[#71767B]">
            Consulta, diagnósticos y tratamientos detallados del paciente.
          </p>
        </div>
      </div>

      {/* Patient info card */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[#2F3336] dark:bg-[#16181C]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-purple-500 text-xl font-bold text-white">
            {paciente.iniciales || '??'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA]">{paciente.nombre_completo}</h2>
            <p className="text-sm text-gray-400 dark:text-[#71767B] mt-0.5">
              {paciente.sexo === 'FEMENINO' ? 'Femenino' : paciente.sexo === 'MASCULINO' ? 'Masculino' : paciente.sexo || '—'}
              {paciente.edad ? ` · ${paciente.edad} años` : ''}
              {` · ID: #${paciente.id.slice(0, 8).toUpperCase()}`}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <div className="text-right">
              <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider">Teléfono</p>
              <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] mt-0.5">{paciente.telefono || '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider">Correo Electrónico</p>
              <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] mt-0.5">{paciente.email || '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider">Consultas Totales</p>
              <p className="text-sm font-bold text-primary-600 mt-0.5">{paciente.total_consultas} consulta{paciente.total_consultas !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-[#2F3336]">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {historialTabs.map((tab) => {
            const isActive = activeTab === tab.label;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(tab.label)}
                className={cn(
                  'inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
                  isActive
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300 dark:text-[#71767B] dark:hover:text-[#E7E9EA] dark:hover:border-[#536471]'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* ========== RESUMEN ========== */}
          {activeTab === 'Resumen' && (
            <>
              <div className="mb-4">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Línea de Tiempo - Consultas</h2>
              </div>
              {consultas.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200 dark:bg-[#16181C] dark:border-[#2F3336]">
                  <Calendar className="h-10 w-10 text-gray-300 dark:text-[#71767B] mx-auto mb-3" />
                  <p className="text-sm font-bold text-gray-400 dark:text-[#71767B]">No hay consultas registradas</p>
                  <Link href="/consultas/nueva" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary-600 hover:text-primary-800">
                    Crear consulta →
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {consultas.map((c) => (
                    <div key={c.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-[#2F3336] dark:bg-[#16181C]">
                      <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2F3336] px-4 py-3 sm:px-6">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-extrabold text-primary-700">{formatDate(c.fecha)}</span>
                          <span className={cn('inline-flex rounded-md px-2.5 py-0.5 text-[10px] font-extrabold ring-1 ring-inset', tipoConsultaColors[c.tipo_consulta] || 'bg-gray-50 text-gray-700 ring-gray-200 dark:bg-[#202327] dark:text-[#E7E9EA] dark:ring-[#2F3336]')}>
                            {c.tipo_consulta || 'CONSULTA'}
                          </span>
                          {c.folio && <span className="text-xs font-mono text-gray-400 dark:text-[#71767B]">{c.folio}</span>}
                        </div>
                        <Link href={`/consultas/${c.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-primary-600 hover:text-primary-800 transition-colors">
                          Ver detalle <span className="text-xs">→</span>
                        </Link>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-4 py-3 sm:px-6 sm:py-4">
                        <div>
                          <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider mb-1">Médico</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{c.doctor || '—'}</p>
                          {c.especialidad && <p className="text-xs text-gray-400 dark:text-[#71767B]">({c.especialidad})</p>}
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider mb-1">Diagnóstico</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] leading-snug">{c.diagnostico || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider mb-1">Tratamiento</p>
                          <p className="text-sm text-gray-600 dark:text-[#E7E9EA] leading-snug">{c.notas || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider mb-1">Cobro</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{formatMoney(c.monto, c.moneda)}</p>
                          <p className="text-xs text-gray-400 dark:text-[#71767B]">· {c.pagado ? 'Pagado' : 'Pendiente'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ========== CONSULTAS ========== */}
          {activeTab === 'Consultas' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Historial de Consultas</h2>
                <span className="text-sm text-gray-400 dark:text-[#71767B]">{consultas.length} consulta{consultas.length !== 1 ? 's' : ''}</span>
              </div>
              {consultas.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200 dark:bg-[#16181C] dark:border-[#2F3336]">
                  <Calendar className="h-10 w-10 text-gray-300 dark:text-[#71767B] mx-auto mb-3" />
                  <p className="text-sm font-bold text-gray-400 dark:text-[#71767B]">No hay consultas registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {consultas.map((c) => (
                    <div key={c.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[#2F3336] dark:bg-[#16181C]">
                      <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2F3336] px-4 py-3 sm:px-6">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-extrabold text-primary-700">{formatDate(c.fecha)}</span>
                          <span className="text-sm font-semibold text-gray-600 dark:text-[#E7E9EA]">· {c.doctor}</span>
                          {c.folio && <span className="text-xs font-mono text-gray-400 dark:text-[#71767B]">{c.folio}</span>}
                        </div>
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ring-inset',
                          c.pagado ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'
                        )}>
                          {c.pagado ? <><CheckCircle className="h-3 w-3" />Pagado</> : 'Pendiente'}
                        </span>
                      </div>
                      <div className="px-4 py-3 sm:px-6 sm:py-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider mb-1">Tipo de Consulta</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{c.tipo_consulta || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider mb-1">Diagnóstico</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{c.diagnostico || '—'}</p>
                          </div>
                        </div>
                        {c.procedimiento && (
                          <div>
                            <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider mb-1">Procedimiento</p>
                            <p className="text-sm text-gray-700 dark:text-[#E7E9EA]">{c.procedimiento}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider mb-1">Notas Clínicas</p>
                          <p className="text-sm text-gray-600 dark:text-[#E7E9EA] leading-relaxed bg-gray-50 dark:bg-[#202327] rounded-lg p-3">{c.notas || 'Sin notas'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ========== PROCEDIMIENTOS ========== */}
          {activeTab === 'Procedimientos' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Procedimientos Realizados</h2>
                <span className="text-sm text-gray-400 dark:text-[#71767B]">{consultasConProcedimiento.length} procedimiento{consultasConProcedimiento.length !== 1 ? 's' : ''}</span>
              </div>
              {consultasConProcedimiento.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200 dark:bg-[#16181C] dark:border-[#2F3336]">
                  <FlaskConical className="h-10 w-10 text-gray-300 dark:text-[#71767B] mx-auto mb-3" />
                  <p className="text-sm font-bold text-gray-400 dark:text-[#71767B]">No hay procedimientos registrados</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[#2F3336] dark:bg-[#16181C]">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-[#2F3336] bg-gray-50/50 dark:bg-[#202327]/50">
                          <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B]">Fecha</th>
                          <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B]">Procedimiento</th>
                          <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B]">Doctor</th>
                          <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B]">Diagnóstico</th>
                          <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-[#71767B]">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {consultasConProcedimiento.map((c) => (
                          <tr key={c.id} className="group hover:bg-gray-50/60 dark:hover:bg-[#202327]/60 transition-colors">
                            <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm font-bold text-primary-700">{formatDate(c.fecha)}</td>
                            <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{c.procedimiento}</td>
                            <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm text-gray-600 dark:text-[#E7E9EA]">{c.doctor}</td>
                            <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm text-gray-600 dark:text-[#E7E9EA] max-w-xs">{c.diagnostico}</td>
                            <td className="px-4 py-3 sm:px-6 sm:py-4">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                                <CheckCircle className="h-3 w-3" />Completado
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ========== LENTES ========== */}
          {activeTab === 'Lentes' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Historial de Lentes</h2>
              </div>
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200 dark:bg-[#16181C] dark:border-[#2F3336]">
                <Glasses className="h-10 w-10 text-gray-300 dark:text-[#71767B] mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-400 dark:text-[#71767B]">Módulo de lentes en desarrollo</p>
                <p className="text-xs text-gray-400 dark:text-[#71767B] mt-1">Próximamente se conectarán los lentes del inventario al historial del paciente</p>
              </div>
            </>
          )}

          {/* ========== ESTUDIOS ========== */}
          {activeTab === 'Estudios' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Estudios Diagnósticos</h2>
                <span className="text-sm text-gray-400 dark:text-[#71767B]">{estudiosFromConsultas.length} estudio{estudiosFromConsultas.length !== 1 ? 's' : ''}</span>
              </div>
              {estudiosFromConsultas.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200 dark:bg-[#16181C] dark:border-[#2F3336]">
                  <Eye className="h-10 w-10 text-gray-300 dark:text-[#71767B] mx-auto mb-3" />
                  <p className="text-sm font-bold text-gray-400 dark:text-[#71767B]">No hay estudios registrados</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {estudiosFromConsultas.map((e) => (
                    <div key={e.id} className="flex items-center gap-5 rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm transition-all hover:shadow-md dark:border-[#2F3336] dark:bg-[#16181C]">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 ring-1 ring-sky-100">
                        <Eye className="h-5 w-5 text-sky-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{e.estudio}</h3>
                          <span className="text-xs text-gray-400 dark:text-[#71767B]">·</span>
                          <span className="text-xs text-gray-400 dark:text-[#71767B]">{e.doctor}</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-[#E7E9EA] mt-1">{e.resultado}</p>
                        <p className="text-xs text-gray-400 dark:text-[#71767B] mt-1">{formatDate(e.fecha)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-[360px] shrink-0 space-y-5">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[#2F3336] dark:bg-[#16181C]">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-5 py-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Diagnósticos</h3>
            </div>
            <div className="p-4 space-y-2">
              {diagnosticos.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-[#71767B]">Sin diagnósticos registrados</p>
              ) : (
                diagnosticos.map((d, idx) => (
                  <div key={idx} className="rounded-lg p-3 ring-1 ring-inset bg-red-50 text-red-700 ring-red-200">
                    <p className="text-sm font-bold leading-snug">{d}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[#2F3336] dark:bg-[#16181C]">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-5 py-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Información del Paciente</h3>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-[#2F3336]">
              <div className="px-5 py-3">
                <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider">Dirección</p>
                <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] mt-1">{paciente.direccion || '—'}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider">Fecha de Nacimiento</p>
                <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] mt-1">{formatDate(paciente.fecha_nacimiento)}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[10px] text-gray-400 dark:text-[#71767B] uppercase font-semibold tracking-wider">Paciente desde</p>
                <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] mt-1">{formatDate(paciente.created_at)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
