/**
 * Bandeja de la agenda: citas que requieren una acción de recepción.
 *
 * - «Por confirmar»: cirugías, consultas y estudios activos de hoy y mañana
 *   (hora de Tijuana) que aún no empiezan y no están confirmados. Se confirma
 *   por WhatsApp (wa.me) y se marca a mano «Mensaje enviado» / «Confirmó».
 * - «Por cerrar»: citas activas cuya hora de fin ya pasó (sin hora fin: inicio
 *   + duración; sin hora: al terminar el día) y siguen sin completar, aplazar
 *   ni cancelar. Se revisan los últimos DIAS_ATRAS_BANDEJA días.
 *
 * Puro (sin BD ni React): se prueba en src/lib/__tests__/bandeja-agenda.test.ts.
 */

export const TIMEZONE_CLINICA = 'America/Tijuana';
/** Días hacia atrás que revisa «Por cerrar» (evita arrastrar históricos importados). */
export const DIAS_ATRAS_BANDEJA = 15;
/** Duración por defecto cuando la cita no trae hora fin ni duración. */
export const DURACION_DEFECTO_CONSULTA_MIN = 60;
export const DURACION_DEFECTO_CIRUGIA_MIN = 60;

export type ConfirmacionCita = 'enviada' | 'confirmada';
export type TipoEventoBandeja = 'cirugia' | 'consulta' | 'estudio';
export type SeccionBandeja = 'por_confirmar' | 'por_cerrar';

/** Estados que siguen «abiertos» (la cita va a ocurrir o ya ocurrió sin cerrarse). */
export const ESTADOS_ACTIVOS_CIRUGIA = ['agendada', 'reagendada'] as const;
/** Consulta APLAZADA = mismo día a otra hora: sigue activa. */
export const ESTATUS_ACTIVOS_CONSULTA = ['BORRADOR', 'AGENDADA', 'REAGENDADA', 'APLAZADA'] as const;

export interface AhoraClinica {
  /** YYYY-MM-DD en hora de Tijuana. */
  fecha: string;
  /** Minutos desde medianoche en hora de Tijuana. */
  minutos: number;
}

export function ahoraClinica(now = new Date()): AhoraClinica {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_CLINICA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => partes.find((p) => p.type === t)?.value || '00';
  return { fecha: `${get('year')}-${get('month')}-${get('day')}`, minutos: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** YYYY-MM-DD ± días (sin zona horaria). */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function horaAMin(hora: string | null | undefined): number | null {
  const m = (hora || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export interface EventoBandejaBase {
  tipo: TipoEventoBandeja;
  fecha: string | null;
  hora: string | null;
  hora_fin?: string | null;
  duracion_min?: number | null;
  confirmacion?: ConfirmacionCita | null;
}

/** Minuto (del día de la cita) en que termina; null si no tiene hora. */
export function finCitaMin(e: EventoBandejaBase): number | null {
  const ini = horaAMin(e.hora);
  if (ini === null) return null;
  const fin = horaAMin(e.hora_fin);
  if (fin !== null && fin > ini) return fin;
  const dur = e.duracion_min && e.duracion_min > 0
    ? e.duracion_min
    : e.tipo === 'cirugia' ? DURACION_DEFECTO_CIRUGIA_MIN : DURACION_DEFECTO_CONSULTA_MIN;
  return ini + dur;
}

/**
 * Sección de la bandeja para una cita ACTIVA (el llamador filtra el estado).
 * null = no requiere acción ahora.
 */
export function clasificarBandeja(e: EventoBandejaBase, ahora: AhoraClinica): SeccionBandeja | null {
  if (!e.fecha) return null; // cirugías aplazadas sin fecha: no es tarea de la bandeja
  const desde = sumarDias(ahora.fecha, -DIAS_ATRAS_BANDEJA);
  const manana = sumarDias(ahora.fecha, 1);
  if (e.fecha < desde || e.fecha > manana) return null;

  const fin = finCitaMin(e);
  const termino = e.fecha < ahora.fecha || (e.fecha === ahora.fecha && fin !== null && fin <= ahora.minutos);
  if (termino) return 'por_cerrar';

  // Hoy (aún no termina) o mañana: confirmar si no está confirmada.
  // Si ya empezó (en curso) no tiene caso pedir confirmación.
  const ini = horaAMin(e.hora);
  const enCurso = e.fecha === ahora.fecha && ini !== null && ini <= ahora.minutos;
  if (enCurso) return null;
  return e.confirmacion === 'confirmada' ? null : 'por_confirmar';
}

/** Texto corto de cuánto lleva vencida o cuánto falta (para la tarjeta). */
export function etiquetaTiempo(e: EventoBandejaBase, ahora: AhoraClinica): string {
  if (!e.fecha) return '';
  if (e.fecha === ahora.fecha) {
    const ini = horaAMin(e.hora);
    if (ini === null) return 'Hoy';
    const fin = finCitaMin(e) ?? ini;
    if (fin <= ahora.minutos) {
      const h = Math.floor((ahora.minutos - fin) / 60);
      return h >= 1 ? `Terminó hace ${h} h` : `Terminó hace ${ahora.minutos - fin} min`;
    }
    const falta = ini - ahora.minutos;
    if (falta <= 0) return 'En curso';
    return falta >= 60 ? `Hoy, en ${Math.floor(falta / 60)} h ${falta % 60 ? `${falta % 60} min` : ''}`.trim() : `Hoy, en ${falta} min`;
  }
  if (e.fecha === sumarDias(ahora.fecha, 1)) return 'Mañana';
  if (e.fecha < ahora.fecha) {
    const dias = Math.round((Date.parse(`${ahora.fecha}T00:00:00Z`) - Date.parse(`${e.fecha}T00:00:00Z`)) / 86_400_000);
    return dias === 1 ? 'Ayer' : `Hace ${dias} días`;
  }
  return '';
}

/* ─────────── Detalle visible de la cita (tarjetas de la agenda) ─────────── */

/**
 * Qué es la cita, para mostrar en la tarjeta:
 * - Cirugía: procedimiento (+ ojo).
 * - Estudio: nombre de los estudios.
 * - Procedimiento en consultorio: el procedimiento.
 * - Consulta: Primera consulta / Subsecuente (+ especialidad).
 */
export function detalleEvento(e: {
  tipo: TipoEventoBandeja;
  tipo_consulta?: string | null;
  tipo_consulta_label?: string | null;
  especialidad?: string | null;
  procedimiento?: string | null;
  ojo?: string | null;
  estudios?: Array<string | null | undefined>;
}): string | null {
  const limpio = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();
  if (e.tipo === 'cirugia') {
    const proc = limpio(e.procedimiento);
    const ojo = limpio(e.ojo);
    return proc ? (ojo ? `${proc} ${ojo}` : proc) : null;
  }
  if (e.tipo === 'estudio') {
    const estudios = (e.estudios || []).map(limpio).filter(Boolean);
    return estudios.length ? estudios.join(', ') : 'Estudio';
  }
  if ((e.tipo_consulta || '').toUpperCase().includes('PROCEDIMIENTO')) {
    return limpio(e.procedimiento) || 'Procedimiento';
  }
  const tipo = limpio(e.tipo_consulta_label) || 'Consulta';
  const esp = limpio(e.especialidad);
  return esp ? `${tipo} · ${esp}` : tipo;
}

/* ─────────── Seguimiento: qué pasó con una cita pasada ─────────── */

export type ResultadoClave = 'completada' | 'cancelada' | 'aplazada' | 'pendiente' | 'sin_cerrar' | 'proxima';
export const ETIQUETA_RESULTADO: Record<ResultadoClave, string> = {
  completada: 'Completada',
  cancelada: 'Cancelada',
  aplazada: 'Aplazada',
  pendiente: 'Pendiente',
  sin_cerrar: 'Sin cerrar',
  proxima: 'Próxima',
};
/** Filtros del buscador de seguimiento. */
export const FILTROS_SEGUIMIENTO = ['todas', 'sin_cerrar', 'completada', 'cancelada', 'aplazada', 'pendiente'] as const;
export type FiltroSeguimiento = (typeof FILTROS_SEGUIMIENTO)[number];

/**
 * Resultado de la cita a partir de su estado en BD.
 * - Cirugía: agendada/reagendada → sin cerrar (si ya pasó) o próxima.
 * - Consulta: PROCESADA/COMPLETADA/FINALIZADA → completada; PENDIENTE_ESTUDIO /
 *   PENDIENTE_CIRUGIA → pendiente (requiere seguimiento); el resto activo → sin cerrar.
 */
export function resultadoCita(
  e: { tipo: TipoEventoBandeja; estado: string; fecha: string | null; hora: string | null; hora_fin?: string | null; duracion_min?: number | null },
  ahora: AhoraClinica,
): { clave: ResultadoClave; detalle: string | null } {
  const est = (e.estado || '').toUpperCase();
  const paso = () => {
    if (!e.fecha) return false;
    if (e.fecha < ahora.fecha) return true;
    if (e.fecha > ahora.fecha) return false;
    const fin = finCitaMin({ tipo: e.tipo, fecha: e.fecha, hora: e.hora, hora_fin: e.hora_fin, duracion_min: e.duracion_min });
    return fin !== null && fin <= ahora.minutos;
  };
  if (e.tipo === 'cirugia') {
    if (est === 'COMPLETADA') return { clave: 'completada', detalle: null };
    if (est === 'CANCELADA') return { clave: 'cancelada', detalle: null };
    if (est === 'APLAZADA') return { clave: 'aplazada', detalle: e.fecha ? null : 'Sin fecha nueva' };
    return paso() ? { clave: 'sin_cerrar', detalle: null } : { clave: 'proxima', detalle: est === 'REAGENDADA' ? 'Reagendada' : null };
  }
  if (est === 'PROCESADA' || est === 'COMPLETADA' || est === 'FINALIZADA') return { clave: 'completada', detalle: null };
  if (est === 'CANCELADA') return { clave: 'cancelada', detalle: null };
  if (est === 'PENDIENTE_ESTUDIO') return { clave: 'pendiente', detalle: 'Pendiente de estudio' };
  if (est === 'PENDIENTE_CIRUGIA') return { clave: 'pendiente', detalle: 'Pendiente de cirugía' };
  if (paso()) return { clave: 'sin_cerrar', detalle: est === 'APLAZADA' ? 'Aplazada' : est === 'REAGENDADA' ? 'Reagendada' : null };
  return { clave: 'proxima', detalle: est === 'REAGENDADA' ? 'Reagendada' : est === 'APLAZADA' ? 'Aplazada' : null };
}

export function pasaFiltro(clave: ResultadoClave, filtro: FiltroSeguimiento): boolean {
  return filtro === 'todas' || clave === filtro;
}

const ESTADO_LEGIBLE: Record<string, string> = {
  agendada: 'Agendada', aplazada: 'Aplazada', reagendada: 'Reagendada', completada: 'Completada', cancelada: 'Cancelada',
  BORRADOR: 'Borrador', AGENDADA: 'Agendada', PROCESADA: 'Procesada', PENDIENTE_ESTUDIO: 'Pendiente de estudio',
  PENDIENTE_CIRUGIA: 'Pendiente de cirugía', APLAZADA: 'Aplazada', REAGENDADA: 'Reagendada', COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada', FINALIZADA: 'Finalizada',
};
const legible = (v: unknown) => (typeof v === 'string' ? ESTADO_LEGIBLE[v] || v : '');
const fechaHora = (f: unknown, h: unknown) => {
  const fs = typeof f === 'string' ? f : '';
  const hs = typeof h === 'string' ? h.slice(0, 5) : '';
  if (!fs && !hs) return '';
  const [y, m, d] = fs.split('-');
  return `${fs ? `${d}/${m}/${y}` : ''}${hs ? ` ${hs}` : ''}`.trim();
};

/**
 * Texto de un evento del historial (consulta_historial o cirugia_historial).
 * Devuelve { titulo, motivo } o null si el evento no aporta al seguimiento.
 */
export function describirEventoHistorial(
  tipo: TipoEventoBandeja,
  evento: string,
  datos: Record<string, unknown> | null | undefined,
): { titulo: string; motivo: string | null } | null {
  const p = datos || {};
  const motivo = typeof p.motivo === 'string' && p.motivo.trim() ? p.motivo.trim() : null;
  if (tipo === 'cirugia') {
    if (evento === 'ESTADO_CAMBIADO') {
      return { titulo: `${legible(p.de) || '—'} → ${legible(p.a) || '—'}`, motivo };
    }
    return null; // archivos y demás: no son seguimiento de la cita
  }
  switch (evento) {
    case 'CREACION':
      return { titulo: 'Cita creada', motivo: null };
    case 'CAMBIO_ESTATUS':
      return { titulo: `${legible(p.de) || '—'} → ${legible(p.a) || '—'}`, motivo };
    case 'CANCELACION':
      return { titulo: 'Cancelada', motivo };
    case 'REAGENDADO': {
      const ant = fechaHora(p.fecha_anterior, p.hora_anterior);
      const nva = fechaHora(p.fecha_nueva, p.hora_nueva);
      const que = p.accion === 'aplazamiento' ? 'Aplazada' : 'Reagendada';
      return { titulo: ant || nva ? `${que}: ${ant || '—'} → ${nva || '—'}` : que, motivo };
    }
    case 'PAGADO':
      return { titulo: 'Pago registrado', motivo: null };
    case 'EDICION':
      return { titulo: 'Datos editados', motivo: null };
    default:
      return null;
  }
}
