'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatFechaCsv } from '@/lib/rangos';

export interface EventoAgenda {
  id: string;
  fecha: string | null;
  hora: string | null;
  nombre_paciente: string | null;
  procedimiento: string | null;
  estado: string | null;
  tipo: 'cirugia' | 'consulta' | 'estudio';
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const DIAS_POR_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const OFFSET_SAKAMOTO = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];

const TIPO: Record<EventoAgenda['tipo'], { label: string; punto: string; badge: string }> = {
  consulta: {
    label: 'Consulta',
    punto: 'bg-amber-500',
    badge: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10',
  },
  estudio: {
    label: 'Estudio',
    punto: 'bg-violet-500',
    badge: 'text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-500/10',
  },
  cirugia: {
    label: 'Cirugía',
    punto: 'bg-rose-500',
    badge: 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-500/10',
  },
};

const TIPOS: EventoAgenda['tipo'][] = ['cirugia', 'consulta', 'estudio'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function anioBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function diasDelMes(anio: number, mes: number): number {
  if (mes === 1) return anioBisiesto(anio) ? 29 : 28;
  return DIAS_POR_MES[mes];
}

function primerDiaLunes(anio: number, mes: number): number {
  const a = mes < 2 ? anio - 1 : anio;
  const w = (a + Math.floor(a / 4) - Math.floor(a / 100) + Math.floor(a / 400) + OFFSET_SAKAMOTO[mes] + 1) % 7;
  return (w + 6) % 7;
}

function claveMes(anio: number, mes: number): number {
  return anio * 12 + mes;
}

function mesDe(fecha: string): { anio: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(fecha);
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]) - 1;
  if (mes < 0 || mes > 11) return null;
  return { anio, mes };
}

function esFecha(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

interface Celda {
  dia: number;
  fecha: string | null;
}

function construirCeldas(anio: number, mes: number): Celda[] {
  const celdas: Celda[] = [];
  const offset = primerDiaLunes(anio, mes);
  for (let i = 0; i < offset; i += 1) celdas.push({ dia: 0, fecha: null });
  const total = diasDelMes(anio, mes);
  for (let d = 1; d <= total; d += 1) {
    celdas.push({ dia: d, fecha: `${anio}-${pad2(mes + 1)}-${pad2(d)}` });
  }
  while (celdas.length % 7 !== 0) celdas.push({ dia: 0, fecha: null });
  return celdas;
}

export default function AgendaCalendario({
  agenda,
  total,
  desde,
  hasta,
}: {
  agenda: EventoAgenda[];
  total: number;
  desde: string;
  hasta: string;
}) {
  const inicio = mesDe(esFecha(desde) ? desde : '');
  const fin = mesDe(esFecha(hasta) ? hasta : '');
  const minMes = claveMes(inicio?.anio ?? 0, inicio?.mes ?? 0);
  const maxMes = claveMes(fin?.anio ?? 0, fin?.mes ?? 0);

  const [vista, setVista] = useState(() => ({
    anio: inicio?.anio ?? 0,
    mes: inicio?.mes ?? 0,
  }));
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const celdas = useMemo(() => construirCeldas(vista.anio, vista.mes), [vista.anio, vista.mes]);

  const porFecha = useMemo(() => {
    const mapa = new Map<string, EventoAgenda[]>();
    for (const e of agenda) {
      if (!e.fecha) continue;
      const k = e.fecha.slice(0, 10);
      const lista = mapa.get(k);
      if (lista) lista.push(e);
      else mapa.set(k, [e]);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    }
    return mapa;
  }, [agenda]);

  const diaInicial = useMemo(() => {
    const fechas = Array.from(porFecha.keys())
      .filter((k) => k >= desde && k <= hasta)
      .sort();
    return fechas[0] ?? null;
  }, [porFecha, desde, hasta]);

  const seleccionado = diaSel ?? diaInicial;
  const eventosDelDia = seleccionado ? porFecha.get(seleccionado) || [] : [];

  const claveActual = claveMes(vista.anio, vista.mes);
  const sinRango = !inicio || !fin;

  const mover = (paso: number) => {
    setVista((prev) => {
      const siguiente = claveMes(prev.anio, prev.mes) + paso;
      if (siguiente < minMes || siguiente > maxMes) return prev;
      return { anio: Math.floor(siguiente / 12), mes: siguiente % 12 };
    });
  };

  if (agenda.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-[#2F3336]">
          <h3 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">Agenda del doctor</h3>
        </div>
        <p className="px-4 py-6 text-sm text-gray-500 dark:text-[#71767B]">
          Sin citas ni cirugías en el rango seleccionado.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-[#2F3336]">
        <h3 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">Agenda del doctor</h3>
        <span className="text-xs text-gray-400">
          {agenda.length} de {total} en el rango
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => mover(-1)}
              disabled={sinRango || claveActual <= minMes}
              aria-label="Mes anterior"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-[#2F3336] text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="min-w-[150px] px-2 text-center text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">
              {MESES[vista.mes]} {vista.anio}
            </span>
            <button
              type="button"
              onClick={() => mover(1)}
              disabled={sinRango || claveActual >= maxMes}
              aria-label="Mes siguiente"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-[#2F3336] text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {TIPOS.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-[#71767B]">
                <span className={`h-2 w-2 rounded-full ${TIPO[t].punto}`} />
                {TIPO[t].label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DIAS.map((d) => (
            <div
              key={d}
              className="pb-1 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400"
            >
              {d}
            </div>
          ))}
          {celdas.map((c, i) => {
            if (!c.fecha) {
              return <div key={`vacio-${i}`} className="min-h-[62px] rounded-lg" />;
            }
            const dentro = c.fecha >= desde && c.fecha <= hasta;
            const eventos = porFecha.get(c.fecha) || [];
            const activo = seleccionado === c.fecha;
            const muestran = eventos.slice(0, 4);
            return (
              <button
                key={c.fecha}
                type="button"
                disabled={!dentro}
                onClick={() => setDiaSel(c.fecha)}
                aria-pressed={activo}
                className={`min-h-[62px] rounded-lg border p-1.5 text-left transition-colors ${
                  activo
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-600/15'
                    : dentro
                      ? 'border-gray-100 dark:border-[#2F3336] hover:bg-gray-50 dark:hover:bg-[#1D1F23]'
                      : 'border-transparent bg-gray-50/60 dark:bg-[#202327]/30 opacity-40'
                }`}
              >
                <span
                  className={`text-xs font-semibold ${
                    activo
                      ? 'text-primary-700 dark:text-white'
                      : 'text-gray-700 dark:text-[#E7E9EA]'
                  }`}
                >
                  {c.dia}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  {muestran.map((e) => (
                    <span
                      key={e.id}
                      className={`h-1.5 w-1.5 rounded-full ${TIPO[e.tipo]?.punto || 'bg-gray-400'}`}
                    />
                  ))}
                  {eventos.length > muestran.length ? (
                    <span className="text-[10px] font-bold text-gray-400">
                      +{eventos.length - muestran.length}
                    </span>
                  ) : null}
                </span>
                {eventos.length > 0 ? (
                  <span className="mt-0.5 hidden truncate text-[10px] font-semibold text-gray-400 sm:block">
                    {eventos.length} {eventos.length === 1 ? 'cita' : 'citas'}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-gray-100 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327]/50 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">
              {seleccionado ? formatFechaCsv(seleccionado) : 'Sin fecha seleccionada'}
            </p>
            <span className="text-xs text-gray-400">
              {eventosDelDia.length} {eventosDelDia.length === 1 ? 'evento' : 'eventos'}
            </span>
          </div>

          {eventosDelDia.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-[#71767B]">
              Sin citas en este día.
            </p>
          ) : (
            <ul className="space-y-2">
              {eventosDelDia.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-gray-100 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-3 py-2"
                >
                  <span className="w-16 shrink-0 text-xs font-bold text-gray-700 dark:text-[#E7E9EA]">
                    {e.hora ? e.hora.slice(0, 5) : '—'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-[#E7E9EA]">
                    {e.nombre_paciente || '—'}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TIPO[e.tipo]?.badge || 'text-gray-600 bg-gray-100'}`}
                  >
                    {TIPO[e.tipo]?.label || e.tipo}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-[#71767B]">
                    {e.procedimiento || '—'}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-[#71767B]">
                    {e.estado || '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
