'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DISENOS_LIO, fabricanteCanonico, type DisenoLio, type ModeloLio } from '@/lib/catalogos/modelos-lio';

export interface NuevoModeloLio { fabricante: string; modelo: string; diseno: DisenoLio; torico: boolean }

/**
 * Selección de LIO al estilo de la calculadora ESCRS:
 * bandera «Tórico» → fabricante → buscador de modelo (lista filtrable).
 */
interface Props {
  modelos: ModeloLio[];
  torico: boolean;
  onTorico: (v: boolean) => void;
  /** Check «Marca» (true/false) junto a Tórico. */
  marca?: boolean;
  onMarca?: (v: boolean) => void;
  fabricante: string;
  onFabricante: (v: string) => void;
  modeloId: string;
  onModelo: (id: string) => void;
  cargando?: boolean;
  /** Alta rápida de marca/modelo que no está en el catálogo; devuelve el modelo creado. */
  onAgregar?: (m: NuevoModeloLio) => Promise<ModeloLio>;
  /** Diseño sugerido por la cirugía elegida (monofocal / trifocal): ordena primero esos modelos. */
  disenoSugerido?: DisenoLio | null;
}

const etiquetaDiseno = (d: string) => DISENOS_LIO.find((x) => x.value === d)?.label || d;
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function SelectorModeloLio({ modelos, torico, onTorico, marca, onMarca, fabricante, onFabricante, modeloId, onModelo, cargando, onAgregar, disenoSugerido }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const uid = useId();
  const [alta, setAlta] = useState<null | { fabricante: string; modelo: string; diseno: DisenoLio; guardando: boolean; error: string | null }>(null);
  const abrirAlta = (modeloTxt: string) => {
    setAbierto(false);
    setAlta({ fabricante: fabricante || '', modelo: modeloTxt.trim(), diseno: disenoSugerido || 'MONOFOCAL', guardando: false, error: null });
  };
  const guardarAlta = async () => {
    if (!alta || !onAgregar || alta.guardando) return;
    if (!alta.fabricante.trim() || !alta.modelo.trim()) { setAlta({ ...alta, error: 'Escribe la marca y el modelo' }); return; }
    setAlta({ ...alta, guardando: true, error: null });
    try {
      const m = await onAgregar({ fabricante: alta.fabricante.trim(), modelo: alta.modelo.trim(), diseno: alta.diseno, torico });
      onFabricante(fabricanteCanonico(m.fabricante));
      onModelo(m.id);
      setBusqueda('');
      setAlta(null);
    } catch (e) {
      setAlta((a) => (a ? { ...a, guardando: false, error: e instanceof Error && e.message ? e.message : 'No se pudo agregar el modelo' } : a));
    }
  };
  const cajaRef = useRef<HTMLDivElement>(null);

  const delTipo = useMemo(() => modelos.filter((m) => m.activo && m.torico === torico), [modelos, torico]);
  const fabricantes = useMemo(
    () => Array.from(new Set(delTipo.map((m) => fabricanteCanonico(m.fabricante)))).sort((a, b) => a.localeCompare(b, 'es')),
    [delTipo],
  );
  // Todas las marcas (de cualquier tipo) para sugerir en el alta rápida.
  const todasMarcas = useMemo(
    () => Array.from(new Set(modelos.map((m) => fabricanteCanonico(m.fabricante)))).sort((a, b) => a.localeCompare(b, 'es')),
    [modelos],
  );
  const candidatos = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return delTipo
      .filter((m) => !fabricante || fabricanteCanonico(m.fabricante) === fabricante)
      .filter((m) => !q || normalizar(`${m.fabricante} ${m.modelo}`).includes(q))
      .sort((a, b) =>
        Number(!!disenoSugerido && b.diseno === disenoSugerido) - Number(!!disenoSugerido && a.diseno === disenoSugerido)
        || fabricanteCanonico(a.fabricante).localeCompare(fabricanteCanonico(b.fabricante), 'es') || a.modelo.localeCompare(b.modelo, 'es'));
  }, [delTipo, fabricante, busqueda, disenoSugerido]);
  const seleccionado = modelos.find((m) => m.id === modeloId) || null;

  // Cerrar la lista al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  const inputCls =
    'w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-y-2">
      <label className="inline-flex cursor-pointer items-center gap-2">
        <span className="relative">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={torico}
            onChange={(e) => { onTorico(e.target.checked); onFabricante(''); onModelo(''); setBusqueda(''); }}
          />
          <span className="block h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-primary-600 dark:bg-surface-2" />
          <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </span>
        <span className="text-sm font-bold text-fg">Tórico</span>
        <span className="text-xs text-muted">{torico ? 'Solo lentes tóricos' : 'Solo lentes no tóricos'}</span>
      </label>
      {onMarca && (
        <label className="ml-5 inline-flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4 rounded border-line" checked={!!marca} onChange={(e) => onMarca(e.target.checked)} />
          <span className="text-sm font-bold text-fg">Marca</span>
        </label>
      )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-bold text-muted">Fabricante</label>
          <select
            value={fabricante}
            onChange={(e) => { onFabricante(e.target.value); onModelo(''); setBusqueda(''); }}
            className={cn(inputCls, 'appearance-none')}
            aria-label="Fabricante del LIO"
          >
            <option value="">{cargando ? 'Cargando…' : `Todos (${fabricantes.length})`}</option>
            {fabricantes.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div ref={cajaRef} className="relative">
          <label className="mb-1 block text-xs font-bold text-muted">Modelo de LIO</label>
          {seleccionado ? (
            <div className={cn(inputCls, 'flex items-center justify-between gap-2')}>
              <span className="truncate">
                <span className="font-bold">{seleccionado.modelo}</span>
                <span className="text-muted"> · {fabricanteCanonico(seleccionado.fabricante)} · {etiquetaDiseno(seleccionado.diseno)}</span>
              </span>
              <button type="button" onClick={() => { onModelo(''); setAbierto(true); }} aria-label="Quitar modelo" className="text-muted hover:text-red-500">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setAbierto(true); }}
                onFocus={() => setAbierto(true)}
                onKeyDown={(e) => { if (e.key === 'Escape') setAbierto(false); }}
                placeholder="Buscar modelo…"
                className={cn(inputCls, 'pr-10')}
                role="combobox"
                aria-expanded={abierto}
                aria-controls="lista-modelos-lio"
                aria-label="Buscar modelo de LIO"
              />
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            </div>
          )}
          {abierto && !seleccionado && (
            <ul
              id="lista-modelos-lio"
              role="listbox"
              className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
            >
              {onAgregar && (
                <li>
                  <button
                    type="button"
                    onClick={() => abrirAlta(busqueda)}
                    className="flex w-full items-center gap-2 border-b border-line/70 px-4 py-2 text-left text-sm font-bold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-500/10"
                  >
                    <Plus className="h-4 w-4" />
                    {busqueda.trim() ? `Agregar «${busqueda.trim()}» como modelo nuevo` : 'Agregar marca o modelo nuevo'}
                  </button>
                </li>
              )}
              {candidatos.length === 0 ? (
                <li className="px-4 py-2 text-xs text-muted">
                  {delTipo.length === 0 ? 'No hay modelos de este tipo en el catálogo.' : 'Sin coincidencias.'}
                  {onAgregar && ' Usa «Agregar» para registrarlo.'}
                </li>
              ) : (
                candidatos.map((m) => (
                  <li key={m.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => { onModelo(m.id); if (!fabricante) onFabricante(fabricanteCanonico(m.fabricante)); setAbierto(false); setBusqueda(''); }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-primary-50 dark:hover:bg-primary-500/10"
                    >
                      <span className="font-medium text-fg">{m.modelo}</span>
                      <span className="block text-[11px] text-muted">
                        {fabricante ? '' : `${fabricanteCanonico(m.fabricante)} · `}{etiquetaDiseno(m.diseno)}{m.verificado ? '' : ' · por verificar'}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      {onAgregar && !alta && !seleccionado && (
        <button type="button" onClick={() => abrirAlta(busqueda)} className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline">
          <Plus className="h-3.5 w-3.5" /> ¿No aparece la marca o el modelo? Agregarlo
        </button>
      )}
      {alta && (
        <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-3 dark:border-primary-500/30 dark:bg-primary-500/5">
          <p className="mb-2 text-xs font-bold text-fg">Nuevo modelo de LIO {torico ? '(tórico)' : '(no tórico)'}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-muted" htmlFor={`${uid}-marca`}>Marca</label>
              <input id={`${uid}-marca`} list={`${uid}-marcas`} value={alta.fabricante} onChange={(e) => setAlta({ ...alta, fabricante: e.target.value })} placeholder="Ej. Hoya" className={inputCls} maxLength={120} />
              <datalist id={`${uid}-marcas`}>{todasMarcas.map((f) => <option key={f} value={f} />)}</datalist>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-muted" htmlFor={`${uid}-modelo`}>Modelo</label>
              <input id={`${uid}-modelo`} value={alta.modelo} onChange={(e) => setAlta({ ...alta, modelo: e.target.value })} placeholder="Ej. iSert 251" className={inputCls} maxLength={160} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-muted" htmlFor={`${uid}-diseno`}>Tipo</label>
              <select id={`${uid}-diseno`} value={alta.diseno} onChange={(e) => setAlta({ ...alta, diseno: e.target.value as DisenoLio })} className={cn(inputCls, 'appearance-none')}>
                {DISENOS_LIO.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>
          {alta.error && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{alta.error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setAlta(null)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-fg-2 hover:bg-surface">Cancelar</button>
            <button type="button" onClick={() => void guardarAlta()} disabled={alta.guardando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
              {alta.guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar y usar
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted">Queda en el catálogo para las próximas cirugías (marcado «por verificar» en Configuración → Marcas).</p>
        </div>
      )}
    </div>
  );
}
