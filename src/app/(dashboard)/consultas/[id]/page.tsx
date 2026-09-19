'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer, Edit3, Clock, CheckCircle2, AlertCircle, FileText, User, Stethoscope, Calendar, CreditCard, Activity, Shield } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Avatar from '@/components/ui/Avatar';
import StatusBadge from '@/components/ui/StatusBadge';
import { useUser } from '@/hooks/useUser';

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
  diagnostico: string | null;
  estudios: string | null;
  estudios_detalle: EstudioDetalle[];
  procedimiento: string | null;
  procedimiento_doctor: string | null;
  notas: string | null;
  estatus: string;
  estatus_pago: string;
  costo_total: number;
  monto_pagado: number;
  metodo_pago: string | null;
  created_at: string;
  pacientes?: PacienteInfo | null;
}

interface HistorialEvento {
  id: string;
  tipo_evento: string;
  payload: Record<string, unknown>;
  created_at: string;
  usuarios: { nombre: string } | null;
}

const estatusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  BORRADOR: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  PROCESADA: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  PENDIENTE_ESTUDIO: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  PENDIENTE_CIRUGIA: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  FINALIZADA: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

const estatusPagoConfig: Record<string, { bg: string; text: string; dot: string }> = {
  PAGADO: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  PENDIENTE_PAGO: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
};

const eventoIcons: Record<string, typeof CheckCircle2> = {
  CAMBIO_ESTATUS: Clock,
  EDICION: Edit3,
  CANCELACION: AlertCircle,
  REAGENDADO: Calendar,
  PAGADO: CreditCard,
  FINALIZADO: CheckCircle2,
};

const eventoLabels: Record<string, string> = {
  CAMBIO_ESTATUS: 'Cambio de estatus',
  EDICION: 'Edición',
  CANCELACION: 'Cancelación',
  REAGENDADO: 'Reagendado',
  PAGADO: 'Pago registrado',
  FINALIZADO: 'Consulta finalizada',
};

function Field({ label, value, full }: { label: string; value: string | null | undefined; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">{label}</span>
      <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">{value || '—'}</p>
    </div>
  );
}

export default function ConsultaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const [consulta, setConsulta] = useState<ConsultaDetalle | null>(null);
  const [historial, setHistorial] = useState<HistorialEvento[]>([]);
  const [aseguradoraData, setAseguradoraData] = useState<{ aseguradora: { id: string; nombre: string } | null; cobertura: { porcentaje_cobertura: number; copago_fijo: number | null; aplica_estudios: boolean; aplica_procedimientos: boolean } | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPatientDetails, setShowPatientDetails] = useState(false);

  const fetchConsulta = useCallback(async () => {
    try {
      const res = await fetch(`/api/consultas/${id}`);
      if (!res.ok) throw new Error('Error al cargar');
      const data = await res.json();
      if (!data.consulta) throw new Error('Consulta no encontrada');
      setConsulta(data.consulta);
      if (data.aseguranza) {
        setAseguradoraData({ aseguradora: data.aseguranza, cobertura: null });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  }, [id]);

  const fetchHistorial = useCallback(async () => {
    try {
      const res = await fetch(`/api/consultas/${id}/historial`);
      if (res.ok) {
        const data = await res.json();
        setHistorial(data.data || []);
      }
    } catch { /* silent */ }
  }, [id]);

  useEffect(() => {
    Promise.all([fetchConsulta(), fetchHistorial()]).finally(() => setLoading(false));
  }, [fetchConsulta, fetchHistorial]);

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error || !consulta) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">{error || 'Consulta no encontrada'}</p>
        <button onClick={() => router.push('/consultas')} className="mt-4 text-primary-600 hover:text-primary-700 text-sm font-semibold">
          Volver a Consultas
        </button>
      </div>
    );
  }

  return (
    <div className="print-page">
      <PageHeader
        title={`Consulta ${consulta.folio || consulta.id.slice(0, 8)}`}
        subtitle={`${consulta.paciente} — ${consulta.fecha}`}
        backLink={{ href: '/consultas', label: 'Consultas' }}
        action={
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors no-print"
            >
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            {user?.rol === 'admin' && (
              <button
                onClick={() => router.push(`/consultas/${id}/editar`)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700 transition-colors no-print"
              >
                <Edit3 className="h-4 w-4" /> Editar
              </button>
            )}
          </div>
        }
      />

      {/* Header with patient info */}
      <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6 mb-6 flex items-center gap-4">
        <Avatar initials={consulta.iniciales} className="bg-primary-500" size="lg" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold text-gray-900 dark:text-[#E7E9EA] truncate">{consulta.paciente}</h2>
          <p className="text-sm text-gray-500 dark:text-[#71767B]">Dr. {consulta.doctor} — {consulta.fecha} {consulta.hora_inicio}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={consulta.estatus} config={estatusConfig} />
          <StatusBadge status={consulta.estatus_pago} config={estatusPagoConfig} />
        </div>
      </div>

      {/* Patient summary */}
      {consulta.pacientes && (
        <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6 mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
            <User className="h-4 w-4 text-primary-600" /> Resumen del Paciente
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Nombre</span>
              <p className="mt-0.5 font-medium text-gray-900 dark:text-[#E7E9EA]">{consulta.pacientes.nombre_completo}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Edad</span>
              <p className="mt-0.5 font-medium text-gray-900 dark:text-[#E7E9EA]">
                {consulta.pacientes.fecha_nacimiento
                  ? `${Math.floor((Date.now() - new Date(consulta.pacientes.fecha_nacimiento).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} años`
                  : '—'}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Sexo</span>
              <p className="mt-0.5 font-medium text-gray-900 dark:text-[#E7E9EA]">{consulta.pacientes.sexo === 'H' ? 'Masculino' : consulta.pacientes.sexo === 'M' ? 'Femenino' : '—'}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Teléfono</span>
              <p className="mt-0.5 font-medium text-gray-900 dark:text-[#E7E9EA]">{consulta.pacientes.telefono || '—'}</p>
            </div>
          </div>
          {showPatientDetails && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#2F3336] grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Aseguradora</span>
                <p className="mt-0.5 font-medium text-gray-900 dark:text-[#E7E9EA]">{consulta.pacientes.aseguradora || '—'}</p>
              </div>
              {consulta.pacientes.email && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Email</span>
                  <p className="mt-0.5 font-medium text-gray-900 dark:text-[#E7E9EA]">{consulta.pacientes.email}</p>
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
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              <FileText className="h-4 w-4 text-primary-600" /> Datos de Consulta
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Doctor" value={consulta.doctor} />
              <Field label="Tipo" value={consulta.tipo_consulta} />
              <Field label="Fecha y Hora" value={`${consulta.fecha} ${consulta.hora_inicio}`} />
              <Field label="Hora Fin" value={consulta.hora_fin} />
              <Field label="Tipo de Visita" value={consulta.tipo_visita} />
              <Field label="Método de Pago" value={consulta.metodo_pago} />
              <Field label="Diagnóstico" value={consulta.diagnostico} full />
            </div>
          </div>

          {/* Clinical details */}
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              <Activity className="h-4 w-4 text-sky-600" /> Detalles Clínicos
            </h3>
            <div className="space-y-3 text-sm">
              {consulta.estudios_detalle && consulta.estudios_detalle.length > 0 ? (
                <div className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#1D1F23] px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Estudios</span>
                  <div className="mt-1.5 space-y-1.5">
                    {consulta.estudios_detalle.map((e, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">{e.nombre}</span>
                        {e.doctor && (
                          <span className="text-xs text-gray-500 dark:text-[#71767B]">Dr. {e.doctor}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <Field label="Estudios" value={consulta.estudios} full />
              )}
              {consulta.procedimiento ? (
                <div className="rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#1D1F23] px-4 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Procedimiento</span>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">{consulta.procedimiento}</span>
                    {consulta.procedimiento_doctor && (
                      <span className="text-xs text-gray-500 dark:text-[#71767B]">Dr. {consulta.procedimiento_doctor}</span>
                    )}
                  </div>
                </div>
              ) : (
                <Field label="Procedimientos" value="—" full />
              )}
              <Field label="Notas" value={consulta.notas} full />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Payment info */}
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              <CreditCard className="h-4 w-4 text-emerald-600" /> Pago
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-[#71767B]">Costo total</span>
                <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">${consulta.costo_total.toLocaleString('es-MX')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-[#71767B]">Monto pagado</span>
                <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">${consulta.monto_pagado.toLocaleString('es-MX')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-[#71767B]">Estado</span>
                <StatusBadge status={consulta.estatus_pago} config={estatusPagoConfig} />
              </div>
            </div>
          </div>

          {/* Aseguradora */}
          {aseguradoraData?.aseguradora && (
            <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
              <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
                <Shield className="h-4 w-4 text-sky-600" /> Aseguradora
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-[#71767B]">Nombre</span>
                  <p className="mt-0.5 font-bold text-gray-900 dark:text-[#E7E9EA]">{aseguradoraData.aseguradora.nombre}</p>
                </div>
                {aseguradoraData.cobertura && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-[#71767B]">% Cobertura</span>
                      <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">{aseguradoraData.cobertura.porcentaje_cobertura}%</span>
                    </div>
                    {aseguradoraData.cobertura.copago_fijo !== null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-[#71767B]">Copago fijo</span>
                        <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">${aseguradoraData.cobertura.copago_fijo.toLocaleString('es-MX')}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400 dark:text-[#71767B]">Aplica</span>
                      <span className="text-gray-600 dark:text-[#71767B]">
                        {aseguradoraData.cobertura.aplica_estudios ? 'Estudios' : ''}{aseguradoraData.cobertura.aplica_estudios && aseguradoraData.cobertura.aplica_procedimientos ? ' + ' : ''}{aseguradoraData.cobertura.aplica_procedimientos ? 'Procedimientos' : ''}
                      </span>
                    </div>
                    {consulta.costo_total > 0 && (
                      <div className="mt-2 rounded-lg bg-gray-50 dark:bg-[#202327] p-3 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500 dark:text-[#71767B]">Costo base</span>
                          <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">${consulta.costo_total.toLocaleString('es-MX')}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500 dark:text-[#71767B]">Cobertura ({aseguradoraData.cobertura.porcentaje_cobertura}%)</span>
                          <span className="font-bold text-emerald-600">-${(consulta.costo_total * aseguradoraData.cobertura.porcentaje_cobertura / 100).toLocaleString('es-MX')}</span>
                        </div>
                        <div className="border-t border-gray-200 dark:border-[#2F3336] pt-2 flex justify-between text-xs">
                          <span className="font-bold text-gray-900 dark:text-[#E7E9EA]">Monto paciente</span>
                          <span className="font-extrabold text-gray-900 dark:text-[#E7E9EA]">${(consulta.costo_total * (1 - aseguradoraData.cobertura.porcentaje_cobertura / 100)).toLocaleString('es-MX')}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-xl p-6">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gray-900 dark:text-[#E7E9EA]">
              <Clock className="h-4 w-4 text-violet-600" /> Historial
            </h3>
            {historial.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-[#71767B] text-center py-4">Sin eventos registrados</p>
            ) : (
              <div className="relative space-y-4">
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200 dark:bg-[#2F3336]" />
                {historial.map((evento) => {
                  const Icon = eventoIcons[evento.tipo_evento] || Clock;
                  return (
                    <div key={evento.id} className="relative flex items-start gap-3">
                      <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336]">
                        <Icon className="h-4 w-4 text-gray-500 dark:text-[#71767B]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-[#E7E9EA]">
                          {eventoLabels[evento.tipo_evento] || evento.tipo_evento}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-[#71767B]">
                          {evento.usuarios?.nombre || 'Sistema'} — {new Date(evento.created_at).toLocaleString('es-MX')}
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
    </div>
  );
}
