'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DISENOS_LIO, fabricanteCanonico, type ModeloLio } from '@/lib/catalogos/modelos-lio';

/**
 * Selección de LIO al estilo de la calculadora ESCRS:
 * bandera «Tórico» → fabricante → buscador de modelo (lista filtrable).
 */
interface Props {
  modelos: ModeloLio[];
  torico: boolean;
  onTorico: (v: boolean) => void;
  fabricante: string;
  onFabricante: (v: string) => void;
  modeloId: string;
  onModelo: (id: string) => void;
  cargando?: boolean;
}

const etiquetaDiseno = (d: string) => DISENOS_LIO.find((x) => x.value === d)?.label || d;
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function SelectorModeloLio({ modelos, torico, onTorico, fabricante, onFabricante, modeloId, onModelo, cargando }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const cajaRef = useRef<HTMLDivElement>(null);

  const delTipo = useMemo(() => modelos.filter((m) => m.activo && m.torico === torico), [modelos, torico]);
  const fabricantes = useMemo(
    () => Array.from(new Set(delTipo.map((m) => fabricanteCanonico(m.fabricante)))).sort((a, b) => a.localeCompare(b, 'es')),
    [delTipo],
  );
  const candidatos = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return delTipo
      .filter((m) => !fabricante || fabricanteCanonico(m.fabricante) === fabricante)
      .filter((m) => !q || normalizar(`${m.fabricante} ${m.modelo}`).includes(q))
      .sort((a, b) => fabricanteCanonico(a.fabricante).localeCompare(fabricanteCanonico(b.fabricante), 'es') || a.modelo.localeCompare(b.modelo, 'es'));
  }, [delTipo, fabricante, busqueda]);
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
              {candidatos.length === 0 ? (
                <li className="px-4 py-2 text-xs text-muted">
                  {delTipo.length === 0 ? 'No hay modelos de este tipo en el catálogo.' : 'Sin coincidencias.'}
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
    </div>
  );
}
