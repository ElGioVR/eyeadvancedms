'use client';

/**
 * Acciones rápidas de agenda (Modificaciones agenda, punto IV):
 * aplazar, reagendar, cancelar y agendar SIN entrar al perfil del paciente.
 *
 * Rutas por tipo de evento:
 *  - consulta / estudio → POST /api/consultas/[id]/acciones (aplazar | reagendar | cancelar)
 *  - cirugía            → PATCH /api/agenda/[id] (estado + motivo; fecha/hora al reagendar)
 * Alta rápida → POST /api/consultas (el servidor valida empalmes y responde 409).
 */

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Search } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import FormField from '@/components/ui/FormField';
import SelectorHoraSlot from '@/components/agenda/SelectorHoraSlot';
import { enviarJSON } from '@/lib/fetcher';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { DURACION_CITA_MIN, sumarMinutos } from '@/lib/agenda-slots';
import type { AgendaCirugia } from '@/types';
import { useEspecialidades } from '@/hooks/useEspecialidades';
import { TIPOS_CONSULTA_AGENDA, opcionTipoConsulta, type TipoConsultaAgenda } from '@/lib/catalogos/tipos-consulta';
import { ETIQUETA_ACCION, esEventoConsulta, type AccionRapida } from '@/lib/agenda-acciones';

export { ETIQUETA_ACCION, accionesDisponibles, type AccionRapida } from '@/lib/agenda-acciones';

const esConsulta = esEventoConsulta;

/** Ejecuta la acción contra el endpoint correcto. Lanza ApiError con el mensaje del servidor. */
async function ejecutarAccion(
  evento: AgendaCirugia,
  accion: AccionRapida,
  datos: { motivo: string; fecha?: string; hora?: string }
): Promise<Partial<AgendaCirugia>> {
  if (esConsulta(evento)) {
    const body: Record<string, unknown> = { accion, motivo: datos.motivo };
    if (accion !== 'cancelar' && datos.hora) {
      body.hora_inicio = datos.hora;
      body.hora_fin = sumarMinutos(datos.hora, DURACION_CITA_MIN);
      if (accion === 'reagendar') body.fecha = datos.fecha;
    }
    await enviarJSON(`/api/consultas/${evento.id}/acciones`, 'POST', body);
    if (accion === 'cancelar') return { estado: 'cancelada' };
    if (accion === 'aplazar') return { estado: 'aplazada', hora: datos.hora ?? evento.hora };
    return { estado: 'reagendada', fecha: datos.fecha ?? evento.fecha, hora: datos.hora ?? evento.hora };
  }

  // Cirugía
  const cambios: Record<string, unknown> = { motivo: datos.motivo };
  if (accion === 'cancelar') cambios.estado = 'cancelada';
  if (accion === 'aplazar') cambios.estado = 'aplazada';
  if (accion === 'reagendar') {
    cambios.fecha = datos.fecha;
    cambios.hora = datos.hora;
    if (evento.estado !== 'reagendada') cambios.estado = 'reagendada';
  }
  await enviarJSON(`/api/agenda/${evento.id}`, 'PATCH', cambios);
  return {
    estado: (cambios.estado as AgendaCirugia['estado']) ?? evento.estado,
    ...(accion === 'aplazar' ? { motivo_aplazamiento: datos.motivo } : {}),
    ...(accion === 'reagendar' ? { fecha: datos.fecha ?? evento.fecha, hora: datos.hora ?? evento.hora } : {}),
  };
}

function mensaje(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'No se pudo completar la acción';
}

/* ───────── Modal de acción (aplazar / reagendar / cancelar) ───────── */

export function AccionRapidaModal({
  evento,
  accion,
  onClose,
  onDone,
}: {
  evento: AgendaCirugia;
  accion: AccionRapida;
  onClose: () => void;
  onDone: (cambios: Partial<AgendaCirugia>, texto: string) => void;
}) {
  const consulta = esConsulta(evento);
  const [motivo, setMotivo] = useState('');
  const [fecha, setFecha] = useState(evento.fecha || '');
  const [hora, setHora] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Consulta aplazada = mismo día, otra hora. Cirugía aplazada = sin nueva fecha.
  const pideHora = accion === 'reagendar' || (accion === 'aplazar' && consulta);
  const pideFecha = accion === 'reagendar';
  const duracion = consulta ? DURACION_CITA_MIN : evento.duracion_min ?? 60;

  const valido = motivo.trim().length > 0 && (!pideHora || !!hora) && (!pideFecha || !!fecha);

  const confirmar = async () => {
    if (!valido || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const cambios = await ejecutarAccion(evento, accion, { motivo: motivo.trim(), fecha, hora });
      const texto =
        accion === 'cancelar' ? 'Cita cancelada' : accion === 'aplazar' ? 'Cita aplazada' : 'Cita reagendada';
      onDone(cambios, texto);
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-fg">
            {ETIQUETA_ACCION[accion]} {consulta ? (evento.tipo === 'estudio' ? 'estudio' : 'consulta') : 'cirugía'}
          </h3>
          <p className="text-sm text-muted">
            {evento.nombre_paciente}
            {evento.fecha ? ` · ${evento.fecha}` : ''}
            {evento.hora ? ` · ${evento.hora.slice(0, 5)}` : ''}
            {evento.doctor_nombre ? ` · ${evento.doctor_nombre}` : ''}
          </p>
        </div>

        {accion === 'aplazar' && !consulta && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            La cirugía quedará aplazada sin fecha nueva. Para moverla a otro día usa «Reagendar».
          </p>
        )}

        {pideFecha && (
          <FormField label="Nueva fecha" required>
            <input type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); setHora(''); }} className="input-field" />
          </FormField>
        )}
        {pideHora && (
          <SelectorHoraSlot
            label={accion === 'aplazar' ? 'Nueva hora (mismo día)' : 'Nueva hora'}
            required
            medicoId={evento.doctor_id}
            fecha={fecha}
            value={hora}
            onChange={setHora}
            duracion={duracion}
            excluirId={evento.id}
          />
        )}

        <FormField label="Motivo" required>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ej. el paciente solicitó cambio de horario"
            className="input-field resize-none"
          />
        </FormField>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2">
            Volver
          </button>
          <button
            onClick={confirmar}
            disabled={!valido || guardando}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50',
              accion === 'cancelar' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'
            )}
          >
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {accion === 'cancelar' ? 'Cancelar cita' : `Confirmar`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ───────── Alta rápida de consulta / estudio desde la agenda ───────── */

interface DoctorOpcion { id: string; alias: string; tipo_personal?: string | null; cobra_honorarios?: boolean | null }
interface ResultadoBusqueda { tipo: string; id: string; titulo: string; subtitulo: string }


/** La alta rápida de la agenda agenda consultas (Primera consulta / Subsecuente) y estudios. */
const TIPOS_ALTA_RAPIDA = TIPOS_CONSULTA_AGENDA.filter((t) => t.value === 'PRIMERA' || t.value === 'SUBSECUENTE' || t.value === 'ESTUDIOS');

interface ServicioCatalogo { id: string; tipo: string; nombre: string }

export function AgendarRapidoModal({
  fecha: fechaInicial,
  hora: horaInicial,
  doctores,
  doctorInicial,
  tipoInicial = 'PRIMERA',
  onClose,
  onDone,
  onFormularioCompleto,
}: {
  fecha: string;
  hora?: string;
  doctores: DoctorOpcion[];
  doctorInicial?: string;
  tipoInicial?: TipoConsultaAgenda;
  onClose: () => void;
  onDone: () => void;
  onFormularioCompleto: (fecha: string, hora: string, tipo: string) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [paciente, setPaciente] = useState<ResultadoBusqueda | null>(null);
  const [doctorId, setDoctorId] = useState(doctorInicial || '');
  const [fecha, setFecha] = useState(fechaInicial);
  const [hora, setHora] = useState(horaInicial || '');
  const [tipo, setTipo] = useState<TipoConsultaAgenda>(
    TIPOS_ALTA_RAPIDA.some((t) => t.value === tipoInicial) ? tipoInicial : 'PRIMERA'
  );
  const [especialidad, setEspecialidad] = useState('');
  const [estudioId, setEstudioId] = useState('');
  const { especialidades } = useEspecialidades();
  const esEstudio = tipo === 'ESTUDIOS';

  // Estudios del catálogo de la aseguranza del paciente (más los generales).
  const urlEstudios = esEstudio && paciente
    ? `/api/catalogo-servicios?paciente_id=${encodeURIComponent(paciente.id)}&tipo=ESTUDIO`
    : null;
  const { data: catalogo, isLoading: cargandoEstudios } = useSWR<{ servicios?: ServicioCatalogo[] }>(urlEstudios, { revalidateOnFocus: false });
  const estudios = (catalogo?.servicios || []).filter((s) => s.tipo === 'ESTUDIO');

  const cambiarTipo = (nuevo: TipoConsultaAgenda) => {
    setTipo(nuevo);
    if (nuevo !== 'ESTUDIOS') {
      setEstudioId('');
      // Enfermería solo puede ser responsable de un estudio.
      if (doctores.find((d) => d.id === doctorId)?.tipo_personal === 'ENFERMERO') { setDoctorId(''); setHora(''); }
    }
  };
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const termino = useDebounce(busqueda.trim(), 300);
  const url = !paciente && termino.length >= 2 && termino.length <= 60
    ? `/api/search?q=${encodeURIComponent(termino)}&cirugia=todos`
    : null;
  const { data, isLoading } = useSWR<{ results?: ResultadoBusqueda[] }>(url, { keepPreviousData: true, revalidateOnFocus: false });
  const resultados = (data?.results || []).filter((r) => r.tipo === 'paciente');

  const valido = !!paciente && !!doctorId && !!fecha && !!hora && (!esEstudio || !!estudioId);

  const guardar = async () => {
    if (!valido || guardando || !paciente) return;
    const t = opcionTipoConsulta(tipo);
    setGuardando(true);
    setError(null);
    try {
      await enviarJSON('/api/consultas', 'POST', {
        paciente_id: paciente.id,
        doctor_id: doctorId,
        fecha,
        hora_inicio: hora,
        hora_fin: sumarMinutos(hora, DURACION_CITA_MIN),
        tipo_consulta: t.tipo,
        tipo_visita: t.tipoVisita,
        especialidad_id: especialidades.find((e) => e.clave === especialidad)?.id || null,
        ...(esEstudio && estudioId
          ? { estudios: [{ id: estudioId, nombre: estudios.find((e) => e.id === estudioId)?.nombre || 'Estudio', doctor_id: doctorId }] }
          : {}),
      });
      onDone();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-fg">{esEstudio ? 'Agendar estudio' : 'Agendar consulta'}</h3>
          <p className="text-sm text-muted">
            {esEstudio
              ? 'Alta rápida sin salir de la agenda. El costo se toma del catálogo de la aseguranza del paciente.'
              : 'Alta rápida sin salir de la agenda. Costos y estudios se completan después en el detalle.'}
          </p>
        </div>

        <FormField label="Paciente" required>
          {paciente ? (
            <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-fg">{paciente.titulo}</p>
                {paciente.subtitulo && <p className="truncate text-xs text-muted">{paciente.subtitulo}</p>}
              </div>
              <button onClick={() => { setPaciente(null); setBusqueda(''); setEstudioId(''); }} className="text-xs font-bold text-primary-600 hover:underline">
                Cambiar
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o teléfono…"
                className="input-field pl-9"
                aria-label="Buscar paciente"
              />
              {isLoading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary-500" />}
              {url && resultados.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
                  {resultados.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => setPaciente(r)} className="w-full px-3 py-2 text-left hover:bg-surface-2">
                        <p className="text-sm font-bold text-fg">{r.titulo}</p>
                        {r.subtitulo && <p className="text-xs text-muted">{r.subtitulo}</p>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {url && !isLoading && resultados.length === 0 && (
                <p className="mt-1 text-xs text-muted">Sin resultados. Para registrar un paciente nuevo usa el formulario completo.</p>
              )}
            </div>
          )}
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Tipo de consulta" required>
            <select value={tipo} onChange={(e) => cambiarTipo(e.target.value as TipoConsultaAgenda)} className="input-field">
              {TIPOS_ALTA_RAPIDA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </FormField>
          <FormField label="Especialidad">
            <select value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} className="input-field">
              <option value="">Seleccionar</option>
              {especialidades.map((e) => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}
            </select>
          </FormField>
          {esEstudio && (
            <div className="sm:col-span-2">
              <FormField label="Estudio" required>
                <select
                  value={estudioId}
                  onChange={(e) => setEstudioId(e.target.value)}
                  disabled={!paciente || cargandoEstudios}
                  className="input-field"
                >
                  <option value="">
                    {!paciente ? 'Primero selecciona al paciente' : cargandoEstudios ? 'Cargando estudios…' : estudios.length ? 'Seleccionar estudio' : 'Sin estudios en el catálogo'}
                  </option>
                  {estudios.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </FormField>
            </div>
          )}
          <FormField label={esEstudio ? 'Realizado por' : 'Médico'} required>
            <select value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setHora(''); }} className="input-field">
              <option value="">Seleccionar</option>
              {doctores
                // Enfermería: solo en consultas tipo Estudios y con honorarios activos.
                .filter((d) => d.tipo_personal !== 'ANESTESIOLOGO' && (d.tipo_personal !== 'ENFERMERO' || (tipo === 'ESTUDIOS' && d.cobra_honorarios !== false)))
                .map((d) => <option key={d.id} value={d.id}>{d.alias}{d.tipo_personal === 'ENFERMERO' ? ' · enfermería' : ''}</option>)}
            </select>
          </FormField>
          <FormField label="Fecha" required>
            <input type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); setHora(''); }} className="input-field" />
          </FormField>
          <SelectorHoraSlot label="Hora" required medicoId={doctorId} fecha={fecha} value={hora} onChange={setHora} />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            onClick={() => onFormularioCompleto(fecha, hora, tipo)}
            className="text-xs font-bold text-primary-600 hover:underline"
          >
            Abrir formulario completo
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2">
              Cerrar
            </button>
            <button
              onClick={guardar}
              disabled={!valido || guardando}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              Agendar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
