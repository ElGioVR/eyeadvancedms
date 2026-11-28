'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, CalendarClock, ChevronDown, History, MapPin, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { enviarJSON, mensajeDeError } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import SearchInput from '@/components/ui/SearchInput';
import EmptyState from '@/components/ui/EmptyState';
import { CATEGORIAS_INSUMO, ETIQUETA_CATEGORIA, ETIQUETA_POLITICA, diasParaVencer, type CategoriaInsumo, type Insumo, type UbicacionInsumo } from '@/lib/insumos';
import { COLOR_CATEGORIA, bajoMinimo, estadoCaducidad, fmtFecha, proximoLote, vencidas, vigentes } from './comun';
import Modal from '@/components/ui/Modal';
import FormInsumo from './FormInsumo';
import MovimientoInsumo, { type AccionInsumo } from './MovimientoInsumo';
import KardexInsumo from './KardexInsumo';
import UbicacionesInsumo from './UbicacionesInsumo';

interface Respuesta { disponible: boolean; insumos: Insumo[]; ubicaciones: UbicacionInsumo[] }
type Filtro = 'todos' | 'bajo' | 'por-vencer' | 'vencido';
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function PanelInsumos({ puedeEscribir, esAdmin }: { puedeEscribir: boolean; esAdmin: boolean }) {
  const { toast } = useToast();
  const { data, isLoading, error, mutate } = useSWR<Respuesta>('/api/inventario/insumos');
  const insumos = useMemo(() => data?.insumos ?? [], [data]);
  const ubicaciones = data?.ubicaciones ?? [];
  const nombreUbic = (id: string) => ubicaciones.find((u) => u.id === id)?.nombre ?? '—';

  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<CategoriaInsumo | ''>('');
  const [ubicacion, setUbicacion] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<Insumo | 'nuevo' | null>(null);
  const [mov, setMov] = useState<{ insumo: Insumo; accion: AccionInsumo } | null>(null);
  const [kardex, setKardex] = useState<Insumo | null>(null);
  const [verUbic, setVerUbic] = useState(false);
  const [baja, setBaja] = useState<Insumo | null>(null);
  const [dandoBaja, setDandoBaja] = useState(false);
  const ordenUbic = (id: string) => ubicaciones.findIndex((u) => u.id === id);

  const tieneLote = (i: Insumo, estado: 'por-vencer' | 'vencido') => i.lotes.some((l) => estadoCaducidad(l.fecha_caducidad) === estado);
  const stats = useMemo(() => ({
    total: insumos.length,
    bajo: insumos.filter(bajoMinimo).length,
    porVencer: insumos.filter((i) => tieneLote(i, 'por-vencer')).length,
    vencido: insumos.filter((i) => tieneLote(i, 'vencido')).length,
  }), [insumos]);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return insumos.filter((i) =>
      (!q || normalizar([i.nombre, i.codigo, i.fabricante, i.presentacion].filter(Boolean).join(' ')).includes(q) || i.lotes.some((l) => l.lote && normalizar(l.lote).includes(q))) &&
      (!categoria || i.categoria === categoria) &&
      (!ubicacion || i.lotes.some((l) => l.ubicacion_id === ubicacion)) &&
      (filtro === 'todos' || (filtro === 'bajo' ? bajoMinimo(i) : tieneLote(i, filtro))),
    );
  }, [insumos, busqueda, categoria, ubicacion, filtro]);

  const darDeBaja = async (i: Insumo) => {
    setDandoBaja(true);
    try { await enviarJSON(`/api/inventario/insumos?id=${i.id}`, 'DELETE'); await mutate(); toast('Insumo dado de baja'); setBaja(null); }
    catch (err) { toast(mensajeDeError(err, 'No se pudo dar de baja'), 'error'); }
    finally { setDandoBaja(false); }
  };

  if (data && !data.disponible) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        El inventario de insumos todavía no está instalado. Pide al administrador que corra <code className="font-mono">sql/patch-insumos-inventario-supabase.sql</code> en Supabase.
      </div>
    );
  }

  const tarjetas: Array<{ clave: Filtro; label: string; corta: string; valor: number; color: string; dot: string }> = [
    { clave: 'todos', label: 'Insumos', corta: 'Insumos', valor: stats.total, color: 'text-fg', dot: 'bg-primary-500' },
    { clave: 'bajo', label: 'Bajo mínimo', corta: 'Bajo mín.', valor: stats.bajo, color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
    { clave: 'por-vencer', label: 'Por vencer', corta: 'Por vencer', valor: stats.porVencer, color: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
    { clave: 'vencido', label: 'Vencidos', corta: 'Vencidos', valor: stats.vencido, color: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {tarjetas.map((s) => (
          <button key={s.clave} type="button" onClick={() => setFiltro(filtro === s.clave ? 'todos' : s.clave)} aria-pressed={filtro === s.clave} aria-label={`${s.label}: ${s.valor}. Filtrar`}
            className={cn('min-w-0 rounded-2xl border bg-surface px-2.5 py-2.5 text-left shadow-soft transition-colors dark:shadow-none sm:px-4 sm:py-3', filtro === s.clave && s.clave !== 'todos' ? 'border-primary-400 ring-1 ring-primary-400' : 'border-line')}>
            <span className="flex items-center gap-1.5 truncate text-[11px] font-medium text-muted sm:text-xs">
              <span className={cn('hidden h-1.5 w-1.5 shrink-0 rounded-full sm:inline-block', s.dot)} /><span className="sm:hidden">{s.corta}</span><span className="hidden sm:inline">{s.label}</span>
            </span>
            <p className={cn('mt-0.5 text-xl font-semibold tabular-nums sm:text-2xl', s.color)}>{s.valor}</p>
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-3 shadow-soft dark:shadow-none sm:p-4">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar insumo, código, lote…" />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <select aria-label="Categoría" className="input-field sm:w-52" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaInsumo | '')}>
            <option value="">Categorías</option>
            {CATEGORIAS_INSUMO.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}
          </select>
          <select aria-label="Ubicación" className="input-field sm:w-52" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)}>
            <option value="">Ubicaciones</option>
            {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <div className="col-span-2 flex gap-2 sm:ml-auto">
            {puedeEscribir && <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={() => setVerUbic(true)}><MapPin className="h-4 w-4" /> Ubicaciones</button>}
            {puedeEscribir && <button type="button" className="btn-primary flex-1 sm:flex-none" onClick={() => setForm('nuevo')}><Plus className="h-4 w-4" /> Nuevo insumo</button>}
          </div>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="space-y-3" aria-busy="true">{[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl border border-line bg-surface" />)}</div>
      ) : error && !data ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{mensajeDeError(error, 'No se pudo cargar el inventario de insumos')}</div>
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={Package} title={insumos.length ? 'Sin resultados' : 'Aún no hay insumos'} description={insumos.length ? 'Ajusta la búsqueda o los filtros.' : 'Agrega cassettes, medicamentos, gasas y demás insumos.'} />
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map((i) => {
            const piezas = vigentes(i);
            const nVencidas = vencidas(i);
            const bajo = bajoMinimo(i);
            const prox = proximoLote(i);
            const estProx = prox ? estadoCaducidad(prox.fecha_caducidad) : 'sin-fecha';
            const porUbic = new Map<string, number>();
            for (const l of [...i.lotes].sort((a, b) => ordenUbic(a.ubicacion_id) - ordenUbic(b.ubicacion_id))) porUbic.set(l.ubicacion_id, (porUbic.get(l.ubicacion_id) ?? 0) + l.cantidad);
            const iconos = (
              <>
                <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" onClick={() => setKardex(i)} aria-label="Kardex" title="Kardex"><History className="h-4 w-4" /></button>
                {puedeEscribir && <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" onClick={() => setForm(i)} aria-label="Editar" title="Editar"><Pencil className="h-4 w-4" /></button>}
                {esAdmin && <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-red-600" onClick={() => setBaja(i)} aria-label="Dar de baja" title="Dar de baja"><Trash2 className="h-4 w-4" /></button>}
              </>
            );
            const abierto = !!abiertos[i.id];
            return (
              <div key={i.id} className={cn('overflow-hidden rounded-2xl border bg-surface shadow-soft dark:shadow-none', piezas === 0 ? 'border-red-200 dark:border-red-500/30' : bajo ? 'border-amber-200 dark:border-amber-500/30' : 'border-line')}>
                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase', COLOR_CATEGORIA[i.categoria])}>{ETIQUETA_CATEGORIA[i.categoria]}</span>
                      {bajo && <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"><AlertTriangle className="h-3 w-3" /> Bajo mínimo</span>}
                      {nVencidas > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">
                          <CalendarClock className="h-3 w-3" /> {nVencidas} vencida{nVencidas === 1 ? '' : 's'}
                        </span>
                      )}
                      {prox && estProx === 'por-vencer' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                          <CalendarClock className="h-3 w-3" />
                          {(() => { const d = diasParaVencer(prox.fecha_caducidad) ?? 0; return d === 0 ? 'Vence hoy' : `Vence en ${d} día${d === 1 ? '' : 's'}`; })()}
                        </span>
                      )}
                    </div>
                    <h3 className="truncate text-base font-semibold text-fg">{i.nombre}</h3>
                    <p className="truncate text-xs text-muted">{[i.presentacion, i.fabricante, i.codigo, `Salida: ${ETIQUETA_POLITICA[i.politica_salida ?? 'FEFO'].corta.toLowerCase()}`].filter(Boolean).join(' · ')}</p>
                    {porUbic.size > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {[...porUbic].map(([u, n]) => (
                          <span key={u} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-2"><MapPin className="h-3 w-3" />{nombreUbic(u)} · {n}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="sm:text-right">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Piezas</span>
                      <p className={cn('text-lg font-extrabold tabular-nums', piezas === 0 ? 'text-red-600 dark:text-red-400' : bajo ? 'text-amber-600 dark:text-amber-400' : 'text-fg')}>
                        {piezas}{i.stock_minimo > 0 && <span className="text-xs font-medium text-muted"> / mín {i.stock_minimo}</span>}
                      </p>
                      {nVencidas > 0 && <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">+{nVencidas} vencida{nVencidas === 1 ? '' : 's'} (dar merma)</p>}
                      {prox?.fecha_caducidad && <p className="whitespace-nowrap text-[11px] text-muted">Caduca {fmtFecha(prox.fecha_caducidad)}</p>}
                    </div>
                    <div className="ml-auto flex items-center sm:hidden">{iconos}</div>
                    <button type="button" onClick={() => setAbiertos((a) => ({ ...a, [i.id]: !abierto }))} aria-expanded={abierto} aria-label="Ver lotes"
                      className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"><ChevronDown className={cn('h-5 w-5 transition-transform', abierto && 'rotate-180')} /></button>
                  </div>
                </div>

                {abierto && (
                  <div className="border-t border-line bg-surface-2/40 px-4 py-3 sm:px-6">
                    {i.lotes.length === 0 ? <p className="text-sm text-muted">Sin existencias.</p> : (
                      <ul className="space-y-1.5">
                        {i.lotes.map((l) => {
                          const est = estadoCaducidad(l.fecha_caducidad);
                          return (
                            <li key={l.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm">
                              <div className="min-w-0">
                                <p className="truncate font-medium text-fg">
                                  {l.lote ? `Lote ${l.lote}` : 'Sin lote'} · {nombreUbic(l.ubicacion_id)}
                                  {l.lote_interno && <span className="ml-1.5 rounded bg-surface-2 px-1 py-0.5 align-middle text-[10px] font-semibold text-muted" title="Generado por el sistema porque el producto no traía lote">interno</span>}
                                </p>
                                <p className={cn('text-xs', est === 'vencido' ? 'font-semibold text-red-600 dark:text-red-400' : est === 'por-vencer' ? 'font-semibold text-orange-600 dark:text-orange-400' : 'text-muted')}>
                                  {l.fecha_caducidad ? `${est === 'vencido' ? 'Venció' : 'Vence'} ${fmtFecha(l.fecha_caducidad)}` : 'Sin caducidad'}
                                </p>
                              </div>
                              <span className="shrink-0 font-bold tabular-nums text-fg">{l.cantidad} pz</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {i.notas && <p className="mt-2 text-xs text-muted">{i.notas}</p>}
                  </div>
                )}

                <div className={cn('items-center gap-1.5 border-t border-line px-3 py-2 sm:flex sm:px-5', puedeEscribir ? 'grid grid-cols-3' : 'hidden')}>
                  {puedeEscribir && (
                    <>
                      <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setMov({ insumo: i, accion: 'entrada' })}><ArrowDownToLine className="h-3.5 w-3.5" /> Entrada</button>
                      <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" disabled={i.lotes.length === 0} onClick={() => setMov({ insumo: i, accion: 'salida' })}><ArrowUpFromLine className="h-3.5 w-3.5" /> Salida</button>
                      <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" disabled={i.lotes.length === 0} onClick={() => setMov({ insumo: i, accion: 'traslado' })}><ArrowRightLeft className="h-3.5 w-3.5" /> Mover</button>
                    </>
                  )}
                  <div className="ml-auto hidden items-center sm:flex">{iconos}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && <FormInsumo insumo={form === 'nuevo' ? null : form} ubicaciones={ubicaciones} onClose={() => setForm(null)} onGuardado={() => void mutate()} />}
      {mov && <MovimientoInsumo insumo={mov.insumo} accionInicial={mov.accion} ubicaciones={ubicaciones} onClose={() => setMov(null)} onGuardado={() => void mutate()} />}
      {kardex && <KardexInsumo insumo={kardex} ubicaciones={ubicaciones} onClose={() => setKardex(null)} />}
      {baja && (
        <Modal isOpen onClose={() => setBaja(null)} maxWidth="max-w-sm">
          <h3 className="text-lg font-bold text-fg">Dar de baja insumo</h3>
          <p className="mt-2 text-sm text-fg-2">«{baja.nombre}» dejará de aparecer en el inventario. Su kardex se conserva.</p>
          {baja.lotes.length > 0 && <p className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">Todavía tiene piezas: primero registra la salida o merma.</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setBaja(null)}>Cancelar</button>
            <button type="button" className="btn-danger" disabled={dandoBaja || baja.lotes.length > 0} onClick={() => void darDeBaja(baja)}>Dar de baja</button>
          </div>
        </Modal>
      )}
      {verUbic && <UbicacionesInsumo ubicaciones={ubicaciones} onClose={() => setVerUbic(false)} onCambio={() => void mutate()} />}
    </div>
  );
}
