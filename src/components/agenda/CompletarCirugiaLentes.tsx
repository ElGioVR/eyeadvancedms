'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { enviarJSON, mensajeDeError } from '@/lib/fetcher';
import type { OrdenLente } from '@/lib/cirugia-lentes-puro';

interface LenteReservado {
  orden: OrdenLente;
  origen: 'INVENTARIO' | 'HOSPITAL';
  fabricante: string | null;
  modelo: string | null;
  poder_d: number | null;
  torico: boolean;
  modo?: 'ASIGNAR' | 'SOLICITAR' | 'COMPRA_DIRECTA';
  marca?: boolean;
  cilindro?: number | null;
  estado_logistica?: 'POR_SOLICITAR' | 'SOLICITADO' | 'POR_COMPRAR' | 'LISTO';
  inventario_item_id?: string | null;
}

export interface DatosCierreCirugia {
  requeridos: OrdenLente[];
  ingresarAInventario: OrdenLente[];
  diagnostico_definitivo: string;
  cirugia_realizada: string;
  complicaciones: string;
}

const ETIQUETA_ORDEN: Record<OrdenLente, string> = {
  PRIMERO: 'Primer lente',
  SEGUNDO: 'Segundo lente',
  RESPALDO: 'Lente de respaldo',
};
const ORDENES_ORDENADOS: OrdenLente[] = ['PRIMERO', 'SEGUNDO', 'RESPALDO'];
const ETIQUETA_MODO = { ASIGNAR: 'Asignado de inventario', SOLICITAR: 'Solicitado', COMPRA_DIRECTA: 'Compra directa' } as const;

function descripcion(l: LenteReservado): string {
  const partes = [
    l.fabricante,
    l.modelo,
    l.poder_d != null ? `${l.poder_d} D` : null,
    l.torico ? `tórico${l.cilindro != null ? ` cil. ${l.cilindro}` : ''}` : null,
    l.marca ? 'Marca' : null,
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'Sin datos del lente';
}

/** Solicitado y aún sin recibir en inventario: no existe una pieza física que usar. */
const sinPieza = (l: LenteReservado) => l.modo === 'SOLICITAR' && !l.inventario_item_id;
const pendienteConfirmar = (l: LenteReservado) => l.modo === 'COMPRA_DIRECTA' && l.estado_logistica === 'POR_COMPRAR';

/**
 * Completar cirugía: 1) lentes asignados → se marca el usado (descuenta inventario) y el resto se
 * libera (queda en el historial); 2) diagnóstico definitivo, cirugía realizada y complicaciones;
 * 3) confirmación final.
 */
export default function CompletarCirugiaLentes({
  cirugiaId,
  onConfirm,
  onCancel,
}: {
  cirugiaId: string;
  onConfirm: (datos: DatosCierreCirugia) => Promise<void>;
  onCancel: () => void;
}) {
  const [lentes, setLentes] = useState<LenteReservado[] | null>(null);
  const [marcados, setMarcados] = useState<Set<OrdenLente>>(new Set());
  const [ingresar, setIngresar] = useState<Set<OrdenLente>>(new Set());
  const [dxDefinitivo, setDxDefinitivo] = useState('');
  const [realizada, setRealizada] = useState('');
  const [dxInicial, setDxInicial] = useState('');
  const [procInicial, setProcInicial] = useState('');
  const [usarDx, setUsarDx] = useState(false);
  const [usarProc, setUsarProc] = useState(false);
  const [complicaciones, setComplicaciones] = useState('');
  const [sinComplicaciones, setSinComplicaciones] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState<OrdenLente | null>(null);

  const cargar = useCallback(async (inicial: boolean, signal?: AbortSignal) => {
    try {
      const r = await fetch(`/api/agenda/${cirugiaId}/lentes`, { signal });
      if (!r.ok) throw new Error('lentes');
      const d = (await r.json()) as { lentes: LenteReservado[]; cirugia?: { diagnostico?: string | null; procedimiento?: string | null } | null };
      setLentes(d.lentes);
      if (inicial) {
        // Por defecto, el primero (si hay pieza física), como el comportamiento anterior.
        setMarcados(new Set(d.lentes.filter((l) => l.orden === 'PRIMERO' && !sinPieza(l)).map((l) => l.orden)));
        setDxInicial(d.cirugia?.diagnostico ?? '');
        setProcInicial(d.cirugia?.procedimiento ?? '');
      }
    } catch {
      if (!signal?.aborted) setError('No se pudieron cargar los lentes asignados.');
    }
  }, [cirugiaId]);

  useEffect(() => {
    const ctrl = new AbortController();
    void cargar(true, ctrl.signal);
    return () => ctrl.abort();
  }, [cargar]);

  const alternar = (orden: OrdenLente) =>
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(orden)) next.delete(orden);
      else next.add(orden);
      return next;
    });

  const confirmarListo = async (orden: OrdenLente) => {
    setConfirmando(orden);
    setError(null);
    try {
      await enviarJSON(`/api/agenda/${cirugiaId}/lentes`, 'PATCH', { accion: 'CONFIRMAR_LISTO', orden });
      await cargar(false);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo confirmar el lente.'));
    } finally {
      setConfirmando(null);
    }
  };

  const faltantes = useMemo(() => {
    const f: string[] = [];
    if (!dxDefinitivo.trim()) f.push('diagnóstico definitivo');
    if (!realizada.trim()) f.push('cirugía realizada');
    if (!sinComplicaciones && !complicaciones.trim()) f.push('complicaciones (o marca «Sin complicaciones»)');
    return f;
  }, [dxDefinitivo, realizada, complicaciones, sinComplicaciones]);
  const usadoSinConfirmar = (lentes ?? []).filter((l) => marcados.has(l.orden) && pendienteConfirmar(l));
  const puedeCompletar = lentes !== null && faltantes.length === 0 && usadoSinConfirmar.length === 0 && confirmado && !enviando;

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await onConfirm({
        requeridos: ORDENES_ORDENADOS.filter((o) => marcados.has(o)),
        ingresarAInventario: ORDENES_ORDENADOS.filter((o) => ingresar.has(o) && !marcados.has(o)),
        diagnostico_definitivo: dxDefinitivo.trim(),
        cirugia_realizada: realizada.trim(),
        complicaciones: sinComplicaciones ? 'Sin complicaciones' : complicaciones.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la cirugía.');
      setEnviando(false);
    }
  };

  const campo = 'mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="completar-lentes-titulo">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <h3 id="completar-lentes-titulo" className="text-base font-bold text-fg">Completar cirugía</h3>

        <section className="mt-4">
          <p className="text-sm font-bold text-fg">1. Lentes asignados</p>
          <p className="mt-0.5 text-xs text-fg-2">
            Marca el lente que se usó: sale del inventario. Los demás se liberan y dejan de estar comprometidos con esta cirugía, pero queda registro en su historial.
          </p>
          {lentes === null && !error && <p className="mt-3 text-sm text-fg-2">Cargando lentes…</p>}
          {lentes !== null && lentes.length === 0 && <p className="mt-3 text-sm text-fg-2">Esta cirugía no tiene lentes asignados.</p>}
          {lentes !== null && lentes.length > 0 && (
            <ul className="mt-3 space-y-2">
              {lentes.map((l) => {
                const bloqueado = sinPieza(l);
                const usado = marcados.has(l.orden);
                return (
                  <li key={l.orden} className="rounded-lg border border-line p-3">
                    <label className={`flex items-start gap-3 ${bloqueado ? 'opacity-60' : 'cursor-pointer'}`}>
                      <input type="checkbox" className="mt-1 h-4 w-4" checked={usado} onChange={() => alternar(l.orden)} disabled={enviando || bloqueado} />
                      <span className="text-sm">
                        <span className="block font-semibold text-fg">
                          {ETIQUETA_ORDEN[l.orden]}
                          {l.modo && <span className="ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-fg-2">{ETIQUETA_MODO[l.modo]}</span>}
                        </span>
                        <span className="block text-fg-2">{descripcion(l)}</span>
                        {bloqueado && <span className="mt-0.5 block text-xs text-amber-600 dark:text-amber-400">Aún no se recibe en inventario: no se puede usar; se liberará del plan.</span>}
                      </span>
                    </label>
                    {pendienteConfirmar(l) && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                        <span>Compra directa sin confirmar como listo.</span>
                        <button type="button" onClick={() => confirmarListo(l.orden)} disabled={confirmando !== null || enviando} className="font-bold underline disabled:opacity-50">
                          {confirmando === l.orden ? 'Confirmando…' : 'Confirmar lente listo'}
                        </button>
                      </div>
                    )}
                    {l.modo === 'COMPRA_DIRECTA' && !usado && l.estado_logistica === 'LISTO' && (
                      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-fg-2">
                        <input
                          type="checkbox"
                          checked={ingresar.has(l.orden)}
                          onChange={(e) => setIngresar((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(l.orden); else next.delete(l.orden);
                            return next;
                          })}
                        />
                        No se usó: agregarlo al inventario
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-5 space-y-3">
          <p className="text-sm font-bold text-fg">2. Cierre de la cirugía</p>
          <div>
            {dxInicial && (
              <div className="mb-1 flex items-start justify-between gap-3 rounded-md bg-surface-2 px-2 py-1.5 text-xs text-fg-2">
                <span><span className="font-bold">Diagnóstico inicial (informativo):</span> {dxInicial}</span>
                <label className="flex shrink-0 cursor-pointer items-center gap-1 font-bold">
                  <input type="checkbox" role="switch" checked={usarDx} disabled={enviando} onChange={(e) => { setUsarDx(e.target.checked); setDxDefinitivo(e.target.checked ? dxInicial : ''); }} />
                  Usar
                </label>
              </div>
            )}
            <label className="block text-xs font-bold text-muted">Diagnóstico definitivo
              <textarea rows={2} value={dxDefinitivo} onChange={(e) => { setDxDefinitivo(e.target.value); if (e.target.value !== dxInicial) setUsarDx(false); }} disabled={enviando} className={campo} />
            </label>
          </div>
          <div>
            {procInicial && (
              <div className="mb-1 flex items-start justify-between gap-3 rounded-md bg-surface-2 px-2 py-1.5 text-xs text-fg-2">
                <span><span className="font-bold">Cirugía programada (informativo):</span> {procInicial}</span>
                <label className="flex shrink-0 cursor-pointer items-center gap-1 font-bold">
                  <input type="checkbox" role="switch" checked={usarProc} disabled={enviando} onChange={(e) => { setUsarProc(e.target.checked); setRealizada(e.target.checked ? procInicial : ''); }} />
                  Usar
                </label>
              </div>
            )}
            <label className="block text-xs font-bold text-muted">Cirugía realizada
              <textarea rows={2} value={realizada} onChange={(e) => { setRealizada(e.target.value); if (e.target.value !== procInicial) setUsarProc(false); }} disabled={enviando} className={campo} />
            </label>
          </div>
          <div>
            <label className="block text-xs font-bold text-muted">Complicaciones
              <textarea rows={2} value={sinComplicaciones ? '' : complicaciones} onChange={(e) => setComplicaciones(e.target.value)} disabled={enviando || sinComplicaciones} placeholder={sinComplicaciones ? 'Sin complicaciones' : ''} className={campo} />
            </label>
            <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-fg-2">
              <input type="checkbox" checked={sinComplicaciones} onChange={(e) => setSinComplicaciones(e.target.checked)} disabled={enviando} />
              Sin complicaciones
            </label>
          </div>
        </section>

        <label className="mt-5 flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3 text-sm text-fg">
          <input type="checkbox" className="mt-0.5" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} disabled={enviando} />
          <span>Confirmo los lentes usados y los datos del cierre. Al completar, la cirugía ya no se podrá modificar.</span>
        </label>

        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        {!error && confirmado && faltantes.length > 0 && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">Falta: {faltantes.join(', ')}.</p>}
        {!error && usadoSinConfirmar.length > 0 && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">Confirma como listo el lente de compra directa que se usó.</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={enviando}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-fg-2 hover:bg-surface-2 disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={!puedeCompletar}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {enviando ? 'Completando…' : 'Completar cirugía'}
          </button>
        </div>
      </div>
    </div>
  );
}
