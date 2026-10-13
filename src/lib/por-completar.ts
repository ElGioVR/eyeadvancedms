import { interpretarLio } from '@/lib/import-lentes-puro';

/*
 * Reglas únicas de «Pendientes por completar» (cirugías y consultas), compartidas por la
 * API, la bandeja de la agenda y la página de cirugías pendientes. Sin dependencias de servidor.
 */

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** ¿El procedimiento lleva lente intraocular? (facoemulsificación, «+LIO», catarata…) */
export function requiereLente(procedimiento: string | null | undefined): boolean {
  const t = sinAcentos(procedimiento ?? '');
  return /FACO|\bLIO\b|CATARATA|IMPLANTE (DE )?LENTE|IMPLANTE SECUNDARIO/.test(t);
}

export interface LenteResumen {
  orden: string;
  modo: string | null;
  estado_logistica: string | null;
  fabricante: string | null;
  modelo: string | null;
  poder_d: number | null;
  torico: boolean | null;
  cilindro: number | null;
}

export interface CirugiaParaCompletar {
  fecha?: string | null;
  hora?: string | null;
  ojo?: string | null;
  anestesia?: string | null;
  procedimiento?: string | null;
  servicio?: { nombre?: string | null } | null;
  estado?: string | null;
  lio?: string | null;
  marca_lio?: string | null;
  notas?: string | null;
  /** undefined = no se pudo leer (no se evalúa el lente). */
  lentes?: LenteResumen[] | null;
}

export interface FaltantesCirugia {
  /** Datos que faltan: fecha, hora, ojo, procedimiento, anestesia, lente. */
  faltan: string[];
  /** Pendientes de logística que no son «faltantes»: por_solicitar, por_comprar. */
  info: string[];
  /** Detalle legible de lo que falta del lente. */
  detalleLente: string[];
}

export const ETIQUETA_FALTANTE: Record<string, string> = {
  fecha: 'Fecha', hora: 'Hora', ojo: 'Ojo', procedimiento: 'Procedimiento', anestesia: 'Anestesia', lente: 'Lente',
  doctor: 'Doctor', aseguradora: 'Aseguradora',
};
export const ETIQUETA_INFO: Record<string, string> = {
  por_solicitar: 'Lente por solicitar',
  por_comprar: 'Lente por comprar (compra directa)',
};

export function faltantesCirugia(c: CirugiaParaCompletar): FaltantesCirugia {
  const estado = String(c.estado ?? '').toLowerCase();
  const aplazada = estado === 'aplazada';
  const faltan: string[] = [];
  const info: string[] = [];
  let detalleLente: string[] = [];
  // Una aplazada está pendiente de programar: no se le exige fecha, hora ni anestesia.
  if (!aplazada) {
    if (!c.fecha) faltan.push('fecha');
    if (!c.hora || c.hora.slice(0, 5) === '00:00') faltan.push('hora');
  }
  if (!c.ojo) faltan.push('ojo');
  const proc = c.servicio?.nombre || c.procedimiento;
  if (!proc) faltan.push('procedimiento');
  if (!aplazada && !c.anestesia) faltan.push('anestesia');

  if (c.lentes !== undefined && c.lentes !== null && requiereLente(proc)) {
    const interp = interpretarLio(c.lio, c.marca_lio, c.notas);
    detalleLente = interp.pendientes.slice();
    // Estos tres modos/estados se leen del plan guardado; «sin lente» es lo que falta definir.
    if (c.lentes.length === 0 && detalleLente.length === 0) detalleLente.push('sin lente definido');
    for (const l of c.lentes) {
      if (l.poder_d == null) detalleLente.push(`${l.orden.toLowerCase()}: falta el poder (D)`);
      if (l.torico && l.cilindro == null && !l.modelo) detalleLente.push(`${l.orden.toLowerCase()}: tórico sin cilindro`);
    }
    if (c.lentes.length === 0 || detalleLente.length > 0) faltan.push('lente');
    if (c.lentes.some((l) => l.estado_logistica === 'POR_SOLICITAR')) info.push('por_solicitar');
    if (c.lentes.some((l) => l.estado_logistica === 'POR_COMPRAR')) info.push('por_comprar');
  }
  return { faltan, info, detalleLente: Array.from(new Set(detalleLente)) };
}

export interface ConsultaParaCompletar {
  hora_inicio?: string | null;
  doctor_id?: string | null;
  aseguranza_id?: string | null;
}

export function faltantesConsulta(c: ConsultaParaCompletar): string[] {
  const f: string[] = [];
  if (!c.hora_inicio || c.hora_inicio.slice(0, 5) === '00:00') f.push('hora');
  if (!c.doctor_id) f.push('doctor');
  if (!c.aseguranza_id) f.push('aseguradora');
  return f;
}
