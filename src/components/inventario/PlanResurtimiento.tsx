'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ClipboardList, Loader2, PackageCheck, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { enviarJSON, mensajeDeError } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import { useInvalidar } from '@/hooks';
import Modal from '@/components/ui/Modal';
import type { PlanResurtimientoFila } from '@/app/api/inventario/plan-resurtimiento/route';

const URL_PLAN = '/api/inventario/plan-resurtimiento';
const ETIQUETA_ORDEN = { PRIMERO: 'Primer lente', SEGUNDO: 'Segundo lente', RESPALDO: 'Respaldo' } as const;

const fmtFecha = (f: string | null) => (f ? f.slice(0, 10).split('-').reverse().join('/') : 'Sin fecha');

function textoUrgencia(dias: number | null): { texto: string; clase: string } {
  if (dias == null) return { texto: 'Sin fecha', clase: 'bg-surface-2 text-muted' };
  if (dias < 0) return { texto: 'Cirugía vencida', clase: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' };
  if (dias === 0) return { texto: 'Hoy', clase: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' };
  if (dias <= 3) return { texto: `En ${dias} día(s)`, clase: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' };
  return { texto: `En ${dias} días`, clase: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' };
}

/** Plan de resurtimiento: lentes solicitados desde cirugías, priorizados por la fecha de cirugía. */
export default function PlanResurtimiento({ puedeEditar }: { puedeEditar: boolean }) {
  const { data, isLoading, mutate } = useSWR<PlanResurtimientoFila[]>(URL_PLAN, { revalidateOnFocus: true });
  const { toast } = useToast();
  const invalidar = useInvalidar();
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [recibiendo, setRecibiendo] = useState<PlanResurtimientoFila | null>(null);
  const [lote, setLote] = useState('');
  const [caducidad, setCaducidad] = useState('');
  const [serie, setSerie] = useState('');

  const filas = Array.isArray(data) ? data : [];
  if (!isLoading && filas.length === 0) return null;
  const porSolicitar = filas.filter((f) => f.estado_logistica === 'POR_SOLICITAR');

  const refrescar = async () => {
    setSeleccion([]);
    await mutate();
    invalidar('/api/inventario', '/api/agenda');
  };

  const marcarSolicitados = async (ids: string[]) => {
    if (!ids.length) return;
    setTrabajando(true);
    try {
      await enviarJSON(URL_PLAN, 'PATCH', { accion: 'SOLICITAR', ids });
      toast(`${ids.length} lente(s) marcado(s) como solicitado(s)`, 'success');
      await refrescar();
    } catch (e) {
      toast(mensajeDeError(e, 'No se pudo marcar como solicitado'), 'error');
    } finally {
      setTrabajando(false);
    }
  };

  const recibir = async () => {
    if (!recibiendo) return;
    setTrabajando(true);
    try {
      await enviarJSON(URL_PLAN, 'PATCH', {
        accion: 'RECIBIR',
        id: recibiendo.id,
        lote: lote.trim() || null,
        expiration_date: caducidad || null,
        serial_number: serie.trim() || null,
      });
      toast('Lente recibido: entró al inventario y quedó listo para la cirugía', 'success');
      setRecibiendo(null);
      setLote(''); setCaducidad(''); setSerie('');
      await refrescar();
    } catch (e) {
      toast(mensajeDeError(e, 'No se pudo recibir el lente'), 'error');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-3 shadow-soft dark:shadow-none sm:p-4" aria-label="Plan de resurtimiento">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
            <ClipboardList className="h-4 w-4 text-primary-500" /> Plan de resurtimiento
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-bold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">{filas.length}</span>
          </h2>
          <p className="text-xs text-muted">Lentes solicitados desde cirugías, ordenados por la cirugía más próxima.</p>
        </div>
        {puedeEditar && porSolicitar.length > 0 && (
          <button
            type="button"
            disabled={trabajando || seleccion.length === 0}
            onClick={() => marcarSolicitados(seleccion)}
            className="btn-secondary disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Marcar {seleccion.length || ''} como solicitado(s)
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Cargando plan…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-[11px] uppercase text-muted">
              <tr>
                {puedeEditar && <th className="w-8 py-2" />}
                <th className="py-2 pr-3">Cirugía</th>
                <th className="py-2 pr-3">Paciente</th>
                <th className="py-2 pr-3">Lente</th>
                <th className="py-2 pr-3">Dioptría / cilindro</th>
                <th className="py-2 pr-3">Estado</th>
                {puedeEditar && <th className="py-2 text-right">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filas.map((f) => {
                const u = textoUrgencia(f.dias_para_cirugia);
                return (
                  <tr key={f.id} className="align-top">
                    {puedeEditar && (
                      <td className="py-2">
                        {f.estado_logistica === 'POR_SOLICITAR' && (
                          <input
                            type="checkbox"
                            aria-label="Seleccionar lente"
                            checked={seleccion.includes(f.id)}
                            onChange={(e) => setSeleccion((p) => (e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id)))}
                          />
                        )}
                      </td>
                    )}
                    <td className="py-2 pr-3">
                      <Link href={`/agenda/${f.cirugia_id}`} className="font-semibold text-primary-600 hover:underline">
                        {fmtFecha(f.fecha)}{f.hora ? ` · ${f.hora.slice(0, 5)}` : ''}
                      </Link>
                      <span className={cn('ml-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold', u.clase)}>{u.texto}</span>
                      {f.ojo && <span className="block text-[11px] text-muted">Ojo {f.ojo}</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-medium text-fg">{f.paciente ?? '—'}</span>
                      {f.expediente && <span className="block text-[11px] text-muted">Exp. {f.expediente}</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-medium text-fg">{f.fabricante ?? '—'} {f.modelo ?? ''}</span>
                      <span className="block text-[11px] text-muted">
                        {ETIQUETA_ORDEN[f.orden]} · {f.torico ? 'Tórico' : 'No tórico'}{f.marca ? ' · Marca' : ''}
                      </span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {f.poder_d != null ? `${f.poder_d}D` : '—'}
                      {f.torico && f.cilindro != null && <span className="text-muted"> · cil. {f.cilindro}</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cn(
                        'inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold',
                        f.estado_logistica === 'SOLICITADO'
                          ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
                      )}>
                        {f.estado_logistica === 'SOLICITADO' ? 'Solicitado' : 'Por solicitar'}
                      </span>
                      {f.solicitado_at && <span className="block text-[11px] text-muted">{fmtFecha(f.solicitado_at)}</span>}
                    </td>
                    {puedeEditar && (
                      <td className="py-2 text-right">
                        {f.estado_logistica === 'POR_SOLICITAR' ? (
                          <button type="button" disabled={trabajando} onClick={() => marcarSolicitados([f.id])} className="text-xs font-bold text-primary-600 hover:underline disabled:opacity-50">
                            Marcar solicitado
                          </button>
                        ) : (
                          <button type="button" disabled={trabajando} onClick={() => setRecibiendo(f)} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-300">
                            <PackageCheck className="h-4 w-4" /> Recibir
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {recibiendo && (
        <Modal isOpen onClose={() => setRecibiendo(null)}>
          <div className="space-y-3 p-5 text-sm">
            <h3 className="text-base font-bold text-fg">Recibir lente</h3>
            <p className="text-fg-2">
              {recibiendo.fabricante} {recibiendo.modelo} · {recibiendo.poder_d != null ? `${recibiendo.poder_d}D` : ''}
              {recibiendo.torico && recibiendo.cilindro != null ? ` · cil. ${recibiendo.cilindro}` : ''}
              <br />
              Para la cirugía de {recibiendo.paciente} ({fmtFecha(recibiendo.fecha)}). Entra al inventario y queda comprometido a esa cirugía.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-xs font-bold text-muted">Lote
                <input value={lote} onChange={(e) => setLote(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg" />
              </label>
              <label className="block text-xs font-bold text-muted">Caducidad
                <input type="date" value={caducidad} onChange={(e) => setCaducidad(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg" />
              </label>
              <label className="block text-xs font-bold text-muted">Serie
                <input value={serie} onChange={(e) => setSerie(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg" />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setRecibiendo(null)} className="btn-secondary" disabled={trabajando}>Cancelar</button>
              <button type="button" onClick={recibir} className="btn-primary" disabled={trabajando}>
                {trabajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Confirmar recepción
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
