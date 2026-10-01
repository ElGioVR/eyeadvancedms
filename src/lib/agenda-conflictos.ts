import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface ConflictoAgenda {
  tipo: 'consulta' | 'estudio' | 'procedimiento' | 'cirugia';
  entidad_id: string;
  medico_id?: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  descripcion: string;
}

interface DetectarConflictosInput {
  fecha: string;
  hora: string;
  duracion_min: number;
  medicos: string[];
  recurso_id?: string | null;
}

const DEFAULT_DURACION_MIN = 60;

function timeToMinutes(time: string | null): number {
  if (!time) return 0;
  const [h, m] = time.split(':');
  return parseInt(h || '0', 10) * 60 + parseInt(m || '0', 10);
}

function addMinutesToTime(time: string, minutes: number): string {
  const total = timeToMinutes(time) + minutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function overlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && endA > startB;
}

/**
 * Participaciones del día con horario propio; si la BD aún no tiene las
 * columnas (mig. 370), repite sin ellas para no perder la detección.
 */
async function participantesDelDia(supabase: ReturnType<typeof getSupabaseAdmin>, medicos: string[], fecha: string) {
  const base = (cols: string) =>
    supabase
      .from('cirugia_participantes')
      .select(cols)
      .in('medico_id', medicos)
      .eq('agenda_cirugias.fecha', fecha)
      .neq('agenda_cirugias.estado', 'cancelada');
  const conHorario = await base('medico_id, hora_inicio, hora_fin, agenda_cirugias!inner(id, fecha, hora, duracion_min, estado)');
  if (!conHorario.error) return { data: conHorario.data as any[] };
  const sinHorario = await base('medico_id, agenda_cirugias!inner(id, fecha, hora, duracion_min, estado)');
  return { data: (sinHorario.data as any[]) || [] };
}

/**
 * Detecta traslapes de agenda para un médico o recurso en el horario propuesto.
 * Fuentes: consultas, conceptos de consulta (estudios/procedimientos) y cirugías.
 * Las cirugías canceladas se excluyen.
 *
 * Nota: es una verificación previa (check-then-insert). Dos solicitudes
 * simultáneas pueden pasar ambas la verificación antes de que cualquiera
 * inserte; cerrar esa carrera requiere una restricción/lock en BD.
 */
export async function detectarConflictosAgenda(
  input: DetectarConflictosInput
): Promise<ConflictoAgenda[]> {
  const supabase = getSupabaseAdmin();
  const { fecha, hora, duracion_min, recurso_id } = input;
  // Sin duplicados: el mismo médico en dos roles no debe duplicar consultas ni conflictos.
  const medicos = Array.from(new Set(input.medicos.filter(Boolean)));

  if (medicos.length === 0 && !recurso_id) return [];

  const nuevoInicio = timeToMinutes(hora);
  const nuevoFin = nuevoInicio + duracion_min;
  const horaFinStr = addMinutesToTime(hora, duracion_min);

  const conflictos: ConflictoAgenda[] = [];
  const hayMedicos = medicos.length > 0;
  const vacio = Promise.resolve({ data: [] as any[] });

  // Las 5 fuentes son independientes: se consultan en paralelo (antes 5 viajes
  // en serie). El orden de los conflictos devueltos se mantiene.
  const [
    { data: consultas },
    { data: conceptos },
    { data: cirugiasDoctor },
    { data: cirugiasParticipante },
    { data: cirugiasRecurso },
  ] = await Promise.all([
    hayMedicos
      ? supabase
          .from('consultas')
          .select('id, doctor_id, paciente_id, fecha, hora_inicio, hora_fin, tipo_consulta')
          .eq('fecha', fecha)
          .in('doctor_id', medicos)
          // Una consulta cancelada libera su horario (antes seguía bloqueándolo).
          .or('estatus.is.null,estatus.neq.CANCELADA')
      : vacio,
    hayMedicos
      ? supabase
          .from('consulta_conceptos')
          .select(
            'id, tipo_concepto, doctor_id, consultas!inner(id, fecha, hora_inicio, hora_fin, estatus)'
          )
          .in('doctor_id', medicos)
          .eq('consultas.fecha', fecha)
          .neq('consultas.estatus', 'CANCELADA')
          .in('tipo_concepto', ['ESTUDIO', 'PROCEDIMIENTO'])
      : vacio,
    hayMedicos
      ? supabase
          .from('agenda_cirugias')
          .select('id, doctor_id, fecha, hora, duracion_min, estado')
          .eq('fecha', fecha)
          .in('doctor_id', medicos)
          .neq('estado', 'cancelada')
      : vacio,
    hayMedicos ? participantesDelDia(supabase, medicos, fecha) : vacio,
    recurso_id
      ? supabase
          .from('agenda_cirugias')
          .select('id, fecha, hora, duracion_min, estado, recurso_id')
          .eq('fecha', fecha)
          .eq('recurso_id', recurso_id)
          .neq('estado', 'cancelada')
      : vacio,
  ]);

  // 1. Consultas (todos los tipos incluyen al médico principal)
  if (hayMedicos) {
    for (const c of consultas || []) {
      const inicio = timeToMinutes(c.hora_inicio);
      const fin = c.hora_fin ? timeToMinutes(c.hora_fin) : inicio + DEFAULT_DURACION_MIN;
      if (overlap(nuevoInicio, nuevoFin, inicio, fin)) {
        conflictos.push({
          tipo: (c.tipo_consulta as 'consulta' | 'estudio' | 'procedimiento') || 'consulta',
          entidad_id: c.id,
          medico_id: c.doctor_id,
          fecha: c.fecha,
          hora_inicio: c.hora_inicio,
          hora_fin: c.hora_fin || addMinutesToTime(c.hora_inicio, DEFAULT_DURACION_MIN),
          descripcion: `El médico ya tiene una ${c.tipo_consulta || 'consulta'} a esta hora`,
        });
      }
    }

    // 2. Estudios / procedimientos asignados a otros doctores dentro de una consulta

    for (const cc of conceptos || []) {
      const c = (cc as any).consultas as {
        id: string;
        fecha: string;
        hora_inicio: string;
        hora_fin: string | null;
      };
      const inicio = timeToMinutes(c.hora_inicio);
      const fin = c.hora_fin ? timeToMinutes(c.hora_fin) : inicio + DEFAULT_DURACION_MIN;
      if (overlap(nuevoInicio, nuevoFin, inicio, fin)) {
        conflictos.push({
          tipo: cc.tipo_concepto === 'ESTUDIO' ? 'estudio' : 'procedimiento',
          entidad_id: c.id,
          medico_id: cc.doctor_id,
          fecha: c.fecha,
          hora_inicio: c.hora_inicio,
          hora_fin: c.hora_fin || addMinutesToTime(c.hora_inicio, DEFAULT_DURACION_MIN),
          descripcion: `El médico ya tiene un ${cc.tipo_concepto === 'ESTUDIO' ? 'estudio' : 'procedimiento'} a esta hora`,
        });
      }
    }

    // 3. Cirugías donde el médico es el doctor principal (legacy) o participante

    for (const c of cirugiasDoctor || []) {
      const inicio = timeToMinutes(c.hora);
      const duracion = c.duracion_min ?? DEFAULT_DURACION_MIN;
      const fin = inicio + duracion;
      if (overlap(nuevoInicio, nuevoFin, inicio, fin)) {
        conflictos.push({
          tipo: 'cirugia',
          entidad_id: c.id,
          medico_id: c.doctor_id,
          fecha: c.fecha,
          hora_inicio: c.hora,
          hora_fin: addMinutesToTime(c.hora, duracion),
          descripcion: 'El médico ya tiene una cirugía a esta hora',
        });
      }
    }


    for (const cp of cirugiasParticipante || []) {
      const c = (cp as any).agenda_cirugias as {
        id: string;
        fecha: string;
        hora: string;
        duracion_min: number | null;
        estado: string;
      };
      // Horario propio del participante (mig. 370) o, si no tiene, el de la cirugía.
      const propio = (cp as any).hora_inicio && (cp as any).hora_fin;
      const horaIni: string = propio ? (cp as any).hora_inicio : c.hora;
      const inicio = timeToMinutes(horaIni);
      const fin = propio ? timeToMinutes((cp as any).hora_fin) : inicio + (c.duracion_min ?? DEFAULT_DURACION_MIN);
      if (overlap(nuevoInicio, nuevoFin, inicio, fin)) {
        conflictos.push({
          tipo: 'cirugia',
          entidad_id: c.id,
          medico_id: cp.medico_id,
          fecha: c.fecha,
          hora_inicio: horaIni,
          hora_fin: addMinutesToTime(horaIni, fin - inicio),
          descripcion: 'El médico ya participa en otra cirugía a esta hora',
        });
      }
    }
  }

  // 4. Conflictos por recurso / quirófano
  if (recurso_id) {

    for (const c of cirugiasRecurso || []) {
      const inicio = timeToMinutes(c.hora);
      const duracion = c.duracion_min ?? DEFAULT_DURACION_MIN;
      const fin = inicio + duracion;
      if (overlap(nuevoInicio, nuevoFin, inicio, fin)) {
        conflictos.push({
          tipo: 'cirugia',
          entidad_id: c.id,
          fecha: c.fecha,
          hora_inicio: c.hora,
          hora_fin: addMinutesToTime(c.hora, duracion),
          descripcion: 'El quirófano/recurso ya está ocupado a esta hora',
        });
      }
    }
  }

  return conflictos;
}

/** Mensaje/respuesta estándar cuando la BD rechaza un empalme (trigger consultas_validar_empalme). */
export const MENSAJE_EMPALME = 'Conflicto de agenda: el médico ya tiene una cita en ese horario';

/**
 * ¿El error de Supabase es el rechazo del trigger anti-empalmes?
 * (SQLSTATE 23P01 + mensaje EMPALME_AGENDA; ver migración 1800000000320).
 */
export function esEmpalmeAgenda(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  return !!error && (error.code === '23P01' || /EMPALME_AGENDA/.test(error.message || ''));
}

export interface ConflictoPersonal {
  personal_id: string;
  nombre: string;
  cirugia_id: string;
  hora_inicio: string;
  hora_fin: string;
  descripcion: string;
}

/**
 * Empalmes del personal de apoyo (personal_clinico) con otras cirugías no
 * canceladas del mismo día. Usa el horario propio de cada asignación o, si
 * no lo tiene, el de la cirugía. Verificación previa (sin lock), igual que
 * la de médicos en cirugías.
 */
export async function detectarConflictosPersonal(input: {
  fecha: string;
  miembros: { personal_id: string; hora_inicio: string; hora_fin: string }[];
  excluirCirugiaId?: string;
}): Promise<ConflictoPersonal[]> {
  const ids = Array.from(new Set(input.miembros.map((m) => m.personal_id)));
  if (ids.length === 0) return [];
  const { data, error } = await getSupabaseAdmin()
    .from('cirugia_personal')
    .select('personal_id, nombre, hora_inicio, hora_fin, agenda_cirugias!inner(id, fecha, hora, duracion_min, estado)')
    .in('personal_id', ids)
    .eq('agenda_cirugias.fecha', input.fecha)
    .neq('agenda_cirugias.estado', 'cancelada');
  if (error || !data) return [];

  const out: ConflictoPersonal[] = [];
  for (const m of input.miembros) {
    const a = timeToMinutes(m.hora_inicio);
    const b = timeToMinutes(m.hora_fin);
    for (const row of data as any[]) {
      const c = row.agenda_cirugias as { id: string; hora: string; duracion_min: number | null };
      if (row.personal_id !== m.personal_id || c.id === input.excluirCirugiaId) continue;
      const ini = row.hora_inicio || c.hora;
      const fin = row.hora_fin ? timeToMinutes(row.hora_fin) : timeToMinutes(c.hora) + (c.duracion_min ?? DEFAULT_DURACION_MIN);
      if (overlap(a, b, timeToMinutes(ini), fin)) {
        out.push({
          personal_id: m.personal_id,
          nombre: row.nombre,
          cirugia_id: c.id,
          hora_inicio: ini,
          hora_fin: addMinutesToTime(ini, fin - timeToMinutes(ini)),
          descripcion: `${row.nombre} ya está asignado(a) a otra cirugía de ${String(ini).slice(0, 5)} a ${addMinutesToTime(ini, fin - timeToMinutes(ini)).slice(0, 5)}`,
        });
      }
    }
  }
  return out;
}
