'use client';

import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { useUser } from '@/hooks/useUser';
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
import ClientDate from '@/components/ui/ClientDate';
import Skeleton from '@/components/ui/Skeleton';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import BadgeCompletar from '@/components/ui/BadgeCompletar';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { enviarJSON } from '@/lib/fetcher';
import { validarNombrePaciente } from '@/lib/import-agenda';
import FichaPaciente from '@/components/ui/FichaPaciente';
import EditorTelefonos from '@/components/pacientes/EditorTelefonos';
import ListaTelefonos from '@/components/pacientes/ListaTelefonos';
import { normalizarTelefonos, telefonoPrincipal, type TelefonoPaciente } from '@/lib/telefonos-paciente';

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
  numero_expediente?: string | null;
  telefono: string;
  telefonos?: TelefonoPaciente[];
  email: string;
  direccion: string;
  created_at: string;
  consultas: ConsultaData[];
  total_consultas: number;
  /** Alta automática por importación con datos por completar */
  pendiente_completar?: boolean;
  faltantes?: string[];
}

/** Edición de la ficha (completar datos tras una importación). */
function EditarPacienteModal({
  paciente,
  abierto,
  onClose,
  onGuardado,
}: {
  paciente: PacienteData;
  abierto: boolean;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    nombre_completo: paciente.nombre_completo || '',
    numero_expediente: paciente.numero_expediente || '',
    sexo: paciente.sexo || '',
    fecha_nacimiento: paciente.fecha_nacimiento || '',
    telefono: paciente.telefono || '',
    email: paciente.email || '',
    direccion: paciente.direccion || '',
  });
  const [telefonos, setTelefonos] = useState<TelefonoPaciente[]>(() => normalizarTelefonos(paciente.telefonos, paciente.telefono));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const guardar = async () => {
    const nombre = validarNombrePaciente(form.nombre_completo);
    if (!nombre.ok) { setError(nombre.motivo); return; }
    const listaTel = normalizarTelefonos(telefonos);
    if (listaTel.some((t) => t.numero.replace(/\D/g, '').length < 10)) { setError('Cada teléfono debe tener al menos 10 dígitos'); return; }
    setGuardando(true);
    setError(null);
    try {
      await enviarJSON(`/api/pacientes/${paciente.id}`, 'PATCH', {
        nombre_completo: nombre.nombre,
        numero_expediente: form.numero_expediente.trim() || null,
        ...(form.sexo ? { sexo: form.sexo } : {}),
        ...(form.fecha_nacimiento ? { fecha_nacimiento: form.fecha_nacimiento } : {}),
        telefono: telefonoPrincipal(listaTel),
        telefonos: listaTel,
        email: form.email.trim() || null,
        direccion: form.direccion.trim() || null,
      });
      toast('Datos del paciente guardados', 'success');
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const campo = 'mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-primary-500 focus:outline-none';
  const etiqueta = 'text-xs font-bold text-fg-2';
  return (
    <Modal isOpen={abierto} onClose={onClose}>
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-fg">Datos del paciente</h3>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className={etiqueta}>Nombre completo *</span><input className={campo} value={form.nombre_completo} onChange={set('nombre_completo')} /></label>
          <label><span className={etiqueta}>Número de expediente</span><input maxLength={50} className={campo} value={form.numero_expediente} onChange={set('numero_expediente')} /></label>
          <label><span className={etiqueta}>Sexo</span>
            <select className={campo} value={form.sexo} onChange={set('sexo')}>
              <option value="">Sin especificar</option>
              <option value="FEMENINO">Femenino</option>
              <option value="MASCULINO">Masculino</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
          <label><span className={etiqueta}>Fecha de nacimiento</span><input type="date" className={campo} value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')} /></label>
          <div className="sm:col-span-2"><span className={etiqueta}>Teléfonos (hasta 3)</span><div className="mt-1"><EditorTelefonos value={telefonos} onChange={setTelefonos} inputClassName={campo.replace('mt-1 ', '')} /></div></div>
          <label><span className={etiqueta}>Correo electrónico</span><input type="email" className={campo} value={form.email} onChange={set('email')} /></label>
          <label className="sm:col-span-2"><span className={etiqueta}>Dirección</span><input className={campo} value={form.direccion} onChange={set('direccion')} /></label>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </Modal>
  );
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
  monto?: number;
  moneda: string;
  metodo_pago?: string;
  pagado?: boolean;
}

const tipoConsultaColors: Record<string, string> = {
  'CONSULTA': 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
  'ESTUDIO': 'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/30',
  'REVISION': 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  'PROCEDIMIENTO': 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
};

function formatMoney(amount: number, currency: string) {
  if (!amount) return '—';
  return currency === 'DOLARES' ? `$${amount.toLocaleString('en-US')} USD` : `$${amount.toLocaleString('es-MX')} MXN`;
}

export default function HistorialMedicoPage() {
  const params = useParams();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState('Resumen');
  // Enfermería: solo lectura clínica (sin cobros, sin crear ni abrir consultas)
  const { user } = useUser();
  const soloLectura = user?.rol === 'enfermero';
  const puedeEditar = user?.rol === 'admin' || user?.rol === 'recepcionista';
  const [editando, setEditando] = useState(false);
  // ?editar=1 (desde el detalle de una consulta): abre la edición de datos.
  useEffect(() => {
    if (puedeEditar && new URLSearchParams(window.location.search).get('editar') === '1') setEditando(true);
  }, [puedeEditar]);
  // Caché compartida: al volver a esta pantalla se muestra lo último y se revalida en segundo plano.
  const { data: paciente, error: swrError, isLoading: loading, isValidating, mutate } = useSWR<PacienteData>(
    id ? `/api/pacientes/${id}` : null
  );
  const error = swrError ? (swrError instanceof Error && swrError.message ? swrError.message : 'Error al cargar paciente') : '';

  const derivados = useMemo(() => {
    const consultas = paciente?.consultas || [];
    return {
      consultas,
      consultasConProcedimiento: consultas.filter((c) => c.procedimiento),
      estudiosFromConsultas: consultas.flatMap((c) =>
        (c.estudios || []).map((est, j) => ({
          id: `${c.id}-${j}`,
          fecha: c.fecha,
          estudio: est,
          doctor: c.doctor,
          ojo: 'OD / OI',
          resultado: c.diagnostico,
        }))
      ),
      // Unique diagnoses from consultations
      diagnosticos: Array.from(new Set(consultas.map((c) => c.diagnostico).filter(Boolean))),
    };
  }, [paciente]);

  if (loading && !paciente) {
    return (
      <div className="mx-auto max-w-[1440px] space-y-6" aria-busy="true">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <div className="space-y-2 min-w-0">
            <Skeleton className="h-7 w-64 sm:w-80 max-w-full" />
            <Skeleton className="h-4 w-48 sm:w-64 max-w-full" />
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-line dark:bg-surface">
          <div className="flex items-center gap-6">
            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2 min-w-0">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
        </div>
        <div className="flex gap-1 border-b border-line overflow-x-auto">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-t-lg shrink-0" />
          ))}
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white dark:border-line dark:bg-surface">
                <div className="flex items-center gap-3 border-b border-line/70 px-6 py-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-6 py-4">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="space-y-1">
                      <Skeleton className="h-2.5 w-16" />
                      <Skeleton className="h-3.5 w-28 max-w-full" />
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

  if (!paciente) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] animate-fadeIn">
        <div className="text-center space-y-3">
          <p className="text-sm font-bold text-red-600">{error || 'Paciente no encontrado'}</p>
          <Link href="/pacientes" className="inline-flex items-center gap-2 text-sm font-bold text-primary-600 hover:text-primary-800">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
        </div>
      </div>
    );
  }

  const { consultas, consultasConProcedimiento, estudiosFromConsultas, diagnosticos } = derivados;
  const listaTelefonos = normalizarTelefonos(paciente.telefonos, paciente.telefono);

  return (
    <div className="relative mx-auto max-w-[1440px] space-y-6" aria-busy={isValidating}>
      <BarraRevalidando activo={isValidating} className="-top-2" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Link
          href="/pacientes"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 dark:border-line dark:bg-surface dark:text-fg dark:hover:bg-surface-2 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-fg break-words">
            HISTORIAL MÉDICO - {paciente.nombre_completo}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Consulta, diagnósticos y tratamientos detallados del paciente.
          </p>
        </div>
      </div>

      {/* Patient info card */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line dark:bg-surface">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-purple-500 text-xl font-bold text-white">
            {paciente.iniciales || '??'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-fg">{paciente.nombre_completo}</h2>
              {paciente.pendiente_completar && <BadgeCompletar faltantes={paciente.faltantes} />}
              {puedeEditar && (
                <button onClick={() => setEditando(true)} className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-primary-600 hover:bg-surface-2">
                  {paciente.pendiente_completar ? 'Completar datos' : 'Editar datos'}
                </button>
              )}
            </div>
            <FichaPaciente
              variante="linea"
              className="mt-0.5"
              expediente={paciente.numero_expediente}
              sexo={paciente.sexo}
              fechaNacimiento={paciente.fecha_nacimiento}
              edad={paciente.edad}
            />
            {listaTelefonos.length > 0 && (
              <ListaTelefonos telefonos={listaTelefonos} className="mt-3 md:hidden" />
            )}
          </div>
          <div className="hidden md:flex items-start gap-8">
            <div className="text-right">
              <p className="mb-1.5 text-[10px] text-muted uppercase font-semibold tracking-wider">Teléfono{listaTelefonos.length > 1 ? 's' : ''}</p>
              <ListaTelefonos telefonos={listaTelefonos} alineacion="derecha" />
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase font-semibold tracking-wider">Correo Electrónico</p>
              <p className="text-sm font-bold text-fg mt-0.5">{paciente.email || '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase font-semibold tracking-wider">Consultas Totales</p>
              <p className="text-sm font-bold text-primary-600 mt-0.5">{paciente.total_consultas} consulta{paciente.total_consultas !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      </div>

      {paciente.pendiente_completar && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Este paciente se dio de alta desde una importación.
          {paciente.faltantes && paciente.faltantes.length > 0 && <> Falta: <b>{paciente.faltantes.join(', ')}</b>.</>}
          {puedeEditar ? ' Complétalo para futuras consultas y cirugías.' : ' Pide a recepción que complete su ficha.'}
        </div>
      )}
      {puedeEditar && editando && (
        <EditarPacienteModal
          paciente={paciente}
          abierto={editando}
          onClose={() => setEditando(false)}
          onGuardado={() => { setEditando(false); void mutate(); }}
        />
      )}

      {/* Tabs */}
      <div className="border-b border-line">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {historialTabs.map((tab) => {
            const isActive = activeTab === tab.label;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(tab.label)}
                className={cn(
                  'inline-flex items-center gap-2 whitespace-nowrap px-3 sm:px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
                  isActive
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300 dark:text-muted dark:hover:text-fg dark:hover:border-line-strong'
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
        <div key={activeTab} className="flex-1 min-w-0 animate-fadeIn">
          {/* ========== RESUMEN ========== */}
          {activeTab === 'Resumen' && (
            <>
              <div className="mb-4">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-fg">Línea de Tiempo - Consultas</h2>
              </div>
              {consultas.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200 dark:bg-surface dark:border-line">
                  <Calendar className="h-10 w-10 text-gray-300 dark:text-muted mx-auto mb-3" />
                  <p className="text-sm font-bold text-muted">No hay consultas registradas</p>
                  {!soloLectura && (
                    <Link href="/consultas/nueva" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary-600 hover:text-primary-800">
                      Crear consulta →
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-4 anim-lista">
                  {consultas.map((c) => (
                    <div key={c.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-line dark:bg-surface">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-4 py-3 sm:px-6">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <span className="text-sm font-extrabold text-primary-700 dark:text-primary-400"><ClientDate date={c.fecha} options={{ day: 'numeric', month: 'short', year: 'numeric' }} /></span>
                          <span className={cn('inline-flex rounded-md px-2.5 py-0.5 text-[10px] font-extrabold ring-1 ring-inset', tipoConsultaColors[c.tipo_consulta] || 'bg-gray-50 text-gray-700 ring-gray-200 dark:bg-surface-2 dark:text-fg dark:ring-line')}>
                            {c.tipo_consulta || 'CONSULTA'}
                          </span>
                          {c.folio && <span className="text-xs font-mono text-muted">{c.folio}</span>}
                        </div>
                        {!soloLectura && (
                          <Link href={`/consultas/${c.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-primary-600 hover:text-primary-800 transition-colors">
                            Ver detalle <span className="text-xs">→</span>
                          </Link>
                        )}
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 py-3 sm:px-6 sm:py-4">
                        <div>
                          <p className="text-[10px] text-muted uppercase font-semibold tracking-wider mb-1">Médico</p>
                          <p className="text-sm font-bold text-fg">{c.doctor || '—'}</p>
                          {c.especialidad && <p className="text-xs text-muted">({c.especialidad})</p>}
                        </div>
                        <div>
                          <p className="text-[10px] text-muted uppercase font-semibold tracking-wider mb-1">Diagnóstico</p>
                          <p className="text-sm font-bold text-fg leading-snug">{c.diagnostico || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted uppercase font-semibold tracking-wider mb-1">Tratamiento</p>
                          <p className="text-sm text-fg-2 leading-snug">{c.notas || '—'}</p>
                        </div>
                        {c.monto !== undefined && (
                          <div>
                            <p className="text-[10px] text-muted uppercase font-semibold tracking-wider mb-1">Cobro</p>
                            <p className="text-sm font-bold text-fg">{formatMoney(c.monto, c.moneda)}</p>
                            <p className="text-xs text-muted">· {c.pagado ? 'Pagado' : 'Pendiente'}</p>
                          </div>
                        )}
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
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-fg">Historial de Consultas</h2>
                <span className="text-sm text-muted">{consultas.length} consulta{consultas.length !== 1 ? 's' : ''}</span>
              </div>
              {consultas.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200 dark:bg-surface dark:border-line">
                  <Calendar className="h-10 w-10 text-gray-300 dark:text-muted mx-auto mb-3" />
                  <p className="text-sm font-bold text-muted">No hay consultas registradas</p>
                </div>
              ) : (
                <div className="space-y-4 anim-lista">
                  {consultas.map((c) => (
                    <div key={c.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line dark:bg-surface">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-4 py-3 sm:px-6">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <span className="text-sm font-extrabold text-primary-700 dark:text-primary-400"><ClientDate date={c.fecha} options={{ day: 'numeric', month: 'short', year: 'numeric' }} /></span>
                          <span className="text-sm font-semibold text-fg-2">· {c.doctor}</span>
                          {c.folio && <span className="text-xs font-mono text-muted">{c.folio}</span>}
                        </div>
                        {c.monto !== undefined && (
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ring-inset',
                          c.pagado ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30' : 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30'
                        )}>
                          {c.pagado ? <><CheckCircle className="h-3 w-3" />Pagado</> : 'Pendiente'}
                        </span>
                        )}
                      </div>
                      <div className="px-4 py-3 sm:px-6 sm:py-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] text-muted uppercase font-semibold tracking-wider mb-1">Tipo de Consulta</p>
                            <p className="text-sm font-bold text-fg">{c.tipo_consulta || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted uppercase font-semibold tracking-wider mb-1">Diagnóstico</p>
                            <p className="text-sm font-bold text-fg">{c.diagnostico || '—'}</p>
                          </div>
                        </div>
                        {c.procedimiento && (
                          <div>
                            <p className="text-[10px] text-muted uppercase font-semibold tracking-wider mb-1">Procedimiento</p>
                            <p className="text-sm text-fg-2">{c.procedimiento}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] text-muted uppercase font-semibold tracking-wider mb-1">Notas Clínicas</p>
                          <p className="text-sm text-fg-2 leading-relaxed bg-surface-2 rounded-lg p-3">{c.notas || 'Sin notas'}</p>
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
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-fg">Procedimientos Realizados</h2>
                <span className="text-sm text-muted">{consultasConProcedimiento.length} procedimiento{consultasConProcedimiento.length !== 1 ? 's' : ''}</span>
              </div>
              {consultasConProcedimiento.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200 dark:bg-surface dark:border-line">
                  <FlaskConical className="h-10 w-10 text-gray-300 dark:text-muted mx-auto mb-3" />
                  <p className="text-sm font-bold text-muted">No hay procedimientos registrados</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line dark:bg-surface">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                      <thead>
                        <tr className="border-b border-line/70 bg-gray-50/50 dark:bg-surface-2/50">
                          <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-muted">Fecha</th>
                          <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-muted">Procedimiento</th>
                          <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-muted">Doctor</th>
                          <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-muted">Diagnóstico</th>
                          <th className="px-4 py-3 sm:px-6 text-left text-xs font-bold uppercase tracking-wider text-muted">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60">
                        {consultasConProcedimiento.map((c) => (
                          <tr key={c.id} className="group hover:bg-gray-50/60 dark:hover:bg-surface-2/60 transition-colors">
                            <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm font-bold text-primary-700 dark:text-primary-400 whitespace-nowrap"><ClientDate date={c.fecha} options={{ day: 'numeric', month: 'short', year: 'numeric' }} /></td>
                            <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm font-bold text-fg">{c.procedimiento}</td>
                            <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm text-fg-2">{c.doctor}</td>
                            <td className="px-4 py-3 sm:px-6 sm:py-4 text-sm text-fg-2 max-w-xs">{c.diagnostico}</td>
                            <td className="px-4 py-3 sm:px-6 sm:py-4">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
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
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-fg">Historial de Lentes</h2>
              </div>
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200 dark:bg-surface dark:border-line">
                <Glasses className="h-10 w-10 text-gray-300 dark:text-muted mx-auto mb-3" />
                <p className="text-sm font-bold text-muted">Módulo de lentes en desarrollo</p>
                <p className="text-xs text-muted mt-1">Próximamente se conectarán los lentes del inventario al historial del paciente</p>
              </div>
            </>
          )}

          {/* ========== ESTUDIOS ========== */}
          {activeTab === 'Estudios' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-fg">Estudios Diagnósticos</h2>
                <span className="text-sm text-muted">{estudiosFromConsultas.length} estudio{estudiosFromConsultas.length !== 1 ? 's' : ''}</span>
              </div>
              {estudiosFromConsultas.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200 dark:bg-surface dark:border-line">
                  <Eye className="h-10 w-10 text-gray-300 dark:text-muted mx-auto mb-3" />
                  <p className="text-sm font-bold text-muted">No hay estudios registrados</p>
                </div>
              ) : (
                <div className="space-y-3 anim-lista">
                  {estudiosFromConsultas.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 sm:gap-5 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4 shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-line dark:bg-surface">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 ring-1 ring-sky-100 dark:bg-sky-500/10 dark:ring-sky-500/30">
                        <Eye className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <h3 className="text-sm font-bold text-fg">{e.estudio}</h3>
                          <span className="text-xs text-muted">·</span>
                          <span className="text-xs text-muted">{e.doctor}</span>
                        </div>
                        <p className="text-sm text-fg-2 mt-1">{e.resultado}</p>
                        <p className="text-xs text-muted mt-1"><ClientDate date={e.fecha} options={{ day: 'numeric', month: 'short', year: 'numeric' }} /></p>
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
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line dark:bg-surface">
            <div className="border-b border-line/70 px-5 py-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg">Diagnósticos</h3>
            </div>
            <div className="p-4 space-y-2">
              {diagnosticos.length === 0 ? (
                <p className="text-sm text-muted">Sin diagnósticos registrados</p>
              ) : (
                diagnosticos.map((d) => (
                  <div key={d} className="rounded-lg p-3 ring-1 ring-inset bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30">
                    <p className="text-sm font-bold leading-snug">{d}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line dark:bg-surface">
            <div className="border-b border-line/70 px-5 py-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg">Información del Paciente</h3>
            </div>
            <div className="divide-y divide-line/60">
              <div className="px-5 py-3">
                <p className="text-[10px] text-muted uppercase font-semibold tracking-wider">Dirección</p>
                <p className="text-sm font-bold text-fg mt-1">{paciente.direccion || '—'}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[10px] text-muted uppercase font-semibold tracking-wider">Fecha de Nacimiento</p>
                <p className="text-sm font-bold text-fg mt-1">{paciente.fecha_nacimiento
                  ? <ClientDate date={paciente.fecha_nacimiento} options={{ day: 'numeric', month: 'short', year: 'numeric' }} />
                  : <span className="font-medium text-amber-600 dark:text-amber-400">Sin capturar</span>}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[10px] text-muted uppercase font-semibold tracking-wider">Paciente desde</p>
                <p className="text-sm font-bold text-fg mt-1"><ClientDate date={paciente.created_at} options={{ day: 'numeric', month: 'short', year: 'numeric' }} /></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
