export const TIMEZONE_ADMIN = 'America/Tijuana';
export const CSV_BOM = '﻿';

export interface RangoFechas {
  desde: string;
  hasta: string;
}

function partesTijuana(now = new Date()): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_ADMIN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || '0');
  return { y: get('year'), m: get('month'), d: get('day') };
}

export function hoyTijuana(now = new Date()): string {
  const { y, m, d } = partesTijuana(now);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function rangoMesActual(now = new Date()): RangoFechas {
  const { y, m } = partesTijuana(now);
  const desde = `${y}-${String(m).padStart(2, '0')}-01`;
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const hasta = `${y}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
  return { desde, hasta };
}

export function rangoPersonalizado(
  desde?: string | null,
  hasta?: string | null,
  now = new Date()
): RangoFechas {
  const def = rangoMesActual(now);
  const esFecha = (v: string | null | undefined): v is string =>
    !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  return {
    desde: esFecha(desde) ? desde : def.desde,
    hasta: esFecha(hasta) ? hasta : def.hasta,
  };
}

export function formatFechaCsv(isoDate: string): string {
  if (!isoDate) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
