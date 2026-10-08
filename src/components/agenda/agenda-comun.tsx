'use client';

import { type AgendaCirugiaEstado, type AgendaCirugia } from '@/types';
import { construirUrl } from '@/hooks/useFetch';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Doctor { id: string; alias: string; usuario_id?: string | null; tipo_personal?: string | null; cobra_honorarios?: boolean | null; }

// Rango por defecto de la cuadrícula semana/día. Se amplía automáticamente
// para mostrar cualquier evento que empiece antes o termine después.
export const DEFAULT_HOUR_START = 9;

export const DEFAULT_HOUR_END = 22;

export const HOUR_HEIGHT = 64;

export const tipoConfig: Record<string, { bg: string; text: string }> = {
  cirugia: { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300' },
  consulta: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300' },
  estudio: { bg: 'bg-sky-50 dark:bg-sky-500/10', text: 'text-sky-700 dark:text-sky-300' },
};

export const estadoConfig: Record<AgendaCirugiaEstado, { border: string; dot: string; solid: string; lightBg: string }> = {
  agendada: { border: 'border-l-blue-500', dot: 'bg-blue-500', lightBg: 'bg-blue-500/10', solid: 'bg-blue-500' },
  aplazada: { border: 'border-l-amber-500', dot: 'bg-amber-500', lightBg: 'bg-amber-500/10', solid: 'bg-amber-500' },
  reagendada: { border: 'border-l-violet-500', dot: 'bg-violet-500', lightBg: 'bg-violet-500/10', solid: 'bg-violet-500' },
  completada: { border: 'border-l-emerald-500', dot: 'bg-emerald-500', lightBg: 'bg-emerald-500/10', solid: 'bg-emerald-500' },
  cancelada: { border: 'border-l-red-500', dot: 'bg-red-500', lightBg: 'bg-red-500/10', solid: 'bg-red-500' },
};

export const estadoLabels: Record<AgendaCirugiaEstado, string> = {
  agendada: 'Agendada', aplazada: 'Aplazada', reagendada: 'Reagendada', completada: 'Completada', cancelada: 'Cancelada',
};

export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * URL de «Agendar consulta» desde un evento de la agenda: precarga paciente,
 * médico y especialidad; el tipo queda en Subsecuente (el paciente ya tiene historial).
 */
export function urlAgendarConsulta(ev: Pick<AgendaCirugia, 'paciente_id' | 'doctor_id' | 'especialidad'>): string {
  const q = new URLSearchParams();
  if (ev.paciente_id) q.set('paciente_id', ev.paciente_id);
  if (ev.doctor_id) q.set('doctor_id', ev.doctor_id);
  if (ev.especialidad) q.set('especialidad', ev.especialidad);
  q.set('tipo_agenda', 'SUBSECUENTE');
  return `/consultas/nueva?${q.toString()}`;
}

export function fmtDate(d: string) { return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }

export function fmtDateShort(d: string) { return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }); }

export function fmtTime(t: string | null) { return t ? t.slice(0, 5) : ''; }

export function fmtHourAMPM(h: number) { return h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`; }

export function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }

export function firstDayOfMonth(y: number, m: number) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }

export function dateStr(y: number, m: number, d: number) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }

export function getMonday(d: Date) { const r = new Date(d); const day = r.getDay(); const diff = r.getDate() - day + (day === 0 ? -6 : 1); r.setDate(diff); return r; }

export function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

export function toDateStr(d: Date) { return dateStr(d.getFullYear(), d.getMonth(), d.getDate()); }

export type VistaCalendario = 'month' | 'week' | 'day';

/**
 * Rango de fechas que pide cada vista. Mes: la cuadrícula visible completa
 * (lunes de la primera semana → domingo de la última), para que los días del
 * mes anterior/siguiente que se ven en el calendario también muestren sus
 * eventos. Semana: lun–dom. Día: ese día.
 */
export function rangoVista(vista: VistaCalendario, d: Date): { fechaDesde: string; fechaHasta: string } {
  if (vista === 'month') {
    const y = d.getFullYear();
    const m = d.getMonth();
    const fd = firstDayOfMonth(y, m);
    const celdas = Math.ceil((fd + daysInMonth(y, m)) / 7) * 7;
    const inicio = new Date(y, m, 1 - fd, 12);
    return { fechaDesde: toDateStr(inicio), fechaHasta: toDateStr(addDays(inicio, celdas - 1)) };
  }
  if (vista === 'week') {
    const mon = getMonday(d);
    return { fechaDesde: toDateStr(mon), fechaHasta: toDateStr(addDays(mon, 6)) };
  }
  return { fechaDesde: toDateStr(d), fechaHasta: toDateStr(d) };
}

export function desplazarVista(vista: VistaCalendario, prev: Date, dir: number): Date {
  const d = new Date(prev);
  if (vista === 'month') d.setMonth(d.getMonth() + dir);
  else if (vista === 'week') d.setDate(d.getDate() + dir * 7);
  else d.setDate(d.getDate() + dir);
  return d;
}

/** Misma forma de URL que arma useFetch (orden de parámetros incluido) para que la precarga coincida. */
export function urlAgenda(params: Record<string, string>): string {
  return construirUrl('/api/agenda', params);
}

export interface RespuestaAgenda { data: AgendaCirugia[]; total: number; page: number; pageSize: number }

/** Aplica `cambios` al evento `id` dentro de la respuesta cacheada (paginada o arreglo). */
export function aplicarCambiosEvento(json: unknown, id: string, cambios: Partial<AgendaCirugia>): unknown {
  const map = (arr: AgendaCirugia[]) => arr.map((c) => (c.id === id ? { ...c, ...cambios } : c));
  if (Array.isArray(json)) return map(json as AgendaCirugia[]);
  if (json && typeof json === 'object' && Array.isArray((json as RespuestaAgenda).data)) {
    const r = json as RespuestaAgenda;
    return { ...r, data: map(r.data) };
  }
  return json;
}

export function mensajeError(err: unknown, porDefecto = 'No se pudo guardar el cambio'): string {
  return err instanceof Error && err.message ? err.message : porDefecto;
}

export function getDoctorInitials(name: string) { return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase(); }

export const docColors = ['bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500'];

export function getDocColor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); return docColors[Math.abs(h) % docColors.length]; }

/**
 * Duración de una cirugía en minutos. Prioriza `duracion_min` (número); si no,
 * interpreta el texto libre de `tiempo_estimado` ("34 min", "2 HR", "1:30", "45").
 * Sin dato: 60 min.
 */
export function duracionEventoMin(c: { duracion_min?: number | null; tiempo_estimado?: string | null }): number {
  if (typeof c.duracion_min === 'number' && c.duracion_min > 0) return c.duracion_min;
  const txt = (c.tiempo_estimado || '').trim().toLowerCase();
  if (!txt) return 60;
  const hm = txt.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10) || 60;
  const m = txt.match(/(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hora|horas|min|mins|minutos|m)?/);
  if (!m) return 60;
  const valor = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0) return 60;
  const unidad = m[2] || '';
  const enHoras = unidad.startsWith('h') || (!unidad && valor <= 4);
  return Math.round(enHoras ? valor * 60 : valor) || 60;
}

export function parseTimeToMinutes(t: string | null): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export interface OverlapItem {
  id: string;
  startMin: number;
  endMin: number;
}

export interface OverlapResult {
  column: number;
  totalColumns: number;
  adjustedTop: number;
  adjustedHeight: number;
}

export function computeOverlapColumns(items: OverlapItem[], HOUR_HEIGHT: number, HOUR_START: number): Map<string, OverlapResult> {
  const result = new Map<string, OverlapResult>();
  if (items.length === 0) return result;

  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const groups: OverlapItem[][] = [];
  let currentGroup: OverlapItem[] = [sorted[0]];
  let groupEnd = sorted[0].endMin;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startMin < groupEnd) {
      currentGroup.push(sorted[i]);
      groupEnd = Math.max(groupEnd, sorted[i].endMin);
    } else {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
      groupEnd = sorted[i].endMin;
    }
  }
  groups.push(currentGroup);

  for (const group of groups) {
    const columns: OverlapItem[][] = [];
    for (const item of group) {
      let placed = false;
      for (let col = 0; col < columns.length; col++) {
        const lastInCol = columns[col][columns[col].length - 1];
        if (item.startMin >= lastInCol.endMin) {
          columns[col].push(item);
          result.set(item.id, { column: col, totalColumns: 0, adjustedTop: 0, adjustedHeight: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([item]);
        result.set(item.id, { column: columns.length - 1, totalColumns: 0, adjustedTop: 0, adjustedHeight: 0 });
      }
    }
    const totalCols = columns.length;

    for (const item of group) {
      const r = result.get(item.id);
      if (r) {
        r.totalColumns = totalCols;
        // Cada evento se posiciona con su propia hora de inicio/fin; las
        // columnas solo dividen el ancho cuando hay solapamiento.
        r.adjustedTop = ((item.startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
        r.adjustedHeight = Math.max(28, ((item.endMin - item.startMin) / 60) * HOUR_HEIGHT - 2);
      }
    }
  }

  return result;
}

export const ESTADOS_ORDEN: AgendaCirugiaEstado[] = ['agendada', 'reagendada', 'aplazada', 'completada', 'cancelada'];

export function TipoStat({ label, total, porEstado, icon: Icon, tone }: {
  label: string;
  total: number;
  porEstado: Record<string, number>;
  icon: typeof Calendar;
  tone: 'violet' | 'amber' | 'sky' | 'primary';
}) {
  const tones = {
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
    primary: 'bg-primary-50 text-primary-600 dark:bg-primary-400/10 dark:text-primary-300',
  } as const;
  const suma = ESTADOS_ORDEN.reduce((a, e) => a + (porEstado[e] || 0), 0);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft dark:shadow-none">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight text-fg tabular-nums">{total}</p>
        </div>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {/* Barra segmentada por estado */}
      <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        {suma > 0 && ESTADOS_ORDEN.map((e) => (porEstado[e] || 0) > 0 && (
          <span key={e} className={cn('h-full', estadoConfig[e].solid)} style={{ width: `${((porEstado[e] || 0) / suma) * 100}%` }} title={`${estadoLabels[e]}: ${porEstado[e]}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
        {ESTADOS_ORDEN.filter((e) => (porEstado[e] || 0) > 0).map((e) => (
          <span key={e} className="inline-flex items-center gap-1">
            <span className={cn('h-1.5 w-1.5 rounded-full', estadoConfig[e].dot)} />
            {porEstado[e]} {estadoLabels[e].toLowerCase()}
          </span>
        ))}
        {suma === 0 && <span>Sin eventos</span>}
      </div>
    </div>
  );
}

const PUNTO_TONO: Record<'violet' | 'amber' | 'sky' | 'primary', string> = {
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  primary: 'bg-primary-500',
};

/** Panel único de resumen de la agenda: cifras por tipo, con barra y leyenda por estado. */
export function ResumenAgenda({ items }: {
  items: Array<{
    label: string;
    total: number;
    porEstado: Record<string, number>;
    tone: 'violet' | 'amber' | 'sky' | 'primary';
  }>;
}) {
  return (
    <div className="mb-6 grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-soft dark:shadow-none xl:grid-cols-4">
      {items.map((it, i) => {
        const suma = ESTADOS_ORDEN.reduce((a, e) => a + (it.porEstado[e] || 0), 0);
        return (
          <div
            key={it.label}
            className={cn(
              'min-w-0 p-5',
              // Separadores finos entre celdas (2×2 en tablet, fila en escritorio)
              i % 2 === 0 && 'border-r border-line/70',
              i < 2 && 'border-b border-line/70',
              'xl:border-b-0',
              i < 3 ? 'xl:border-r xl:border-line/70' : 'xl:border-r-0',
            )}
          >
            <div className="flex items-center gap-2 text-xs font-medium text-muted">
              <span className={cn('h-2 w-2 rounded-full', PUNTO_TONO[it.tone])} />
              {it.label}
            </div>
            <p className="mt-1.5 text-3xl font-semibold tracking-tight text-fg tabular-nums">{it.total}</p>
            <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              {suma > 0 && ESTADOS_ORDEN.map((e) => (it.porEstado[e] || 0) > 0 && (
                <span key={e} className={cn('h-full', estadoConfig[e].solid)} style={{ width: `${((it.porEstado[e] || 0) / suma) * 100}%` }} title={`${estadoLabels[e]}: ${it.porEstado[e]}`} />
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
              {suma === 0 && <span>Sin eventos</span>}
              {ESTADOS_ORDEN.filter((e) => (it.porEstado[e] || 0) > 0).map((e) => (
                <span key={e} className="inline-flex items-center gap-1 tabular-nums">
                  <span className={cn('h-1.5 w-1.5 rounded-full', estadoConfig[e].dot)} />
                  {it.porEstado[e]} {estadoLabels[e].toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
