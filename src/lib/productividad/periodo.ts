export type TipoPeriodo = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL' | 'TRIMESTRAL';

export interface RangoPeriodo {
  inicio: string;
  fin: string;
  tipo: TipoPeriodo;
}

const TIPOS: ReadonlySet<string> = new Set(['SEMANAL', 'QUINCENAL', 'MENSUAL', 'TRIMESTRAL']);

export function esTipoPeriodo(v: unknown): v is TipoPeriodo {
  return typeof v === 'string' && TIPOS.has(v);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseYmd(fecha: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDaysYmd(fecha: string, days: number): string {
  const p = parseYmd(fecha);
  if (!p) return fecha;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function dayOfWeekMon0(fecha: string): number {
  const p = parseYmd(fecha);
  if (!p) return 0;
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

export function getPeriodRange(fecha: string, tipo: TipoPeriodo): RangoPeriodo {
  const p = parseYmd(fecha);
  if (!p) {
    return { inicio: fecha, fin: fecha, tipo };
  }

  if (tipo === 'SEMANAL') {
    const inicio = addDaysYmd(fecha, -dayOfWeekMon0(fecha));
    return { inicio, fin: addDaysYmd(inicio, 6), tipo };
  }

  if (tipo === 'QUINCENAL') {
    if (p.d <= 15) {
      return { inicio: ymd(p.y, p.m, 1), fin: ymd(p.y, p.m, 15), tipo };
    }
    const fin = ymd(p.y, p.m, daysInMonth(p.y, p.m));
    return { inicio: ymd(p.y, p.m, 16), fin, tipo };
  }

  if (tipo === 'TRIMESTRAL') {
    const q = Math.floor((p.m - 1) / 3);
    const m1 = q * 3 + 1;
    const m2 = q * 3 + 3;
    const finMes = m2 === 12 ? 31 : daysInMonth(p.y, m2);
    return { inicio: ymd(p.y, m1, 1), fin: ymd(p.y, m2, finMes), tipo };
  }

  return {
    inicio: ymd(p.y, p.m, 1),
    fin: ymd(p.y, p.m, daysInMonth(p.y, p.m)),
    tipo,
  };
}

export function periodoSiguiente(rango: RangoPeriodo): RangoPeriodo {
  const fin = parseYmd(rango.fin);
  if (!fin) return rango;
  return getPeriodRange(addDaysYmd(rango.fin, 1), rango.tipo);
}

export function periodoAnterior(rango: RangoPeriodo): RangoPeriodo {
  const inicio = parseYmd(rango.inicio);
  if (!inicio) return rango;
  return getPeriodRange(addDaysYmd(rango.inicio, -1), rango.tipo);
}

export function montoValidoParaPago(monto: number): boolean {
  return Number.isFinite(monto) && monto > 0;
}

export function parseMontoManual(valor: unknown): number | null {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < 0) return null;
    return Math.round(valor * 100) / 100;
  }
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }
  return null;
}
