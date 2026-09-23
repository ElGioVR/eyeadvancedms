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
 * Detecta traslapes de agenda para un médico o recurso en el horario propuesto.
 * Fuentes: consultas, conceptos de consulta (estudios/procedimientos) y cirugías.
 * Las cirugías canceladas se excluyen.
 */
export async function detectarConflictosAgenda(
  input: DetectarConflictosInput
): Promise<ConflictoAgenda[]> {
  const supabase = getSupabaseAdmin();
  const { fecha, hora, duracion_min, medicos, recurso_id } = input;

  if (medicos.length === 0 && !recurso_id) return [];

  const nuevoInicio = timeToMinutes(hora);
  const nuevoFin = nuevoInicio + duracion_min;
  const horaFinStr = addMinutesToTime(hora, duracion_min);

  const conflictos: ConflictoAgenda[] = [];

  // 1. Consultas (todos los tipos incluyen al médico principal)
  if (medicos.length > 0) {
    const { data: consultas } = await supabase
      .from('consultas')
      .select('id, doctor_id, paciente_id, fecha, hora_inicio, hora_fin, tipo_consulta')
      .eq('fecha', fecha)
      .in('doctor_id', medicos);

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
    const { data: conceptos } = await supabase
      .from('consulta_conceptos')
      .select(
        'id, tipo_concepto, doctor_id, consultas!inner(id, fecha, hora_inicio, hora_fin)'
      )
      .in('doctor_id', medicos)
      .eq('consultas.fecha', fecha)
      .in('tipo_concepto', ['ESTUDIO', 'PROCEDIMIENTO']);

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
    const { data: cirugiasDoctor } = await supabase
      .from('agenda_cirugias')
      .select('id, doctor_id, fecha, hora, duracion_min, estado')
      .eq('fecha', fecha)
      .in('doctor_id', medicos)
      .neq('estado', 'cancelada');

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

    const { data: cirugiasParticipante } = await supabase
      .from('cirugia_participantes')
      .select(
        'medico_id, agenda_cirugias!inner(id, fecha, hora, duracion_min, estado)'
      )
      .in('medico_id', medicos)
      .eq('agenda_cirugias.fecha', fecha)
      .neq('agenda_cirugias.estado', 'cancelada');

    for (const cp of cirugiasParticipante || []) {
      const c = (cp as any).agenda_cirugias as {
        id: string;
        fecha: string;
        hora: string;
        duracion_min: number | null;
        estado: string;
      };
      const inicio = timeToMinutes(c.hora);
      const duracion = c.duracion_min ?? DEFAULT_DURACION_MIN;
      const fin = inicio + duracion;
      if (overlap(nuevoInicio, nuevoFin, inicio, fin)) {
        conflictos.push({
          tipo: 'cirugia',
          entidad_id: c.id,
          medico_id: cp.medico_id,
          fecha: c.fecha,
          hora_inicio: c.hora,
          hora_fin: addMinutesToTime(c.hora, duracion),
          descripcion: 'El médico ya participa en otra cirugía a esta hora',
        });
      }
    }
  }

  // 4. Conflictos por recurso / quirófano
  if (recurso_id) {
    const { data: cirugiasRecurso } = await supabase
      .from('agenda_cirugias')
      .select('id, fecha, hora, duracion_min, estado, recurso_id')
      .eq('fecha', fecha)
      .eq('recurso_id', recurso_id)
      .neq('estado', 'cancelada');

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
