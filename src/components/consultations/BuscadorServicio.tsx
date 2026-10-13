import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/** Lista del buscador dividida en "Aseguradora" y "Generales" (catálogo general). */
function GruposServicios({
  items,
  genericosIds,
  onElegir,
  origenNombre,
}: {
  items: { id: string; nombre: string }[];
  genericosIds: Set<string>;
  onElegir: (id: string) => void;
  origenNombre?: string | null;
}) {
  const propios = items.filter((i) => !genericosIds.has(i.id));
  const generales = items.filter((i) => genericosIds.has(i.id));
  const conTitulos = generales.length > 0 || !!origenNombre;
  const grupo = (titulo: string, lista: { id: string; nombre: string }[], chip?: string | null) =>

    lista.length === 0 ? null : (
      <div key={titulo}>
        {conTitulos && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted dark:border-line dark:bg-surface-2">
            <span className="flex min-w-0 items-center gap-2">
              <span>{titulo}</span>
              {chip && (
                <span className="max-w-[240px] truncate rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                  {chip}
                </span>
              )}
            </span>
            <span className="tabular-nums">{lista.length}</span>
          </div>
        )}
        {lista.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => onElegir(i.id)}
            className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-surface-2 transition-colors text-left"
          >
            <span className="text-sm font-medium text-fg truncate">{i.nombre}</span>
          </button>
        ))}
      </div>
    );
  return (
    <>
      {grupo('De la aseguradora', propios, origenNombre)}
      {grupo('Generales', generales)}
    </>
  );
}

/**
 * Buscador de servicios (consulta, estudio, procedimiento) reutilizable.
 * Lista en un portal, dividida en "De la aseguradora" (con chip) y "Generales".
 * Con `seleccionadoId` funciona como selector único (muestra el elegido y permite
 * quitarlo con `opcionVacia`); sin él, solo agrega elementos.
 */
export function BuscadorServicio({
  items,
  genericosIds,
  origenNombre,
  onElegir,
  placeholder,
  seleccionadoId,
  opcionVacia,
  disabled,
  textoDeshabilitado,
  inputClassName,
}: {
  items: { id: string; nombre: string }[];
  genericosIds: Set<string>;
  origenNombre?: string | null;
  onElegir: (id: string) => void;
  placeholder: string;
  seleccionadoId?: string;
  opcionVacia?: string;
  disabled?: boolean;
  textoDeshabilitado?: string;
  inputClassName?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const raiz = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const actualizar = () => {
      if (!raiz.current) return;
      const r = raiz.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (raiz.current?.contains(t) || panel.current?.contains(t)) return;
      setAbierto(false);
      setBusqueda('');
    };
    actualizar();
    window.addEventListener('scroll', actualizar, true);
    window.addEventListener('resize', actualizar);
    document.addEventListener('mousedown', fuera);
    return () => {
      window.removeEventListener('scroll', actualizar, true);
      window.removeEventListener('resize', actualizar);
      document.removeEventListener('mousedown', fuera);
    };
  }, [abierto]);

  const seleccionado = seleccionadoId ? items.find((i) => i.id === seleccionadoId) : undefined;
  const termino = busqueda.trim().toLowerCase();
  const filtrados = termino ? items.filter((i) => i.nombre.toLowerCase().includes(termino)) : items;

  const cerrar = () => { setAbierto(false); setBusqueda(''); };
  const elegir = (id: string) => { onElegir(id); cerrar(); };

  const texto = abierto ? busqueda : (seleccionado?.nombre ?? '');
  const marcaGeneral = !abierto && seleccionado && genericosIds.has(seleccionado.id);

  return (
    <div className="relative" ref={raiz}>
      <input
        type="text"
        value={texto}
        disabled={disabled}
        onChange={(e) => { setBusqueda(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        placeholder={disabled ? (textoDeshabilitado ?? placeholder) : (seleccionado ? undefined : placeholder)}
        className={cn(
          'w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 disabled:opacity-60 dark:border-line dark:bg-surface dark:text-fg dark:placeholder-muted transition-all',
          marcaGeneral && 'pr-20',
          inputClassName
        )}
      />
      {marcaGeneral && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-600 dark:bg-surface-2 dark:text-muted">General</span>
      )}
      {abierto && createPortal(
        <div
          ref={panel}
          className="fixed z-[9999] max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-line dark:bg-surface"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {opcionVacia && (
            <button
              type="button"
              onClick={() => elegir('')}
              className="w-full px-4 py-2.5 text-left text-sm italic text-muted hover:bg-surface-2 transition-colors"
            >
              {opcionVacia}
            </button>
          )}
          {filtrados.length > 0 ? (
            <GruposServicios items={filtrados} genericosIds={genericosIds} origenNombre={origenNombre} onElegir={elegir} />
          ) : (
            <div className="px-4 py-3 text-sm text-muted">No se encontraron resultados</div>
          )}
          <button
            type="button"
            onClick={cerrar}
            className="w-full border-t border-gray-100 px-4 py-2 text-xs font-bold text-gray-400 hover:bg-gray-50 dark:text-muted dark:hover:bg-surface-2"
          >
            Cerrar
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
