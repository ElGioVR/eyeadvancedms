'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Ban, Building2, Download, FlaskConical, Loader2, Scissors, Stethoscope, Syringe, ClipboardList } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/money';
import { descargarReporte, FORMATOS_DESCARGA, type FormatoDescarga } from '@/lib/exportar-reporte';

interface Conteo { nombre: string; total: number; completadas: number; canceladas: number; pendientes: number }
interface FilaAseg { nombre: string; consultas: number; estudios: number; cirugias: number; completadas: number; canceladas: number; pendientes: number; ingresos: number }
interface FilaCancelada {
  id: string; tipo: 'consulta' | 'estudio' | 'cirugia'; fecha: string | null; hora: string | null; paciente: string | null;
  doctor: string | null; aseguradora: string; motivo: string | null; cancelado_por: string | null; cancelado_en: string | null;
}
interface Totales { total: number; canceladas: number; completadas: number }
interface Respuesta {
  desde: string; hasta: string;
  totales: { consultas: Totales; estudios: Totales; cirugias: Totales };
  canceladas: {
    total: number; por_tipo: Record<string, number>; por_motivo: Record<string, number>; por_quien: Record<string, number>;
    por_doctor: Record<string, number>; por_aseguradora: Record<string, number>; filas: FilaCancelada[];
  };
  por_aseguradora: FilaAseg[];
  por_tipo_consulta: Conteo[];
  por_estudio: Conteo[];
  por_procedimiento: Conteo[];
  por_procedimiento_quirurgico: Conteo[];
}

type SeccionId = 'canceladas' | 'aseguradoras' | 'consultas' | 'estudios' | 'procedimientos' | 'quirurgicos';

const SECCIONES: { id: SeccionId; label: string; icon: LucideIcon }[] = [
  { id: 'canceladas', label: 'Canceladas', icon: Ban },
  { id: 'aseguradoras', label: 'Por aseguradora', icon: Building2 },
  { id: 'consultas', label: 'Por consulta', icon: Stethoscope },
  { id: 'estudios', label: 'Por estudio', icon: FlaskConical },
  { id: 'procedimientos', label: 'Por procedimiento', icon: Syringe },
  { id: 'quirurgicos', label: 'Por proc. quirúrgico', icon: Scissors },
];

const TIPO_LABEL: Record<string, string> = { consulta: 'Consulta', estudio: 'Estudio', cirugia: 'Cirugía' };

const th = 'px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap';
const thR = 'px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap';
const td = 'px-4 py-3 text-sm text-fg-2';
const tdR = 'px-4 py-3 text-right text-sm font-semibold text-fg tabular-nums';

const pct = (parte: number, total: number) => (total > 0 ? `${((parte / total) * 100).toFixed(1)}%` : '—');

function csvCelda(v: string | number | null | undefined): string {
  const raw = v == null ? '' : String(v);
  const seguro = /^[=+\-@\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}
function aCsv(encabezados: string[], filas: (string | number | null | undefined)[][]): string {
  return '﻿' + [encabezados, ...filas].map((f) => f.map(csvCelda).join(',')).join('\r\n');
}

function Tarjeta({ titulo, icon: Icon, t }: { titulo: string; icon: LucideIcon; t: Totales }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
        <Icon className="h-4 w-4 text-primary-600" /> {titulo}
      </div>
      <p className="mt-2 text-2xl font-extrabold text-fg tabular-nums">{t.total}</p>
      <p className="mt-1 text-xs text-muted">
        {t.completadas} completadas · <span className="font-semibold text-red-600">{t.canceladas} canceladas ({pct(t.canceladas, t.total)})</span>
      </p>
    </div>
  );
}

function Resumen({ titulo, datos }: { titulo: string; datos: Record<string, number> }) {
  const lista = Object.entries(datos).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!lista.length) return null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{titulo}</p>
      <ul className="mt-2 space-y-1">
        {lista.map(([k, n]) => (
          <li key={k} className="flex items-center justify-between gap-3 text-sm">
            <span className={`truncate ${k === 'Sin registrar' ? 'italic text-muted' : 'text-fg-2'}`}>{TIPO_LABEL[k] ?? k}</span>
            <span className="font-bold tabular-nums text-fg">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TablaConteo({ filas, etiqueta }: { filas: Conteo[]; etiqueta: string }) {
  const max = Math.max(1, ...filas.map((f) => f.total));
  if (!filas.length) return <EmptyState icon={ClipboardList} title="Sin datos en el rango" description="No hay registros para estos filtros." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-line bg-surface-2/60">
          <tr>
            <th className={th}>{etiqueta}</th>
            <th className={thR}>Total</th>
            <th className={thR}>Completadas</th>
            <th className={thR}>Canceladas</th>
            <th className={thR}>% cancel.</th>
            <th className={thR}>Pendientes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filas.map((f) => (
            <tr key={f.nombre} className="hover:bg-surface-2/50">
              <td className={td}>
                <div className="font-medium text-fg">{f.nombre}</div>
                <div className="mt-1 h-1.5 w-full max-w-[220px] rounded-full bg-surface-2">
                  <div className="h-1.5 rounded-full bg-primary-500" style={{ width: `${(f.total / max) * 100}%` }} />
                </div>
              </td>
              <td className={tdR}>{f.total}</td>
              <td className={tdR}>{f.completadas}</td>
              <td className={`${tdR} text-red-600`}>{f.canceladas}</td>
              <td className={tdR}>{pct(f.canceladas, f.total)}</td>
              <td className={tdR}>{f.pendientes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportesTrazabilidad({ desde, hasta, doctorId }: { desde: string; hasta: string; doctorId: string }) {
  const { toast } = useToast();
  const [seccion, setSeccion] = useState<SeccionId>('canceladas');
  const [descargando, setDescargando] = useState<FormatoDescarga | null>(null);

  let url: string | null = null;
  if (desde && hasta) {
    const p = new URLSearchParams({ desde, hasta });
    if (doctorId) p.set('doctor_id', doctorId);
    url = `/api/productividad/reportes/trazabilidad?${p}`;
  }
  const { data, error, isLoading, isValidating } = useSWR<Respuesta>(url);

  const tabla = useMemo(() => {
    if (!data) return null;
    const conteo = (nombre: string, filas: Conteo[], etiqueta: string) => ({
      nombre,
      encabezados: [etiqueta, 'Total', 'Completadas', 'Canceladas', '% cancelación', 'Pendientes'],
      filas: filas.map((f) => [f.nombre, f.total, f.completadas, f.canceladas, pct(f.canceladas, f.total), f.pendientes]),
    });
    switch (seccion) {
      case 'canceladas':
        return {
          nombre: 'Canceladas',
          encabezados: ['Tipo', 'Fecha', 'Hora', 'Paciente', 'Doctor', 'Aseguradora', 'Motivo', 'Cancelado por', 'Cancelado el'],
          filas: data.canceladas.filas.map((f) => [TIPO_LABEL[f.tipo], f.fecha, f.hora?.slice(0, 5), f.paciente, f.doctor, f.aseguradora, f.motivo ?? 'Sin registrar', f.cancelado_por ?? 'Sin registrar', f.cancelado_en ? f.cancelado_en.slice(0, 16).replace('T', ' ') : '']),
        };
      case 'aseguradoras':
        return {
          nombre: 'Por aseguradora',
          encabezados: ['Aseguradora', 'Consultas', 'Estudios', 'Cirugías', 'Completadas', 'Canceladas', 'Pendientes', 'Ingresos consultas completadas'],
          filas: data.por_aseguradora.map((f) => [f.nombre, f.consultas, f.estudios, f.cirugias, f.completadas, f.canceladas, f.pendientes, f.ingresos]),
        };
      case 'consultas': return conteo('Por consulta', data.por_tipo_consulta, 'Tipo de consulta');
      case 'estudios': return conteo('Por estudio', data.por_estudio, 'Estudio');
      case 'procedimientos': return conteo('Por procedimiento', data.por_procedimiento, 'Procedimiento');
      case 'quirurgicos': return conteo('Por procedimiento quirúrgico', data.por_procedimiento_quirurgico, 'Procedimiento quirúrgico');
    }
  }, [data, seccion]);

  async function descargar(formato: FormatoDescarga) {
    if (!tabla || !data || descargando) return;
    setDescargando(formato);
    try {
      await descargarReporte(aCsv(tabla.encabezados, tabla.filas), `trazabilidad-${seccion}-${data.desde}_${data.hasta}`, formato, `Trazabilidad · ${tabla.nombre}`, `${data.desde} a ${data.hasta}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el reporte', 'error');
    } finally {
      setDescargando(null);
    }
  }

  if (!desde || !hasta) return <EmptyState icon={ClipboardList} title="Elige un rango de fechas" description="Selecciona el periodo arriba para ver la trazabilidad." />;
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{error instanceof Error ? error.message : 'No se pudo cargar el reporte'}</div>;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tarjeta titulo="Consultas" icon={Stethoscope} t={data.totales.consultas} />
        <Tarjeta titulo="Estudios" icon={FlaskConical} t={data.totales.estudios} />
        <Tarjeta titulo="Cirugías" icon={Scissors} t={data.totales.cirugias} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Reportes de trazabilidad">
          {SECCIONES.map((s) => {
            const Icon = s.icon;
            const activo = seccion === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => setSeccion(s.id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${activo ? 'border-primary-600 bg-primary-600 text-white' : 'border-line bg-surface text-fg-2 hover:bg-surface-2'}`}
              >
                <Icon className="h-4 w-4" /> {s.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          {FORMATOS_DESCARGA.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => void descargar(f.id)}
              disabled={!!descargando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-fg-2 hover:bg-surface-2 disabled:opacity-50"
            >
              {descargando === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {seccion === 'canceladas' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Resumen titulo="Por tipo" datos={data.canceladas.por_tipo} />
          <Resumen titulo="Por motivo" datos={data.canceladas.por_motivo} />
          <Resumen titulo="Quién canceló" datos={data.canceladas.por_quien} />
          <Resumen titulo="Por aseguradora" datos={data.canceladas.por_aseguradora} />
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface" aria-busy={isValidating}>
        <BarraRevalidando activo={isValidating} />
        {seccion === 'canceladas' && (
          data.canceladas.filas.length === 0 ? (
            <EmptyState icon={Ban} title="Sin cancelaciones" description="No hubo citas ni cirugías canceladas en el rango." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line bg-surface-2/60">
                  <tr>
                    <th className={th}>Tipo</th><th className={th}>Fecha</th><th className={th}>Paciente</th><th className={th}>Doctor</th>
                    <th className={th}>Aseguradora</th><th className={th}>Motivo</th><th className={th}>Canceló</th><th className={th}>Cuándo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.canceladas.filas.map((f) => (
                    <tr key={`${f.tipo}-${f.id}`} className="hover:bg-surface-2/50">
                      <td className={td}>{TIPO_LABEL[f.tipo]}</td>
                      <td className={`${td} whitespace-nowrap`}>{f.fecha}{f.hora ? ` · ${f.hora.slice(0, 5)}` : ''}</td>
                      <td className={`${td} font-medium text-fg`}>{f.paciente || '—'}</td>
                      <td className={td}>{f.doctor || '—'}</td>
                      <td className={td}>{f.aseguradora}</td>
                      <td className={td}>{f.motivo || <span className="italic text-muted">Sin registrar</span>}</td>
                      <td className={td}>{f.cancelado_por || <span className="italic text-muted">Sin registrar</span>}</td>
                      <td className={`${td} whitespace-nowrap`}>{f.cancelado_en ? f.cancelado_en.slice(0, 16).replace('T', ' ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {seccion === 'aseguradoras' && (
          data.por_aseguradora.length === 0 ? (
            <EmptyState icon={Building2} title="Sin datos en el rango" description="No hay registros para estos filtros." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line bg-surface-2/60">
                  <tr>
                    <th className={th}>Aseguradora</th><th className={thR}>Consultas</th><th className={thR}>Estudios</th><th className={thR}>Cirugías</th>
                    <th className={thR}>Completadas</th><th className={thR}>Canceladas</th><th className={thR}>Pendientes</th><th className={thR}>Ingresos consultas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.por_aseguradora.map((f) => (
                    <tr key={f.nombre} className="hover:bg-surface-2/50">
                      <td className={`${td} font-medium text-fg`}>{f.nombre}</td>
                      <td className={tdR}>{f.consultas}</td><td className={tdR}>{f.estudios}</td><td className={tdR}>{f.cirugias}</td>
                      <td className={tdR}>{f.completadas}</td><td className={`${tdR} text-red-600`}>{f.canceladas}</td><td className={tdR}>{f.pendientes}</td>
                      <td className={tdR}>{formatCurrency(f.ingresos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {seccion === 'consultas' && <TablaConteo filas={data.por_tipo_consulta} etiqueta="Tipo de consulta" />}
        {seccion === 'estudios' && <TablaConteo filas={data.por_estudio} etiqueta="Estudio" />}
        {seccion === 'procedimientos' && <TablaConteo filas={data.por_procedimiento} etiqueta="Procedimiento" />}
        {seccion === 'quirurgicos' && <TablaConteo filas={data.por_procedimiento_quirurgico} etiqueta="Procedimiento quirúrgico" />}
      </div>

      <p className="text-xs text-muted">
        Los conteos usan la fecha de la cita dentro del rango. «Sin registrar» indica que el motivo o la persona que canceló no se capturó al cancelar.
      </p>
    </div>
  );
}
