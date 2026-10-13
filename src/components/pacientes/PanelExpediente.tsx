import { useEffect, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import Avatar from '@/components/ui/Avatar';
import { getAvatarColor, getInitials, PacienteAPI, PacienteDetalleAPI } from '@/components/consultations/nueva-consulta-comun';
import { sexoLegible, fechaNacimientoLegible, edadLegible, hoyTijuana } from '@/lib/ficha-paciente';
import { etiquetaOjo } from '@/lib/catalogos/cirugia';
import type { TelefonoPaciente } from '@/lib/telefonos-paciente';

/** Un dato del paciente en la tarjeta de selección (sin dato = «Sin registrar»). */
export function DatoPaciente({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-fg">{value || <span className="font-normal text-muted">Sin registrar</span>}</dd>
    </div>
  );
}

/** Datos completos del paciente elegido: expediente, sexo, edad, nacimiento, correo y teléfonos. */
/** `sinDatosDelPanel`: omite sexo, edad y nacimiento cuando el panel Expediente ya está al lado. */
export function DatosPacienteFicha({ paciente, sinDatosDelPanel = false }: { paciente: PacienteAPI; sinDatosDelPanel?: boolean }) {
  // La edad depende de la fecha de hoy: se calcula en el cliente tras montar (sin desfase de hidratación).
  const [hoy, setHoy] = useState<string | null>(null);
  useEffect(() => setHoy(hoyTijuana()), []);

  const edad = hoy && paciente.fecha_nacimiento
    ? edadLegible(paciente.fecha_nacimiento, hoy)
    : paciente.edad != null ? `${paciente.edad} ${paciente.edad === 1 ? 'año' : 'años'}` : null;
  const telefonos = (paciente.telefonos && paciente.telefonos.length > 0)
    ? paciente.telefonos
    : paciente.telefono ? [{ numero: paciente.telefono, etiqueta: 'Celular', principal: true } as TelefonoPaciente] : [];

  return (
    <div className="mt-4 animate-fadeIn rounded-xl border border-line/70 bg-surface-2/50 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Avatar initials={getInitials(paciente.nombre_completo ?? paciente.nombre)} className={getAvatarColor(paciente.id)} size="sm" />
        <span className="text-base font-extrabold text-fg">{paciente.nombre_completo ?? paciente.nombre}</span>
        {paciente.numero_expediente && (
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700 dark:bg-primary-400/10 dark:text-primary-300">
            Exp. {paciente.numero_expediente}
          </span>
        )}
        {paciente.aseguradora && <span className="text-xs font-bold text-primary-600">{paciente.aseguradora}</span>}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {!sinDatosDelPanel && (
          <>
            <DatoPaciente label="Sexo" value={sexoLegible(paciente.sexo)} />
            <DatoPaciente label="Edad" value={edad} />
            <DatoPaciente label="Fecha de nacimiento" value={fechaNacimientoLegible(paciente.fecha_nacimiento)} />
          </>
        )}
        <DatoPaciente label="Correo" value={paciente.email} className="col-span-2 sm:col-span-1" />
        <DatoPaciente
          label="Teléfonos"
          className="col-span-2 sm:col-span-2"
          value={telefonos.length > 0 ? (
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {telefonos.map((t) => (
                <span key={t.numero} className="whitespace-nowrap">
                  {t.numero}
                  {t.principal && <span className="ml-1 text-[10px] font-bold text-primary-600">principal</span>}
                </span>
              ))}
            </span>
          ) : null}
        />
        {paciente.direccion && <DatoPaciente label="Dirección" value={paciente.direccion} className="col-span-2 sm:col-span-3" />}
      </dl>
    </div>
  );
}

/** Expediente completo del paciente, cargado solo cuando se despliega «Ver expediente». */
interface ConsultaExpediente {
  id: string;
  fecha: string | null;
  tipo_consulta: string | null;
  diagnostico: string | null;
  estudios: string[];
  procedimiento: string | null;
  doctor: string;
}

interface CirugiaExpediente {
  id: string;
  fecha: string | null;
  procedimiento: string | null;
  ojo: string | null;
  estado: string;
  doctor: string;
}

interface ExpedienteDetalle extends PacienteDetalleAPI {
  contacto_emergencia?: string | null;
  tel_emergencia?: string | null;
  numero_poliza?: string | null;
  numero_afiliacion?: string | null;
  consultas?: ConsultaExpediente[];
  cirugias?: CirugiaExpediente[];
}

const MAX_RESUMEN = 5;

const ESTADO_CIRUGIA_TXT: Record<string, string> = {
  agendada: 'Agendada', reagendada: 'Reagendada', completada: 'Completada', cancelada: 'Cancelada', aplazada: 'Aplazada',
};

function fechaCorta(fecha: string | null): string {
  if (!fecha) return 'Sin fecha';
  return new Date(`${fecha.slice(0, 10)}T00:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Bloque de resumen: solo aparece si hay registros. */
function ResumenSeccion({ titulo, total, children }: { titulo: string; total: number; children: ReactNode }) {
  if (total === 0) return null;
  return (
    <div className="border-t border-line/70 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{titulo}</span>
        <span className="text-[10px] font-bold text-muted">{total}</span>
      </div>
      <ul className="space-y-2 text-xs">{children}</ul>
    </div>
  );
}

export function ExpedienteCompleto({ pacienteId }: { pacienteId: string }) {
  const { data, isLoading, error } = useSWR<ExpedienteDetalle>(
    `/api/pacientes/${encodeURIComponent(pacienteId)}`,
    { revalidateOnFocus: false },
  );
  const [hoy, setHoy] = useState<string | null>(null);
  useEffect(() => setHoy(hoyTijuana()), []);

  if (isLoading && !data) return <p className="text-xs text-muted">Cargando expediente…</p>;
  if (error || !data) return <p className="text-xs text-rose-600">No se pudo cargar el expediente.</p>;

  const edad = hoy && data.fecha_nacimiento
    ? edadLegible(data.fecha_nacimiento, hoy)
    : data.edad != null ? `${data.edad} ${data.edad === 1 ? 'año' : 'años'}` : null;
  const telefonos = (data.telefonos && data.telefonos.length > 0)
    ? data.telefonos
    : data.telefono ? [{ numero: data.telefono, etiqueta: 'Celular', principal: true } as TelefonoPaciente] : [];
  const emergencia = data.contacto_emergencia
    ? `${data.contacto_emergencia}${data.tel_emergencia ? ` · ${data.tel_emergencia}` : ''}`
    : null;

  // Solo los datos que el paciente tiene.
  const campos: Array<{ label: string; value: ReactNode }> = [
    { label: 'No. Expediente', value: data.numero_expediente },
    { label: 'Sexo', value: sexoLegible(data.sexo) },
    { label: 'Edad', value: edad },
    { label: 'Fecha de nacimiento', value: fechaNacimientoLegible(data.fecha_nacimiento) },
    { label: 'Correo', value: data.email },
    {
      label: 'Teléfonos',
      value: telefonos.length > 0 ? (
        <span className="flex flex-col">
          {telefonos.map((t) => (
            <span key={t.numero}>
              {t.numero}{t.principal && <span className="ml-1 text-[10px] font-bold text-primary-600">principal</span>}
            </span>
          ))}
        </span>
      ) : null,
    },
    { label: 'Dirección', value: data.direccion },
    { label: 'Aseguradora', value: data.aseguradora },
    { label: 'No. póliza', value: data.numero_poliza },
    { label: 'No. afiliación', value: data.numero_afiliacion },
    { label: 'Contacto de emergencia', value: emergencia },
  ].filter((c) => c.value !== null && c.value !== undefined && c.value !== '');

  // Resumen por tipo de registro.
  const consultas = data.consultas || [];
  const esEstudio = (c: ConsultaExpediente) => (c.tipo_consulta || '').toUpperCase().includes('ESTUDIO');
  const esProcedimiento = (c: ConsultaExpediente) => (c.tipo_consulta || '').toUpperCase().includes('PROCEDIMIENTO');
  const consultasSolo = consultas.filter((c) => !esEstudio(c) && !esProcedimiento(c));
  const estudios = consultas.filter((c) => esEstudio(c) || c.estudios.length > 0);
  const procedimientos = consultas.filter((c) => esProcedimiento(c) || !!c.procedimiento);
  const cirugias = data.cirugias || [];

  return (
    <div className="space-y-4">
      {campos.length > 0 && (
        <dl className="grid grid-cols-1 gap-3">
          {campos.map((c) => (
            <DatoPaciente key={c.label} label={c.label} value={c.value} />
          ))}
        </dl>
      )}

      <ResumenSeccion titulo="Consultas" total={consultasSolo.length}>
        {consultasSolo.slice(0, MAX_RESUMEN).map((c) => (
          <li key={c.id}>
            <div className="font-semibold text-fg">{fechaCorta(c.fecha)}{c.doctor && <span className="font-normal text-muted"> · {c.doctor}</span>}</div>
            {c.diagnostico && <div className="text-muted">{c.diagnostico}</div>}
          </li>
        ))}
      </ResumenSeccion>

      <ResumenSeccion titulo="Estudios" total={estudios.length}>
        {estudios.slice(0, MAX_RESUMEN).map((c) => (
          <li key={c.id}>
            <div className="font-semibold text-fg">{fechaCorta(c.fecha)}</div>
            <div className="text-muted">{c.estudios.length > 0 ? c.estudios.join(', ') : 'Estudio'}</div>
          </li>
        ))}
      </ResumenSeccion>

      <ResumenSeccion titulo="Cirugías" total={cirugias.length}>
        {cirugias.slice(0, MAX_RESUMEN).map((c) => (
          <li key={c.id}>
            <div className="font-semibold text-fg">
              {fechaCorta(c.fecha)}
              <span className="font-normal text-muted"> · {ESTADO_CIRUGIA_TXT[c.estado] || c.estado}</span>
            </div>
            <div className="text-muted">{c.procedimiento || 'Sin procedimiento'}{c.ojo ? ` · ${etiquetaOjo(c.ojo)}` : ''}</div>
          </li>
        ))}
      </ResumenSeccion>

      <ResumenSeccion titulo="Procedimientos" total={procedimientos.length}>
        {procedimientos.slice(0, MAX_RESUMEN).map((c) => (
          <li key={c.id}>
            <div className="font-semibold text-fg">{fechaCorta(c.fecha)}{c.doctor && <span className="font-normal text-muted"> · {c.doctor}</span>}</div>
            <div className="text-muted">{c.procedimiento || 'Procedimiento'}</div>
          </li>
        ))}
      </ResumenSeccion>

      {campos.length === 0 && consultas.length === 0 && cirugias.length === 0 && (
        <p className="text-xs text-muted">Este paciente aún no tiene datos ni registros en el expediente.</p>
      )}
    </div>
  );
}

/** Tarjeta «Expediente» de la barra lateral: «Ver expediente» despliega el expediente completo. */
export function PanelExpediente({ pacienteId }: { pacienteId: string | null }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-line dark:bg-surface">
      <div className="flex items-center justify-between gap-3 px-6 py-4">
        <h2 className="text-xs font-extrabold uppercase tracking-widest text-fg">Expediente</h2>
        {pacienteId && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="text-xs font-bold text-primary-600 hover:underline"
          >
            {abierto ? 'Ocultar' : 'Ver expediente'}
          </button>
        )}
      </div>
      {!pacienteId && (
        <p className="px-6 pb-4 text-xs text-muted">Seleccione un paciente para ver su expediente.</p>
      )}
      {pacienteId && abierto && (
        <div className="border-t border-line/70 px-6 py-4 animate-fadeIn">
          <ExpedienteCompleto pacienteId={pacienteId} />
        </div>
      )}
    </div>
  );
}
