/**
 * Datos personales del paciente para mostrar junto a su nombre (ficha):
 * expediente, sexo, fecha de nacimiento y edad exacta.
 * Funciones puras (la fecha de referencia se pasa como parámetro) para poder
 * probarse en src/lib/__tests__/ficha-paciente.test.ts.
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function partes(fecha: string | null | undefined): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha || '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** 'H' / 'MASCULINO' → Hombre · 'M' / 'FEMENINO' → Mujer. */
export function sexoLegible(sexo: string | null | undefined): string | null {
  const s = (sexo || '').trim().toUpperCase();
  if (s === 'H' || s === 'MASCULINO' || s === 'HOMBRE') return 'Hombre';
  if (s === 'M' || s === 'F' || s === 'FEMENINO' || s === 'MUJER') return 'Mujer';
  if (s === 'OTRO') return 'Otro';
  return null;
}

/** '1943-02-28' → «28 de febrero de 1943». */
export function fechaNacimientoLegible(fecha: string | null | undefined): string | null {
  const p = partes(fecha);
  if (!p) return null;
  return `${p[2]} de ${MESES[p[1] - 1]} de ${p[0]}`;
}

/** Hoy en Tijuana como 'YYYY-MM-DD' (la edad cambia a medianoche local). */
export function hoyTijuana(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tijuana', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

/** Edad en años, meses y días a la fecha de referencia ('YYYY-MM-DD'). */
export function edadDetallada(nacimiento: string | null | undefined, referencia: string): { anios: number; meses: number; dias: number } | null {
  const n = partes(nacimiento);
  const r = partes(referencia);
  if (!n || !r) return null;
  let anios = r[0] - n[0];
  let meses = r[1] - n[1];
  let dias = r[2] - n[2];
  if (dias < 0) {
    meses -= 1;
    // Días del mes anterior a la referencia.
    dias += new Date(Date.UTC(r[0], r[1] - 1, 0)).getUTCDate();
  }
  if (meses < 0) { anios -= 1; meses += 12; }
  if (anios < 0) return null;
  return { anios, meses, dias };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «83 años, 7 meses y 5 días» (omite meses/días en 0). */
export function edadLegible(nacimiento: string | null | undefined, referencia: string): string | null {
  const e = edadDetallada(nacimiento, referencia);
  if (!e) return null;
  const partesTxt = [plural(e.anios, 'año', 'años')];
  if (e.meses) partesTxt.push(plural(e.meses, 'mes', 'meses'));
  if (e.dias) partesTxt.push(plural(e.dias, 'día', 'días'));
  return partesTxt.length === 1 ? partesTxt[0] : `${partesTxt.slice(0, -1).join(', ')} y ${partesTxt[partesTxt.length - 1]}`;
}

export interface DatosFicha {
  expediente?: string | null;
  sexo?: string | null;
  fechaNacimiento?: string | null;
  /** Edad guardada (respaldo si no hay fecha de nacimiento). */
  edad?: number | null;
}

/** Resumen corto para listas: «Exp. 1136 · Hombre · 83 años». */
export function resumenFicha(d: DatosFicha, referencia: string): string {
  const e = edadDetallada(d.fechaNacimiento, referencia);
  const edad = e ? plural(e.anios, 'año', 'años') : d.edad != null ? plural(d.edad, 'año', 'años') : null;
  return [d.expediente ? `Exp. ${d.expediente}` : null, sexoLegible(d.sexo), edad].filter(Boolean).join(' · ');
}
