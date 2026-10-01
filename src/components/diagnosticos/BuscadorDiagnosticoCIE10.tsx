'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeNombre } from '@/lib/text';
import {
  buscarCie10,
  construirIndiceCie10,
  insertarDiagnostico,
  nombresEnTexto,
  segmentoActual,
  type DiagnosticoCie10,
  type EntradaIndiceCie10,
} from '@/lib/catalogos/cie10';

/**
 * Campo de diagnóstico con buscador CIE-10 oftalmológico (H00-H59).
 *
 * - Se escribe código (H25.1, h251) o término (catarata nuclear, ojo seco, DMAE).
 * - Al elegir, se inserta solo el nombre («Catarata senil nuclear»); otro diagnóstico va en una nueva línea.
 * - El texto libre se respeta: si nada coincide, se guarda tal cual lo escribió el médico.
 * - El catálogo (~20 KB) se descarga solo la primera vez que se enfoca el campo.
 */
interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  id?: string;
  className?: string;
  /** Mostrar la línea de ayuda debajo del campo. */
  ayuda?: boolean;
}

let indiceCache: Promise<EntradaIndiceCie10[]> | null = null;
function cargarIndice(): Promise<EntradaIndiceCie10[]> {
  if (!indiceCache) {
    indiceCache = import('@/lib/catalogos/cie10-oftalmologia-datos')
      .then((m) => construirIndiceCie10(m.DIAGNOSTICOS_CIE10, m.GRUPOS_CIE10))
      .catch((err) => {
        indiceCache = null; // permitir reintento si falló la descarga
        throw err;
      });
  }
  return indiceCache;
}

const MIN_CARACTERES = 2;
const LIMITE = 10;

export default function BuscadorDiagnosticoCIE10({
  value,
  onChange,
  placeholder = 'Busque por código (H25.1) o término (catarata, glaucoma, ojo seco)…',
  maxLength = 500,
  rows = 2,
  id,
  className,
  ayuda = true,
}: Props) {
  const autoId = useId();
  const campoId = id || `dx-${autoId}`;
  const listaId = `${campoId}-lista`;

  const [indice, setIndice] = useState<EntradaIndiceCie10[] | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [activo, setActivo] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const cursorPendiente = useRef<number | null>(null);

  const asegurarIndice = useCallback(() => {
    if (indice) return;
    cargarIndice()
      .then((i) => { setIndice(i); setErrorCarga(false); })
      .catch(() => setErrorCarga(true));
  }, [indice]);

  const consulta = useMemo(() => segmentoActual(value, Math.min(cursor, value.length)).consulta, [value, cursor]);
  const resultados: DiagnosticoCie10[] = useMemo(
    () => (indice && consulta.length >= MIN_CARACTERES ? buscarCie10(indice, consulta, LIMITE) : []),
    [indice, consulta],
  );
  const yaIncluidos = useMemo(() => nombresEnTexto(value), [value]);
  const mostrarLista = abierto && consulta.length >= MIN_CARACTERES;

  useEffect(() => { setActivo(0); }, [consulta]);

  // Restaurar el cursor tras insertar un diagnóstico.
  useEffect(() => {
    const pos = cursorPendiente.current;
    if (pos === null || !areaRef.current) return;
    cursorPendiente.current = null;
    areaRef.current.focus();
    areaRef.current.setSelectionRange(pos, pos);
    setCursor(pos);
  }, [value]);

  // Cerrar la lista al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  const leerCursor = () => setCursor(areaRef.current?.selectionStart ?? value.length);

  const elegir = (d: DiagnosticoCie10) => {
    const r = insertarDiagnostico(value, d, Math.min(cursor, value.length), maxLength);
    cursorPendiente.current = r.cursor;
    onChange(r.texto);
    setAbierto(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mostrarLista || resultados.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((a) => (a + 1) % resultados.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => (a - 1 + resultados.length) % resultados.length);
    } else if (e.key === 'Tab') {
      setAbierto(false);
    } else if (e.key === 'Enter') {
      if (e.shiftKey) return; // Shift+Enter: nueva línea para otro diagnóstico
      e.preventDefault();
      elegir(resultados[activo] ?? resultados[0]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAbierto(false);
    }
  };

  // Mantener visible la opción activa al navegar con flechas.
  useEffect(() => {
    if (!mostrarLista) return;
    document.getElementById(`${listaId}-${activo}`)?.scrollIntoView({ block: 'nearest' });
  }, [activo, mostrarLista, listaId]);

  return (
    <div ref={cajaRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden />
        <textarea
          ref={areaRef}
          id={campoId}
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-activedescendant={mostrarLista && resultados.length ? `${listaId}-${activo}` : undefined}
          onFocus={() => { asegurarIndice(); leerCursor(); setAbierto(true); }}
          onChange={(e) => {
            onChange(e.target.value);
            setCursor(e.target.selectionStart ?? e.target.value.length);
            setAbierto(true);
          }}
          onClick={leerCursor}
          onKeyUp={(e) => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.key)) leerCursor(); }}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full resize-none rounded-lg border border-line bg-surface-2 py-2.5 pl-9 pr-4 text-sm text-fg focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20',
            className,
          )}
        />
      </div>

      {mostrarLista && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg"
        >
          {!indice && !errorCarga && <li className="px-3 py-2 text-xs text-muted">Cargando catálogo CIE-10…</li>}
          {errorCarga && (
            <li className="px-3 py-2 text-xs text-red-600">
              No se pudo cargar el catálogo. Puede escribir el diagnóstico manualmente.
            </li>
          )}
          {indice && resultados.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">
              Sin coincidencias en CIE-10 (H00-H59). Se guardará el texto tal como lo escribió.
            </li>
          )}
          {resultados.map((d, i) => {
            const incluido = yaIncluidos.has(normalizeNombre(d.nombre));
            return (
              <li
                key={d.codigo}
                id={`${listaId}-${i}`}
                role="option"
                aria-selected={i === activo}
                onMouseDown={(e) => e.preventDefault()} // conservar el foco en el campo
                onClick={() => elegir(d)}
                onMouseEnter={() => setActivo(i)}
                className={cn(
                  'flex cursor-pointer items-start gap-3 px-3 py-2 text-sm',
                  i === activo ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-surface-2',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold',
                    d.tipo === 'categoria'
                      ? 'bg-surface-2 text-fg-2'
                      : 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
                  )}
                >
                  {d.codigo}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-fg">{d.nombre}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {d.grupo}
                    {d.dual && ' · Codificar también la enfermedad de base'}
                  </span>
                </span>
                {incluido && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-label="Ya incluido" />}
              </li>
            );
          })}
        </ul>
      )}

      {ayuda && (
        <p className="mt-1 text-[11px] text-muted">
          Catálogo CIE-10 (H00-H59). ↑/↓ para moverse, Enter para elegir. Shift+Enter para agregar otro diagnóstico en una nueva línea.
        </p>
      )}
    </div>
  );
}
