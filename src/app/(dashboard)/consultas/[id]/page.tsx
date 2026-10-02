'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer, Edit3, Clock, CheckCircle2, AlertCircle, FileText, User, Stethoscope, Calendar, CreditCard, Activity, Shield, Scissors, CalendarPlus, Loader2, Banknote } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Avatar from '@/components/ui/Avatar';
import StatusBadge from '@/components/ui/StatusBadge';
import ClientDate from '@/components/ui/ClientDate';
import Skeleton from '@/components/ui/Skeleton';
import { useUser } from '@/hooks/useUser';
import { useInvalidar } from '@/hooks/useFetch';
import { useEspecialidades } from '@/hooks/useEspecialidades';
import { TIPOS_CONSULTA_AGENDA, etiquetaTipoConsulta, tipoAgendaDesdeBd, valoresBdTipoConsulta, type TipoConsultaAgenda } from '@/lib/catalogos/tipos-consulta';
import { enviarJSON } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import EnviarPaciente from '@/components/ui/EnviarPaciente';
import AgendarEstudioModal from '@/components/consultations/AgendarEstudioModal';
import ConsultaAccionesFab from '@/components/consultations/ConsultaAccionesFab';

interface EstudioDetalle {
  nombre: string;
  doctor: string | null;
}

interface PacienteInfo {
  nombre_completo: string;
  fecha_nacimiento: string | null;
  telefono: string | null;
  sexo: string | null;
  email?: string | null;
  aseguradora?: string | null;
}

interface ConsultaDetalle {
  id: string;
  folio: string | null;
  paciente: string;
  iniciales: string;
  paciente_id: string;
  doctor: string;
  doctor_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  tipo_consulta: string | null;
  tipo_visita: string | null;
  especialidad_id?: string | null;
  especialidad?: string | null;
  diagnostico: string | null;
  estudio_1: string | null;
  estudio_2: string | null;
  estudio_3: string | null;
  est1_doctor: string | null;
  est2_doctor: string | null;
  est3_doctor: string | null;
  estudio_1_doctor_id?: string | null;
  estudio_2_doctor_id?: string | null;
  estudio_3_doctor_id?: string | null;
  procedimiento: string | null;
  proc_doctor: string | null;
  notas: string | null;
  estatus: string;
  estatus_pago: string;
  costo_total: number;
  monto_pagado: number;
  metodo_pago: string | null;
  paciente_sexo: string | null;
  paciente_telefono: string | null;
  paciente_fecha_nacimiento: string | null;
  paciente_email: string | null;
  paciente_poliza: string | null;
  paciente_afiliacion: string | null;
  created_at: string;
  pacientes?: PacienteInfo | null;
}

interface DetalleRespuesta {
  consulta?: ConsultaDetalle | null;
  aseguranza?: { id: string; nombre: string } | null;
  cobertura?: { porcentaje_cobertura: number; copago_fijo: number | null; aplica_estudios: boolean; aplica_procedimientos: boolean } | null;
}

interface CirugiaRelacionada {
  id: string;
  codigo: string | null;
  estado: string;
  fecha: string | null;
  ojo: string | null;
  servicio?: { nombre?: string } | null;
}

interface HistorialEvento {
  id: string;
  tipo_evento: string;
  payload: Record<string, unknown>;
  created_at: string;
  usuario_nombre: string | null;
}

const SIN_EVENTOS: HistorialEvento[] = [];
const SIN_CIRUGIAS: CirugiaRelacionada[] = [];

const estatusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  BORRADOR: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  AGENDADA: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  PROCESADA: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  PENDIENTE_ESTUDIO: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  PENDIENTE_CIRUGIA: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  APLAZADA: { bg: 'bg-amber-50', text: 'text-amber-800', dot: 'bg-amber-600' },
  REAGENDADA: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  COMPLETADA: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  CANCELADA: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

const estatusPagoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  PAGADO: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  PENDIENTE_PAGO: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
};

const eventoIcons: Record<string, typeof CheckCircle2> = {
  CREACION: FileText,
  CAMBIO_ESTATUS: Clock,
  EDICION: Edit3,
  CANCELACION: AlertCircle,
  REAGENDADO: Calendar,
  PAGADO: CreditCard,
  FINALIZADO: CheckCircle2,
};

const eventoLabels: Record<string, string> = {
  CREACION: 'Consulta creada',
  CAMBIO_ESTATUS: 'Cambio de estatus',
  EDICION: 'Edición',
  CANCELACION: 'Cancelación',
  REAGENDADO: 'Reagendado',
  PAGADO: 'Pago registrado',
  FINALIZADO: 'Consulta finalizada',
};

const estatusLabels: Record<string, string> = {
  BORRADOR: 'Borrador',
  AGENDADA: 'Agendada',
  PROCESADA: 'Procesada',
  PENDIENTE_ESTUDIO: 'Pendiente Estudio',
  PENDIENTE_CIRUGIA: 'Pendiente Cirugía',
  APLAZADA: 'Aplazada',
  REAGENDADA: 'Reagendada',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
};

const estatusPagoLabels: Record<string, string> = {
  PENDIENTE_PAGO: 'Pendiente de Pago',
  PAGADO: 'Pagado',
};

function Field({ label, value, full }: { label: string; value: string | null | undefined; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</span>
      <p className="mt-0.5 text-sm font-medium text-fg">{value || '—'}</p>
    </div>
  );
}

function ConsultaDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-line dark:bg-surface">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-line dark:bg-surface">
            <Skeleton className="mb-6 h-5 w-44" />
            <div className="grid grid-cols-2 gap-6">
              {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-line dark:bg-surface">
            <Skeleton className="mb-6 h-5 w-40" />
            <Skeleton className="h-28 w-full" />
          </div>
        </div>
        <div className="space-y-6">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function ConsultaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { toast } = useToast();
  const invalidar = useInvalidar();

  // Lecturas con caché compartida (SWR): al volver a la pantalla o tras guardar
  // solo se refrescan los datos; nunca se vacía la vista.
  const consultaKey = id ? `/api/consultas/${id}` : null;
  const {
    data: detalle,
    error: detalleError,
    isLoading: loading,
    isValidating: validandoDetalle,
    mutate: mutateDetalle,
  } = useSWR<DetalleRespuesta>(consultaKey);
  const { data: historialResp, mutate: mutateHistorial } = useSWR<{ data?: HistorialEvento[] }>(
    id ? `/api/consultas/${id}/historial` : null
  );
  const { data: cirugiasResp } = useSWR<{ data?: CirugiaRelacionada[] }>(
    id ? `/api/cirugias?consulta_id=${id}` : null
  );

  const consulta = detalle?.consulta ?? null;
  const historial = historialResp?.data ?? SIN_EVENTOS;
  const cirugiasRelacionadas = cirugiasResp?.data ?? SIN_CIRUGIAS;
  const aseguradoraData = detalle && (detalle.aseguranza || detalle.cobertura)
    ? { aseguradora: detalle.aseguranza ?? null, cobertura: detalle.cobertura ?? null }
    : null;
  const error = detalleError
    ? (detalleError instanceof Error && detalleError.message ? detalleError.message : 'Error al cargar')
    : detalle && !detalle.consulta
      ? 'Consulta no encontrada'
      : null;

  const { data: consultasPaciente, mutate: mutateConsultasPaciente } = useSWR<{ data?: Array<{ id: string; tipo_consulta?: string | null; estudio_1?: string | null; estudio_2?: string | null; estudio_3?: string | null }> }>(
    consulta?.paciente_id ? `/api/consultas?paciente_id=${consulta.paciente_id}&pageSize=200` : null
  );
  // Estudios recién agendados desde esta pantalla (se muestran al instante).
  const [estudiosAgendadosLocal, setEstudiosAgendadosLocal] = useState<Record<string, string>>({});
  const estudiosAgendados = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of consultasPaciente?.data || []) {
      if (c.tipo_consulta?.toUpperCase() === 'ESTUDIO') {
        if (c.estudio_1) mapa.set(c.estudio_1, c.id);
        if (c.estudio_2) mapa.set(c.estudio_2, c.id);
        if (c.estudio_3) mapa.set(c.estudio_3, c.id);
      }
    }
    for (const [nombre, cid] of Object.entries(estudiosAgendadosLocal)) mapa.set(nombre, cid);
    return mapa;
  }, [consultasPaciente, estudiosAgendadosLocal]);

  const [showPatientDetails, setShowPatientDetails] = useState(false);
  const [estudioAAgendar, setEstudioAAgendar] = useState<{
    nombre: string;
    doctor_id?: string | null;
    doctor_nombre?: string | null;
  } | null>(null);
  const [edadPaciente, setEdadPaciente] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editCosto, setEditCosto] = useState('');
  const [editNotas, setEditNotas] = useState('');
  // Punto II: especialidad y tipo de consulta editables
  const [editEspecialidadId, setEditEspecialidadId] = useState('');
  const [editTipo, setEditTipo] = useState<TipoConsultaAgenda>('PRIMERA');
  const { especialidades } = useEspecialidades();
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  /**
   * PATCH optimista: aplica `cambios` a la consulta en caché, envía, fusiona la
   * respuesta del servidor y revierte si falla. Luego refresca historial y las
   * listas/resúmenes afectados en segundo plano.
   */
  const patchConsulta = useCallback(async (body: Record<string, unknown>, cambios: Partial<ConsultaDetalle>) => {
    if (!consultaKey) return;
    const aplicar = (actual: DetalleRespuesta | undefined, extra: Partial<ConsultaDetalle>): DetalleRespuesta | undefined =>
      actual?.consulta ? { ...actual, consulta: { ...actual.consulta, ...extra } } : actual;
    await mutateDetalle(
      async (actual) => {
        const updated = await enviarJSON<Partial<ConsultaDetalle>>(consultaKey, 'PATCH', body);
        return aplicar(actual, { ...cambios, ...(updated || {}) });
      },
      {
        optimisticData: (actual) => aplicar(actual, cambios) as DetalleRespuesta,
        rollbackOnError: true,
        populateCache: true,
        revalidate: false,
      },
    );
    void mutateHistorial();
    void invalidar('/api/consultas', '/api/agenda', '/api/dashboard', '/api/pacientes');
  }, [consultaKey, mutateDetalle, mutateHistorial, invalidar]);

  useEffect(() => {
    if (consulta?.paciente_fecha_nacimiento) {
      const edad = Math.floor((Date.now() - new Date(consulta.paciente_fecha_nacimiento).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      setEdadPaciente(`${edad} años`);
    }
  }, [consulta?.paciente_fecha_nacimiento]);

  function handlePrint() {
    window.print();
  }

  async function handleMarkPaid() {
    if (paying) return;
    setPaying(true);
    try {
      const monto = consulta?.costo_total || 0;
      await patchConsulta({ estatus_pago: 'PAGADO', monto_pagado: monto }, { estatus_pago: 'PAGADO', monto_pagado: monto });
      toast('Pago registrado');
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : 'Error al registrar el pago', 'error');
    } finally {
      setPaying(false);
    }
  }

  function startEditing() {
    setEditCosto(String(consulta?.costo_total ?? 0));
    setEditNotas(consulta?.notas || '');
    setEditEspecialidadId(consulta?.especialidad_id || '');
    setEditTipo(tipoAgendaDesdeBd(consulta?.tipo_consulta, consulta?.tipo_visita));
    setEditError(null);
    setEditing(true);
  }

  async function handleComplete() {
    if (completing) return;
    setCompleting(true);
    try {
      await patchConsulta({ estatus: 'COMPLETADA' }, { estatus: 'COMPLETADA' });
      toast('Consulta completada');
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : 'Error al completar la consulta', 'error');
    } finally {
      setCompleting(false);
    }
  }

  async function handleSaveEdit() {
    if (!consulta || savingEdit) return;
    const body: Record<string, unknown> = {};
    if ((consulta.notas || '') !== editNotas) body.notas = editNotas;
    if ((consulta.especialidad_id || '') !== editEspecialidadId) body.especialidad_id = editEspecialidadId || null;
    if (tipoAgendaDesdeBd(consulta.tipo_consulta, consulta.tipo_visita) !== editTipo) {
      Object.assign(body, valoresBdTipoConsulta(editTipo));
    }
    if (consulta.estatus_pago !== 'PAGADO') {
      const costo = Number(editCosto);
      if (!Number.isFinite(costo) || costo < 0) {
        setEditError('Costo total inválido');
        return;
      }
      if (costo !== consulta.costo_total) body.costo_total = costo;
    }
    if (Object.keys(body).length === 0) {
      setEditing(false);
      setEditError(null);
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const optimista: Partial<ConsultaDetalle> = { ...(body as Partial<ConsultaDetalle>) };
      if ('especialidad_id' in body) {
        optimista.especialidad = especialidades.find((e) => e.id === body.especialidad_id)?.nombre ?? null;
      }
      await patchConsulta(body, optimista);
      setEditing(false);
      toast('Cambios guardados');
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : 'Error al guardar';
      setEditError(msg);
      toast(msg, 'error');
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading && !consulta) {
    return <ConsultaDetailSkeleton />;
  }

  if (!consulta) {
    return (
      <div className="text-center py-12 animate-fadeIn">
        <p className="text-gray-500 dark:text-gray-400">{error || 'Consulta no encontrada'}</p>
        <button onClick={() => router.push('/agenda')} className="mt-4 text-primary-600 hover:text-primary-700 text-sm font-semibold">
          Volver a Consultas
        </button>
      </div>
    );
  }

  const consultaCerrada = consulta.estatus === 'COMPLETADA' || consulta.estatus === 'CANCELADA';

  return (
    <div className="print-page relative" aria-busy={validandoDetalle}>
      <BarraRevalidando activo={validandoDetalle} className="-top-2 no-print" />
      <PageHeader
        title={`Consulta ${consulta.folio || consulta.id.slice(0, 8)}`}
        subtitle={`${consulta.paciente || 'Sin paciente'} — ${consulta.fecha}`}
        backLink={{ href: '/agenda', label: 'Agenda' }}
        action={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-fg-2 hover:bg-surface-2 transition-colors no-print sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            <EnviarPaciente
              cita={{
                tipo: 'consulta',
                paciente: consulta.paciente,
                fecha: consulta.fecha,
                hora: consulta.hora_inicio,
                doctor: consulta.doctor,
                detalle: [consulta.especialidad, etiquetaTipoConsulta(consulta.tipo_consulta, consulta.tipo_visita)].filter(Boolean).join(' · ') || null,
                folio: consulta.folio,
              }}
              telefono={consulta.paciente_telefono}
              email={consulta.paciente_email}
            />
            {(user?.rol === 'admin' || user?.rol === 'recepcionista') && !consultaCerrada && !!consulta.procedimiento && (
              <button
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set('consulta_id', id);
                  if (consulta.paciente_id) params.set('paciente_id', consulta.paciente_id);
                  if (consulta.paciente) params.set('paciente_nombre', consulta.paciente);
                  if (consulta.procedimiento) params.set('procedimiento', consulta.procedimiento);
                  if (consulta.doctor_id) params.set('cirujano_id', consulta.doctor_id);
                  if (consulta.doctor) params.set('cirujano_nombre', consulta.doctor);
                  if (consulta.fecha) params.set('fecha', consulta.fecha);
                  if (consulta.hora_inicio) params.set('hora', consulta.hora_inicio.slice(0, 5));
                  router.push(`/cirugias/nueva?${params.toString()}`);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors no-print sm:px-4 sm:py-2.5 sm:text-sm"
              >
                <Scissors className="h-4 w-4" /> Crear cirugía
              </button>
            )}
            {(user?.rol === 'admin' || user?.rol === 'recepcionista') && !consultaCerrada && !editing && (
              <button
                onClick={handleComplete}
                disabled={completing}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 no-print sm:px-4 sm:py-2.5 sm:text-sm"
              >
                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {completing ? 'Completando...' : 'Completar'}
              </button>
            )}
            {user?.rol === 'admin' && !editing && !consultaCerrada && (
              <button
                onClick={startEditing}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700 transition-colors no-print sm:px-4 sm:py-2.5 sm:text-sm"
              >
                <Edit3 className="h-4 w-4" /> Editar
              </button>
            )}
            {user?.rol === 'admin' && editing && !consultaCerrada && (
              <>
                <button
                  onClick={() => { setEditing(false); setEditError(null); }}
                  disabled={savingEdit}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-fg-2 hover:bg-surface-2 transition-colors disabled:opacity-50 no-print sm:px-4 sm:py-2.5 sm:text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700 transition-colors disabled:opacity-50 no-print sm:px-4 sm:py-2.5 sm:text-sm"
                >
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {savingEdit ? 'Guardando...' : 'Guardar'}
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Header with patient info */}
      <div className="bg-surface border border-line rounded-xl p-4 sm:p-6 mb-6 flex items-center gap-4">
        <Avatar initials={consulta.iniciales} className="bg-primary-500" size="lg" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold text-fg truncate">{consulta.paciente}</h2>
          <p className="text-sm text-muted">Dr. {consulta.doctor} — {consulta.fecha} {consulta.hora_inicio}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={consulta.estatus} config={estatusConfig} />
          <StatusBadge status={consulta.estatus_pago} config={estatusPagoConfig} />
        </div>
      </div>

      {/* Patient summary */}
      {(consulta.paciente || consulta.paciente_sexo) && (
        <div className="bg-surface border border-line rounded-xl p-6 mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
            <User className="h-4 w-4 text-primary-600" /> Resumen del Paciente
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Nombre</span>
              <p className="mt-0.5 font-medium text-fg">{consulta.paciente || '—'}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Edad</span>
              <p className="mt-0.5 font-medium text-fg">
                {edadPaciente || '—'}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Sexo</span>
              <p className="mt-0.5 font-medium text-fg">{consulta.paciente_sexo === 'H' ? 'Masculino' : consulta.paciente_sexo === 'M' ? 'Femenino' : consulta.paciente_sexo || '—'}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Teléfono</span>
              <p className="mt-0.5 font-medium text-fg">{consulta.paciente_telefono || '—'}</p>
            </div>
          </div>
          {showPatientDetails && (
            <div className="mt-3 pt-3 border-t border-line/70 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Aseguradora</span>
                <p className="mt-0.5 font-medium text-fg">{aseguradoraData?.aseguradora?.nombre || '—'}</p>
              </div>
              {consulta.paciente_poliza && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Póliza</span>
                  <p className="mt-0.5 font-medium text-fg">{consulta.paciente_poliza}</p>
                </div>
              )}
              {consulta.paciente_afiliacion && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Afiliación</span>
                  <p className="mt-0.5 font-medium text-fg">{consulta.paciente_afiliacion}</p>
                </div>
              )}
              {consulta.paciente_email && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Email</span>
                  <p className="mt-0.5 font-medium text-fg">{consulta.paciente_email}</p>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setShowPatientDetails(!showPatientDetails)}
            className="mt-3 text-xs font-bold text-primary-600 hover:text-primary-700 transition-colors"
          >
            {showPatientDetails ? 'Mostrar menos' : 'Mostrar más'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Consulta data */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
              <FileText className="h-4 w-4 text-primary-600" /> Datos de Consulta
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Doctor" value={consulta.doctor || '—'} />
              {editing ? (
                <>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Especialidad</span>
                    <select
                      value={editEspecialidadId}
                      onChange={(e) => setEditEspecialidadId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-white dark:bg-surface-2 px-3 py-2 text-sm font-medium text-fg focus:border-primary-500 focus:outline-none"
                    >
                      <option value="">Sin especialidad</option>
                      {especialidades.filter((e) => e.id).map((e) => (
                        <option key={e.clave} value={e.id}>{e.nombre}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Tipo de consulta</span>
                    <select
                      value={editTipo}
                      onChange={(e) => setEditTipo(e.target.value as TipoConsultaAgenda)}
                      className="mt-1 w-full rounded-lg border border-line bg-white dark:bg-surface-2 px-3 py-2 text-sm font-medium text-fg focus:border-primary-500 focus:outline-none"
                    >
                      {TIPOS_CONSULTA_AGENDA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <span className="mt-1 block text-[11px] text-muted">Cambiar el tipo no recalcula el costo; ajústalo en «Costo total».</span>
                  </label>
                </>
              ) : (
                <>
                  <Field label="Especialidad" value={consulta.especialidad || '—'} />
                  <Field label="Tipo de consulta" value={etiquetaTipoConsulta(consulta.tipo_consulta, consulta.tipo_visita)} />
                </>
              )}
              <Field label="Fecha y Hora" value={consulta.fecha && consulta.hora_inicio ? `${consulta.fecha} ${consulta.hora_inicio.slice(0, 5)}` : '—'} />
              <Field label="Hora Fin" value={consulta.hora_fin ? consulta.hora_fin.slice(0, 5) : '—'} />
              <Field label="Método de Pago" value={consulta.metodo_pago || '—'} />
              <Field label="Diagnóstico" value={consulta.diagnostico} full />
            </div>
          </div>

          {/* Clinical details */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
              <Activity className="h-4 w-4 text-sky-600" /> Detalles Clínicos
            </h3>
            <div className="space-y-3 text-sm">
              {(consulta.estudio_1 || consulta.estudio_2 || consulta.estudio_3) && (
                <div className="rounded-lg border border-line bg-surface-2 px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Estudios</span>
                  <div className="mt-1.5 space-y-1.5">
                    {consulta.estudio_1 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-fg">{consulta.estudio_1}</span>
                        <div className="flex items-center gap-2">
                          {consulta.est1_doctor && <span className="text-xs text-muted">Dr. {consulta.est1_doctor}</span>}
                          {(user?.rol === 'admin' || user?.rol === 'recepcionista') && (
                            (() => {
                              const consultaId = estudiosAgendados.get(consulta.estudio_1!);
                              if (consultaId) {
                                return (
                                  <button
                                    onClick={() => router.push(`/consultas/${consultaId}`)}
                                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                                  >
                                    <Calendar className="h-3 w-3" /> Ver cita
                                  </button>
                                );
                              }
                              if (consultaCerrada) return null;
                              return (
                                <button
                                  onClick={() => setEstudioAAgendar({
                                nombre: consulta.estudio_1!,
                                doctor_id: consulta.estudio_1_doctor_id,
                                    doctor_nombre: consulta.est1_doctor,
                                  })}
                                  className="inline-flex items-center gap-1 rounded-md bg-sky-50 dark:bg-sky-900/20 px-2 py-1 text-xs font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors"
                                >
                                  <CalendarPlus className="h-3 w-3" /> Agendar
                                </button>
                              );
                            })()
                          )}
                        </div>
                      </div>
                    )}
                    {consulta.estudio_2 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-fg">{consulta.estudio_2}</span>
                        <div className="flex items-center gap-2">
                          {consulta.est2_doctor && <span className="text-xs text-muted">Dr. {consulta.est2_doctor}</span>}
                          {(user?.rol === 'admin' || user?.rol === 'recepcionista') && (
                            (() => {
                              const consultaId = estudiosAgendados.get(consulta.estudio_2!);
                              if (consultaId) {
                                return (
                                  <button
                                    onClick={() => router.push(`/consultas/${consultaId}`)}
                                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                                  >
                                    <Calendar className="h-3 w-3" /> Ver cita
                                  </button>
                                );
                              }
                              if (consultaCerrada) return null;
                              return (
                                <button
                                  onClick={() => setEstudioAAgendar({
                                    nombre: consulta.estudio_2!,
                                    doctor_id: consulta.estudio_2_doctor_id,
                                    doctor_nombre: consulta.est2_doctor,
                                  })}
                                  className="inline-flex items-center gap-1 rounded-md bg-sky-50 dark:bg-sky-900/20 px-2 py-1 text-xs font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors"
                                >
                                  <CalendarPlus className="h-3 w-3" /> Agendar
                                </button>
                              );
                            })()
                          )}
                        </div>
                      </div>
                    )}
                    {consulta.estudio_3 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-fg">{consulta.estudio_3}</span>
                        <div className="flex items-center gap-2">
                          {consulta.est3_doctor && <span className="text-xs text-muted">Dr. {consulta.est3_doctor}</span>}
                          {(user?.rol === 'admin' || user?.rol === 'recepcionista') && (
                            (() => {
                              const consultaId = estudiosAgendados.get(consulta.estudio_3!);
                              if (consultaId) {
                                return (
                                  <button
                                    onClick={() => router.push(`/consultas/${consultaId}`)}
                                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                                  >
                                    <Calendar className="h-3 w-3" /> Ver cita
                                  </button>
                                );
                              }
                              if (consultaCerrada) return null;
                              return (
                                <button
                                  onClick={() => setEstudioAAgendar({
                                    nombre: consulta.estudio_3!,
                                    doctor_id: consulta.estudio_3_doctor_id,
                                    doctor_nombre: consulta.est3_doctor,
                                  })}
                                  className="inline-flex items-center gap-1 rounded-md bg-sky-50 dark:bg-sky-900/20 px-2 py-1 text-xs font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors"
                                >
                                  <CalendarPlus className="h-3 w-3" /> Agendar
                                </button>
                              );
                            })()
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {consulta.procedimiento ? (
                <div className="rounded-lg border border-line bg-surface-2 px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Procedimiento</span>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-fg">{consulta.procedimiento}</span>
                    {consulta.proc_doctor && (
                      <span className="text-xs text-muted">Dr. {consulta.proc_doctor}</span>
                    )}
                  </div>
                </div>
              ) : (
                <Field label="Procedimientos" value="—" full />
              )}
              {editing ? (
                <div className="col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Notas</span>
                  <textarea
                    value={editNotas}
                    onChange={(e) => setEditNotas(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-line bg-white dark:bg-surface-2 px-3 py-2 text-sm font-medium text-fg focus:border-primary-500 focus:outline-none"
                  />
                  {editError && <p className="mt-1 text-xs font-bold text-red-600">{editError}</p>}
                </div>
              ) : (
                <Field label="Notas" value={consulta.notas} full />
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Payment info */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
              <CreditCard className="h-4 w-4 text-emerald-600" /> Pago
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center gap-2">
                <span className="text-muted">Costo total</span>
                {editing ? (
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editCosto}
                    onChange={(e) => setEditCosto(e.target.value)}
                    disabled={consulta.estatus_pago === 'PAGADO'}
                    className="w-28 rounded-lg border border-line bg-white dark:bg-surface-2 px-2 py-1 text-right text-sm font-bold text-fg focus:border-primary-500 focus:outline-none disabled:opacity-50"
                  />
                ) : (
                  <span className="font-bold text-fg">${consulta.costo_total.toLocaleString('es-MX')}</span>
                )}
              </div>
              {consulta.estatus_pago === 'PAGADO' && (
                <p className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-400">
                  Esta consulta ya fue pagada, no puede ser editado el monto.
                </p>
              )}
              <div className="flex justify-between">
                <span className="text-muted">Monto pagado</span>
                <span className="font-bold text-fg">${consulta.monto_pagado.toLocaleString('es-MX')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Estado</span>
                <StatusBadge status={consulta.estatus_pago} config={estatusPagoConfig} />
              </div>
              {(user?.rol === 'admin' || user?.rol === 'recepcionista') && consulta.estatus_pago !== 'PAGADO' && (
                <button
                  onClick={handleMarkPaid}
                  disabled={paying}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {paying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />}
                  {paying ? 'Registrando...' : 'Registrar pago'}
                </button>
              )}
            </div>
          </div>

          {/* Aseguradora */}
          {aseguradoraData?.aseguradora && (
            <div className="bg-surface border border-line rounded-xl p-6">
              <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
                <Shield className="h-4 w-4 text-sky-600" /> Aseguradora
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Nombre</span>
                  <p className="mt-0.5 font-bold text-fg">{aseguradoraData.aseguradora.nombre}</p>
                </div>
                {aseguradoraData.cobertura && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted">% Cobertura</span>
                      <span className="font-bold text-fg">{aseguradoraData.cobertura.porcentaje_cobertura}%</span>
                    </div>
                    {aseguradoraData.cobertura.copago_fijo !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted">Copago fijo</span>
                        <span className="font-bold text-fg">${aseguradoraData.cobertura.copago_fijo.toLocaleString('es-MX')}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-muted">Aplica</span>
                      <span className="text-gray-600 dark:text-muted">
                        {aseguradoraData.cobertura.aplica_estudios ? 'Estudios' : ''}{aseguradoraData.cobertura.aplica_estudios && aseguradoraData.cobertura.aplica_procedimientos ? ' + ' : ''}{aseguradoraData.cobertura.aplica_procedimientos ? 'Procedimientos' : ''}
                      </span>
                    </div>
                    {consulta.costo_total > 0 && (
                      <div className="mt-2 rounded-lg bg-surface-2 p-3 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted">Costo base</span>
                          <span className="font-bold text-fg">${consulta.costo_total.toLocaleString('es-MX')}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted">Cobertura ({aseguradoraData.cobertura.porcentaje_cobertura}%)</span>
                          <span className="font-bold text-emerald-600">-${(consulta.costo_total * aseguradoraData.cobertura.porcentaje_cobertura / 100).toLocaleString('es-MX')}</span>
                        </div>
                        <div className="border-t border-line pt-2 flex justify-between text-xs">
                          <span className="font-bold text-fg">Monto paciente</span>
                          <span className="font-extrabold text-fg">${(consulta.costo_total * (1 - aseguradoraData.cobertura.porcentaje_cobertura / 100)).toLocaleString('es-MX')}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Cirugías relacionadas */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
              <Scissors className="h-4 w-4 text-rose-600" /> Cirugías relacionadas
            </h3>
            {cirugiasRelacionadas.length === 0 ? (
              <p className="text-sm text-muted">No hay cirugías vinculadas a esta consulta.</p>
            ) : (
              <div className="space-y-3 anim-lista">
                {cirugiasRelacionadas.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/cirugias/${c.id}`)}
                    className="w-full text-left rounded-lg border border-line bg-surface-2 px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-surface-3 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-fg">{c.codigo || 'Cirugía'}</span>
                      <span className="text-xs text-muted">{c.estado}</span>
                    </div>
                    <p className="text-xs text-muted">{c.servicio?.nombre || '—'} {c.ojo || ''} — {c.fecha || 'Sin fecha'}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-fg">
              <Clock className="h-4 w-4 text-violet-600" /> Historial
            </h3>
            {historial.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">Sin eventos registrados</p>
            ) : (
              <div className="relative space-y-4">
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200 dark:bg-surface-3" />
                {historial.map((evento) => {
                  const Icon = eventoIcons[evento.tipo_evento] || Clock;
                  return (
                    <div key={evento.id} className="relative flex items-start gap-3">
                      <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-line">
                        <Icon className="h-4 w-4 text-muted" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {(() => {
                          const payload = evento.payload || {};
                          const estudioAgendado = payload.accion === 'estudio_agendado';
                          const esAplazamiento = payload.accion === 'aplazamiento';
                          const motivo = typeof payload.motivo === 'string' && payload.motivo
                            ? payload.motivo
                            : null;
                          const titulo = estudioAgendado
                            ? 'Estudio agendado'
                            : esAplazamiento
                              ? 'Aplazado'
                              : eventoLabels[evento.tipo_evento] || evento.tipo_evento;
                          const fechaNueva = payload.fecha_nueva ? String(payload.fecha_nueva) : null;
                          const horaNueva = payload.hora_nueva ? String(payload.hora_nueva).slice(0, 5) : null;
                          return (
                            <>
                              <p className="text-sm font-medium text-fg">
                                {titulo}
                              </p>
                              {estudioAgendado && (
                                <p className="text-xs text-muted">
                                  {String(payload.estudio_nombre || 'Estudio')} · Fecha: {String(payload.fecha_estudio || '—')} {String(payload.hora_estudio || '')} · Asignado a: {String(payload.asignado_a || '—')}
                                </p>
                              )}
                              {(fechaNueva || horaNueva) && (
                                <p className="text-xs text-muted">
                                  Nueva cita: {fechaNueva || String(payload.fecha_anterior || '')} {horaNueva || ''}
                                </p>
                              )}
                              {motivo && (
                                <p className="mt-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-400">
                                  Motivo: {motivo}
                                </p>
                              )}
                            </>
                          );
                        })()}
                        <p className="text-xs text-muted">
                           {evento.usuario_nombre || 'Sistema'} — <ClientDate date={evento.created_at} dateTime />
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Agendar Estudio */}
      {estudioAAgendar && (
        <AgendarEstudioModal
          isOpen={!!estudioAAgendar}
          onClose={() => setEstudioAAgendar(null)}
          estudio={estudioAAgendar}
          onScheduled={(consultaId) => {
            setEstudiosAgendadosLocal((current) => ({ ...current, [estudioAAgendar.nombre]: consultaId }));
            void mutateHistorial();
            void mutateConsultasPaciente();
            void invalidar('/api/consultas', '/api/agenda', '/api/dashboard');
          }}
          consulta={{
            id: consulta.id,
            paciente_id: consulta.paciente_id,
            paciente: consulta.paciente,
            doctor_id: consulta.doctor_id,
            doctor: consulta.doctor,
            aseguranza_id: aseguradoraData?.aseguradora?.id || null,
          }}
        />
      )}

      <ConsultaAccionesFab
        consultaId={consulta.id}
        fecha={consulta.fecha}
        horaInicio={consulta.hora_inicio}
        horaFin={consulta.hora_fin}
        visible={!editing && !consultaCerrada}
        onDone={() => {
          void mutateDetalle();
          void mutateHistorial();
          void invalidar('/api/consultas', '/api/agenda', '/api/dashboard');
        }}
      />
    </div>
  );
}
