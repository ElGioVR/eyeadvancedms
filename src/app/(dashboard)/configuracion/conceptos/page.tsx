'use client';

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { enviarJSON, fetchJSON, mensajeDeError } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';

type Origen = 'ESTUDIO' | 'PROCEDIMIENTO' | 'CONSULTA';
type Ojo = 'OD' | 'OI' | 'OU';
type Pestana = Origen | 'QUIRURGICO';
type FiltroTipo = 'TODOS' | Origen;
type TipoAseguradora = 'PRIVADA' | 'CONVENIO' | 'PARTICULAR';

interface Concepto {
  id: string;
  nombre: string;
  costo: number | string;
}

interface ItemQuirurgico {
  id: string;
  nombre: string;
  ojo: Ojo | null;
  precio?: number | string | null;
}

interface Aseguradora {
  id: string;
  nombre: string;
  activo?: boolean | null;
  telefono?: string | null;
  contacto?: string | null;
  direccion?: string | null;
  porcentaje_cobertura?: number | string | null;
  tipo?: TipoAseguradora | null;
}

interface Servicio {
  id: string;
  aseguranza_id: string;
  tipo: Origen;
  nombre: string;
  costo: number | string;
}

interface DatoArrastrado {
  origen: Origen;
  id: string;
}

const URL_CATALOGO: Record<Origen, string> = {
  ESTUDIO: '/api/configuracion/catalogo-estudios',
  PROCEDIMIENTO: '/api/configuracion/catalogo-procedimientos',
  CONSULTA: '/api/configuracion/catalogo-consultas',
};
const URL_QUIRURGICO = '/api/configuracion/catalogo-quirurgico';
const URL_ASEGURADORAS = '/api/configuracion/aseguranzas';
const URL_SERVICIOS = '/api/configuracion/aseguranzas/servicios';
const URL_SERVICIOS_LISTA = `${URL_SERVICIOS}?compacto=1`;

/** Configuración: los catálogos cambian poco; sin recargas por foco ni reconexión. */
const OPCIONES_SWR = { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 60_000 } as const;
const LIMITE_FILAS = 40;

const TIPOS: Origen[] = ['CONSULTA', 'ESTUDIO', 'PROCEDIMIENTO'];
const PESTANAS: { clave: Pestana; etiqueta: string; titulo: string }[] = [
  { clave: 'CONSULTA', etiqueta: 'Consultas', titulo: 'Consultas genéricas' },
  { clave: 'ESTUDIO', etiqueta: 'Estudios', titulo: 'Estudios genéricos' },
  { clave: 'PROCEDIMIENTO', etiqueta: 'Procedim.', titulo: 'Procedimientos genéricos' },
  { clave: 'QUIRURGICO', etiqueta: 'Quirúrgico', titulo: 'Catálogo quirúrgico' },
];
const NUEVO_TEXTO: Record<Pestana, string> = {
  CONSULTA: 'Nueva consulta',
  ESTUDIO: 'Nuevo estudio',
  PROCEDIMIENTO: 'Nuevo procedimiento',
  QUIRURGICO: 'Nuevo procedimiento quirúrgico',
};
const ETIQUETA_PLURAL: Record<Origen, string> = {
  CONSULTA: 'Consultas',
  ESTUDIO: 'Estudios',
  PROCEDIMIENTO: 'Procedimientos',
};
const ETIQUETA_SERVICIO: Record<Origen, string> = {
  CONSULTA: 'Consulta',
  ESTUDIO: 'Estudio',
  PROCEDIMIENTO: 'Procedimiento',
};
const COLOR_SERVICIO: Record<Origen, string> = {
  CONSULTA: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  ESTUDIO: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PROCEDIMIENTO: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};
const CHIPS_TIPO: { clave: FiltroTipo; etiqueta: string }[] = [
  { clave: 'TODOS', etiqueta: 'Todos' },
  { clave: 'CONSULTA', etiqueta: 'Consultas' },
  { clave: 'ESTUDIO', etiqueta: 'Estudios' },
  { clave: 'PROCEDIMIENTO', etiqueta: 'Procedimientos' },
];
const TIPOS_ASEGURADORA: { valor: TipoAseguradora; etiqueta: string }[] = [
  { valor: 'PRIVADA', etiqueta: 'Privada' },
  { valor: 'CONVENIO', etiqueta: 'Convenio' },
  { valor: 'PARTICULAR', etiqueta: 'Particular' },
];

const SIN_SERVICIOS: Servicio[] = [];

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const claveConcepto = (tipo: Origen, nombre: string) => `${tipo}|${normalizar(nombre)}`;
const claveSeleccion = (origen: Origen, id: string) => `${origen}:${id}`;
const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es');
const esParticular = (a: Aseguradora) => a.tipo === 'PARTICULAR' || a.nombre === 'Particular';

function esDato(d: unknown): d is DatoArrastrado {
  if (!d || typeof d !== 'object') return false;
  const x = d as Partial<DatoArrastrado>;
  return typeof x.id === 'string' && TIPOS.includes(x.origen as Origen);
}

/** Cuerpo de alta según el catálogo (cada uno tiene su propia bandera). */
function cuerpoAlta(origen: Origen, nombre: string, costo: number) {
  if (origen === 'ESTUDIO') return { nombre, costo, bilateral: false };
  if (origen === 'PROCEDIMIENTO') return { nombre, costo, por_ojo: false };
  return { nombre, costo };
}

/** Normaliza respuestas que pueden venir como arreglo o como { data: [] }. */
function lista<T>(respuesta: unknown): T[] {
  if (Array.isArray(respuesta)) return respuesta as T[];
  const data = (respuesta as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as T[]) : [];
}

/** Aplica un cambio local a una lista en caché conservando su forma (arreglo o { data }). */
function mapearLista<T>(actual: unknown, fn: (items: T[]) => T[]): unknown {
  if (Array.isArray(actual)) return fn(actual as T[]);
  const data = (actual as { data?: unknown } | null)?.data;
  if (Array.isArray(data)) return { ...(actual as object), data: fn(data as T[]) };
  return actual;
}

function coincideServicio(s: Servicio, filtroTipo: FiltroTipo, termino: string) {
  return (filtroTipo === 'TODOS' || s.tipo === filtroTipo) && (!termino || normalizar(s.nombre).includes(termino));
}

/** Ejecuta tareas en tandas para no saturar el servidor al copiar muchos conceptos. */
async function ejecutarEnLotes<T>(tareas: (() => Promise<T>)[], tamano = 5) {
  const resultados: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tareas.length; i += tamano) {
    resultados.push(...(await Promise.allSettled(tareas.slice(i, i + tamano).map((t) => t()))));
  }
  return resultados;
}

/**
 * Campo que guarda solo: al salir del campo o con Enter; Escape cancela.
 * Muestra un indicador de guardando / guardado.
 */
function useCampoEditable(
  original: string,
  guardar: (valor: string) => Promise<boolean>,
  opciones: { permitirVacio?: boolean } = {},
) {
  const [texto, setTexto] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  const cancelado = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  async function confirmar() {
    if (cancelado.current) {
      cancelado.current = false;
      setTexto(null);
      return;
    }
    const limpio = texto?.trim();
    if (limpio === undefined || (!limpio && !opciones.permitirVacio) || limpio === original) {
      setTexto(null);
      return;
    }
    setGuardando(true);
    const exito = await guardar(limpio);
    setGuardando(false);
    setTexto(null);
    if (exito) {
      setOk(true);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setOk(false), 1500);
    }
  }

  const props = {
    value: texto ?? original,
    onChange: (e: ChangeEvent<HTMLInputElement>) => setTexto(e.target.value),
    onBlur: () => void confirmar(),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur();
      if (e.key === 'Escape') {
        cancelado.current = true;
        e.currentTarget.blur();
      }
    },
  };
  return { props, guardando, ok };
}

function Indicador({ guardando, ok }: { guardando: boolean; ok: boolean }) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-live="polite">
      {guardando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" aria-label="Guardando" />
      ) : ok ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" aria-label="Guardado" />
      ) : null}
    </span>
  );
}

const CAMPO_BASE =
  'rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-fg hover:border-line focus:border-primary-500 focus:bg-white focus:outline-none dark:focus:bg-gray-900';

function TextoEditable({
  valor,
  etiqueta,
  onGuardar,
}: {
  valor: string;
  etiqueta: string;
  onGuardar: (texto: string) => Promise<boolean>;
}) {
  const { props, guardando, ok } = useCampoEditable(valor, onGuardar);
  return (
    <>
      <input type="text" maxLength={255} aria-label={etiqueta} title={props.value} {...props} className={cn(CAMPO_BASE, 'min-w-0 flex-1')} />
      <Indicador guardando={guardando} ok={ok} />
    </>
  );
}

function CostoEditable({
  valor,
  etiqueta,
  onGuardar,
}: {
  valor: number | string;
  etiqueta: string;
  onGuardar: (texto: string) => Promise<boolean>;
}) {
  const { props, guardando, ok } = useCampoEditable(String(Number(valor) || 0), onGuardar);
  return (
    <span className="flex shrink-0 items-center gap-1 text-sm text-gray-500">
      $
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        aria-label={etiqueta}
        onFocus={(e) => e.currentTarget.select()}
        {...props}
        className={cn(CAMPO_BASE, 'w-24 text-right')}
      />
      <Indicador guardando={guardando} ok={ok} />
    </span>
  );
}

/** Campo con etiqueta para los datos de una aseguradora (guarda al salir del campo). */
function CampoAseguradora({
  etiqueta,
  valor,
  tipo = 'text',
  onGuardar,
  permitirVacio = true,
  className,
}: {
  etiqueta: string;
  valor: string;
  tipo?: 'text' | 'number';
  onGuardar: (texto: string) => Promise<boolean>;
  permitirVacio?: boolean;
  className?: string;
}) {
  const { props, guardando, ok } = useCampoEditable(valor, onGuardar, { permitirVacio });
  return (
    <label className={cn('block text-xs font-semibold text-gray-500', className)}>
      {etiqueta}
      <span className="mt-1 flex items-center gap-1">
        <input
          type={tipo}
          maxLength={tipo === 'text' ? 255 : undefined}
          {...(tipo === 'number' ? { min: 0, max: 100, step: '0.1' } : {})}
          {...props}
          className="w-full rounded-md border border-line bg-transparent px-2 py-1.5 text-sm font-normal text-fg focus:border-primary-500 focus:outline-none"
        />
        <Indicador guardando={guardando} ok={ok} />
      </span>
    </label>
  );
}

/** Quitar en dos pasos (clic + confirmar) para evitar borrados accidentales sin usar un modal. */
function BotonQuitar({
  etiqueta,
  textoConfirmar = '¿Quitar?',
  onConfirmar,
}: {
  etiqueta: string;
  textoConfirmar?: string;
  onConfirmar: () => void;
}) {
  const [armado, setArmado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  if (armado) {
    return (
      <button
        type="button"
        onClick={() => {
          setArmado(false);
          onConfirmar();
        }}
        onBlur={() => setArmado(false)}
        className="shrink-0 rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
      >
        {textoConfirmar}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={(e) => {
        setArmado(true);
        e.currentTarget.blur();
        temporizador.current = setTimeout(() => setArmado(false), 3000);
      }}
      className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

/**
 * Eliminar aseguradora: acción delicada. Abre un modal que pide escribir el nombre exacto;
 * el servidor además exige rol admin y bloquea si hay pacientes o cirugías ligados.
 */
function BotonEliminarAseguradora({ nombre, onConfirmar }: { nombre: string; onConfirmar: (texto: string) => Promise<string | null> }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const coincide = texto.trim().toLowerCase() === nombre.trim().toLowerCase();

  function cerrar() {
    setAbierto(false);
    setTexto('');
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Eliminar aseguradora ${nombre}`}
        title="Eliminar aseguradora"
        onClick={() => setAbierto(true)}
        className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
      {abierto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={cerrar} role="dialog" aria-modal="true" aria-label={`Eliminar ${nombre}`}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-extrabold text-fg">Eliminar aseguradora</h3>
            <p className="mt-2 text-sm text-fg-2">
              Vas a eliminar <strong>{nombre}</strong> junto con su lista de precios y coberturas. Esta acción es delicada y solo la puede hacer un administrador. No se permite si tiene pacientes o cirugías asociados.
            </p>
            <label className="mt-4 block text-xs font-bold text-muted">
              Escribe <span className="font-extrabold text-fg">{nombre}</span> para confirmar
            </label>
            <input
              autoFocus
              value={texto}
              onChange={(e) => { setTexto(e.target.value); setError(null); }}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              placeholder={nombre}
            />
            {error && <p className="mt-2 text-xs font-semibold text-red-600" role="alert">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={cerrar} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2">Cancelar</button>
              <button
                type="button"
                disabled={!coincide || enviando}
                onClick={async () => {
                  setEnviando(true);
                  const msg = await onConfirmar(texto.trim());
                  setEnviando(false);
                  if (msg) setError(msg);
                  else cerrar();
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {enviando ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CampoBusqueda({
  valor,
  onCambio,
  placeholder,
}: {
  valor: string;
  onCambio: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-[180px] flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        type="text"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md border border-line bg-transparent py-2 pl-8 pr-8 text-sm text-fg focus:border-primary-500 focus:outline-none"
      />
      {valor && (
        <button
          type="button"
          onClick={() => onCambio('')}
          aria-label="Limpiar búsqueda"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function EstadoVacio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-gray-400">{children}</p>;
}

const ETIQUETA_DUPLICADO =
  'shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';

// ---------------------------------------------------------------------------
// Filas (memoizadas: una edición solo vuelve a pintar su propio renglón)
// ---------------------------------------------------------------------------

interface PropsFilaGenerica {
  origen: Origen;
  c: Concepto;
  marcado: boolean;
  presencia: number;
  total: number;
  duplicado: boolean;
  onMarcar: (origen: Origen, id: string) => void;
  onIniciarArrastre: (e: DragEvent<HTMLElement>, origen: Origen, c: Concepto) => void;
  onTerminarArrastre: () => void;
  onGuardarNombre: (origen: Origen, c: Concepto, texto: string) => Promise<boolean>;
  onGuardarCosto: (origen: Origen, c: Concepto, texto: string) => Promise<boolean>;
  onEliminar: (origen: Origen, c: Concepto) => void;
}

const FilaGenerica = memo(function FilaGenerica(p: PropsFilaGenerica) {
  const { origen, c, marcado, presencia, total } = p;
  return (
    <li
      className={cn(
        'group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors',
        marcado ? 'border-primary-300 bg-primary-50/60 dark:bg-primary-900/10' : 'border-line bg-white dark:bg-gray-900',
      )}
    >
      <input
        type="checkbox"
        checked={marcado}
        onChange={() => p.onMarcar(origen, c.id)}
        aria-label={`Seleccionar ${c.nombre}`}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-primary-600"
      />
      <span
        draggable
        onDragStart={(e) => p.onIniciarArrastre(e, origen, c)}
        onDragEnd={p.onTerminarArrastre}
        title="Arrastra a una aseguradora"
        aria-label={`Arrastrar ${c.nombre}`}
        className="cursor-grab rounded p-0.5 text-gray-300 hover:text-gray-500 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </span>
      <TextoEditable valor={c.nombre} etiqueta="Nombre del concepto" onGuardar={(t) => p.onGuardarNombre(origen, c, t)} />
      {p.duplicado && <span className={ETIQUETA_DUPLICADO}>Duplicado</span>}
      <span
        title={`Está en ${presencia} de ${total} aseguradoras`}
        className={cn(
          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
          total > 0 && presencia === total
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : presencia === 0
              ? 'bg-gray-100 text-gray-400 dark:bg-gray-800'
              : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
        )}
      >
        {presencia}/{total}
      </span>
      <CostoEditable valor={c.costo} etiqueta={`Costo de ${c.nombre}`} onGuardar={(t) => p.onGuardarCosto(origen, c, t)} />
      <BotonQuitar
        etiqueta={`Eliminar ${c.nombre} del catálogo genérico`}
        textoConfirmar="¿Eliminar?"
        onConfirmar={() => p.onEliminar(origen, c)}
      />
    </li>
  );
});

const FilaQuirurgica = memo(function FilaQuirurgica({
  item,
  onGuardar,
  onEliminar,
}: {
  item: ItemQuirurgico;
  onGuardar: (item: ItemQuirurgico, cambios: Record<string, unknown>) => Promise<boolean>;
  onEliminar: (item: ItemQuirurgico) => void;
}) {
  return (
    <li className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1.5 dark:bg-gray-900">
      <TextoEditable valor={item.nombre} etiqueta="Nombre del procedimiento quirúrgico" onGuardar={(t) => onGuardar(item, { nombre: t })} />
      <select
        aria-label={`Ojo de ${item.nombre}`}
        value={item.ojo ?? ''}
        onChange={(e) => void onGuardar(item, { ojo: e.target.value === '' ? null : e.target.value })}
        className="shrink-0 rounded-md border border-line bg-transparent px-2 py-1 text-xs text-gray-600"
      >
        <option value="">Sin ojo</option>
        <option value="OD">OD</option>
        <option value="OI">OI</option>
        <option value="OU">OU</option>
      </select>
      <CostoEditable
        valor={item.precio ?? 0}
        etiqueta={`Precio de ${item.nombre}`}
        onGuardar={(t) => {
          const precio = Number(t);
          if (!Number.isFinite(precio) || precio < 0) return Promise.resolve(false);
          if (precio === Number(item.precio ?? 0)) return Promise.resolve(true);
          return onGuardar(item, { precio });
        }}
      />
      <BotonQuitar etiqueta={`Eliminar ${item.nombre}`} textoConfirmar="¿Eliminar?" onConfirmar={() => onEliminar(item)} />
    </li>
  );
});

interface PropsFilaServicio {
  s: Servicio;
  nombreAseguradora: string;
  duplicado: boolean;
  onGuardarServicio: (s: Servicio, cambios: Record<string, unknown>) => Promise<boolean>;
  onGuardarCosto: (s: Servicio, texto: string) => Promise<boolean>;
  onQuitar: (s: Servicio) => void;
}

const FilaServicio = memo(function FilaServicio({ s, nombreAseguradora, duplicado, onGuardarServicio, onGuardarCosto, onQuitar }: PropsFilaServicio) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-gray-800/60">
      <select
        aria-label={`Tipo de ${s.nombre} en ${nombreAseguradora}`}
        value={s.tipo}
        onChange={(e) => void onGuardarServicio(s, { tipo: e.target.value })}
        className={cn('shrink-0 rounded-full border-0 px-2 py-0.5 text-[11px] font-semibold', COLOR_SERVICIO[s.tipo])}
      >
        {TIPOS.map((t) => (
          <option key={t} value={t}>
            {ETIQUETA_SERVICIO[t]}
          </option>
        ))}
      </select>
      <TextoEditable valor={s.nombre} etiqueta={`Nombre en ${nombreAseguradora}`} onGuardar={(t) => onGuardarServicio(s, { nombre: t })} />
      {duplicado && <span className={ETIQUETA_DUPLICADO}>Duplicado</span>}
      <CostoEditable valor={s.costo} etiqueta={`Costo de ${s.nombre} en ${nombreAseguradora}`} onGuardar={(t) => onGuardarCosto(s, t)} />
      <BotonQuitar etiqueta={`Quitar ${s.nombre} de ${nombreAseguradora}`} onConfirmar={() => onQuitar(s)} />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Aseguradoras: datos y alta
// ---------------------------------------------------------------------------

function DatosAseguradora({
  a,
  onGuardar,
  onCerrar,
}: {
  a: Aseguradora;
  onGuardar: (a: Aseguradora, cambios: Record<string, unknown>) => Promise<boolean>;
  onCerrar: () => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-line bg-gray-50/60 p-3 dark:bg-gray-800/40">
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoAseguradora etiqueta="Nombre" valor={a.nombre} permitirVacio={false} onGuardar={(t) => onGuardar(a, { nombre: t })} />
        <label className="block text-xs font-semibold text-gray-500">
          Tipo
          <select
            value={a.tipo ?? 'PRIVADA'}
            onChange={(e) => void onGuardar(a, { tipo: e.target.value })}
            className="mt-1 w-full rounded-md border border-line bg-transparent px-2 py-1.5 text-sm font-normal text-fg"
          >
            {TIPOS_ASEGURADORA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <CampoAseguradora etiqueta="Teléfono" valor={a.telefono ?? ''} onGuardar={(t) => onGuardar(a, { telefono: t })} />
        <CampoAseguradora etiqueta="Contacto" valor={a.contacto ?? ''} onGuardar={(t) => onGuardar(a, { contacto: t })} />
        <CampoAseguradora className="sm:col-span-2" etiqueta="Dirección" valor={a.direccion ?? ''} onGuardar={(t) => onGuardar(a, { direccion: t })} />
        <CampoAseguradora
          etiqueta="Cobertura (%)"
          tipo="number"
          valor={a.porcentaje_cobertura == null ? '' : String(Number(a.porcentaje_cobertura))}
          onGuardar={(t) => onGuardar(a, { porcentaje_cobertura: t.trim() === '' ? null : Number(t) })}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <Link href={`/configuracion/aseguranzas/${a.id}/servicios`} className="text-xs font-semibold text-primary-700 hover:underline">
          Importar catálogo desde Excel →
        </Link>
        <button type="button" onClick={onCerrar} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
          Cerrar
        </button>
      </div>
    </div>
  );
}

function FormNuevaAseguradora({
  onCrear,
  onCancelar,
}: {
  onCrear: (datos: Record<string, unknown>) => Promise<boolean>;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoAseguradora>('PRIVADA');
  const [telefono, setTelefono] = useState('');
  const [contacto, setContacto] = useState('');
  const [direccion, setDireccion] = useState('');
  const [cobertura, setCobertura] = useState('');
  const [guardando, setGuardando] = useState(false);
  const refNombre = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refNombre.current?.focus();
  }, []);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardando(true);
    const ok = await onCrear({
      nombre: nombre.trim(),
      tipo,
      ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
      ...(contacto.trim() ? { contacto: contacto.trim() } : {}),
      ...(direccion.trim() ? { direccion: direccion.trim() } : {}),
      ...(cobertura.trim() ? { porcentaje_cobertura: Number(cobertura) } : {}),
    });
    setGuardando(false);
    if (ok) onCancelar();
  }

  const campo = 'mt-1 w-full rounded-md border border-line bg-transparent px-2 py-1.5 text-sm font-normal text-fg focus:border-primary-500 focus:outline-none';
  return (
    <form
      onSubmit={enviar}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancelar();
      }}
      className="space-y-3 rounded-xl border border-primary-300 bg-white p-4 dark:bg-gray-900"
    >
      <h3 className="text-sm font-bold text-fg">Nueva aseguradora</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-gray-500">
          Nombre
          <input ref={refNombre} type="text" maxLength={255} value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
        </label>
        <label className="block text-xs font-semibold text-gray-500">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAseguradora)} className={campo}>
            {TIPOS_ASEGURADORA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-gray-500">
          Teléfono
          <input type="text" maxLength={20} value={telefono} onChange={(e) => setTelefono(e.target.value)} className={campo} />
        </label>
        <label className="block text-xs font-semibold text-gray-500">
          Contacto
          <input type="text" maxLength={255} value={contacto} onChange={(e) => setContacto(e.target.value)} className={campo} />
        </label>
        <label className="block text-xs font-semibold text-gray-500 sm:col-span-2">
          Dirección
          <input type="text" maxLength={255} value={direccion} onChange={(e) => setDireccion(e.target.value)} className={campo} />
        </label>
        <label className="block text-xs font-semibold text-gray-500">
          Cobertura (%)
          <input type="number" min={0} max={100} step="0.1" value={cobertura} onChange={(e) => setCobertura(e.target.value)} className={campo} />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-md px-3 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Crear aseguradora
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Carpeta de aseguradora (memoizada)
// ---------------------------------------------------------------------------

interface PropsCarpeta {
  a: Aseguradora;
  todos: Servicio[];
  abiertaManual: boolean;
  esDestino: boolean;
  copiando: boolean;
  hayArrastre: boolean;
  cantidadArrastre: number;
  filtroTipo: FiltroTipo;
  termino: string;
  hayFiltro: boolean;
  onAlternar: (id: string) => void;
  onEntrar: (id: string, abierta: boolean) => void;
  onSalir: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onSoltar: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onGuardarServicio: (s: Servicio, cambios: Record<string, unknown>) => Promise<boolean>;
  onGuardarCosto: (s: Servicio, texto: string) => Promise<boolean>;
  onQuitar: (s: Servicio) => void;
  onGuardarAseguradora: (a: Aseguradora, cambios: Record<string, unknown>) => Promise<boolean>;
  onEliminarAseguradora: (a: Aseguradora, confirmacion: string) => Promise<string | null>;
}

/** Re-pinta solo si cambió algo de la carpeta (compara el contenido de `todos`, no su identidad). */
function mismaCarpeta(prev: PropsCarpeta, next: PropsCarpeta) {
  const { todos: t1, ...r1 } = prev;
  const { todos: t2, ...r2 } = next;
  if (t1 !== t2 && (t1.length !== t2.length || t1.some((x, i) => x !== t2[i]))) return false;
  return (Object.keys(r1) as (keyof typeof r1)[]).every((k) => r1[k] === r2[k]);
}

const Carpeta = memo(function Carpeta(p: PropsCarpeta) {
  const { a, todos, esDestino } = p;
  const [mostrarDatos, setMostrarDatos] = useState(false);
  const [verTodos, setVerTodos] = useState<Partial<Record<Origen, boolean>>>({});

  const visibles = useMemo(() => {
    if (!p.hayFiltro && !p.abiertaManual) return SIN_SERVICIOS;
    const base = p.hayFiltro ? todos.filter((s) => coincideServicio(s, p.filtroTipo, p.termino)) : todos.slice();
    return base.sort(porNombre);
  }, [todos, p.hayFiltro, p.abiertaManual, p.filtroTipo, p.termino]);

  const { resumen, repetidos, totalDuplicados } = useMemo(() => {
    const porTipo: Record<Origen, number> = { CONSULTA: 0, ESTUDIO: 0, PROCEDIMIENTO: 0 };
    const conteo = new Map<string, number>();
    for (const s of todos) {
      porTipo[s.tipo] += 1;
      const k = claveConcepto(s.tipo, s.nombre);
      conteo.set(k, (conteo.get(k) ?? 0) + 1);
    }
    return {
      resumen: TIPOS.filter((t) => porTipo[t] > 0)
        .map((t) => `${porTipo[t]} ${ETIQUETA_PLURAL[t].toLowerCase()}`)
        .join(' · '),
      repetidos: conteo,
      totalDuplicados: Array.from(conteo.values()).filter((n) => n > 1).length,
    };
  }, [todos]);

  const abierta = p.abiertaManual || (p.hayFiltro && visibles.length > 0);

  return (
    <div
      onDragEnter={() => p.hayArrastre && p.onEntrar(a.id, abierta)}
      onDragOver={(e) => {
        if (!p.hayArrastre) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => p.onSalir(e, a.id)}
      onDrop={(e) => p.onSoltar(e, a.id)}
      className={cn(
        'rounded-xl border bg-white transition-all dark:bg-gray-900',
        esDestino ? 'border-primary-500 shadow-md ring-2 ring-primary-200' : p.hayArrastre ? 'border-dashed border-primary-300' : 'border-line',
      )}
    >
      <div className="flex items-center pr-2">
      <button
        type="button"
        onClick={() => p.onAlternar(a.id)}
        aria-expanded={abierta}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
      >
        {abierta ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        )}
        {abierta ? (
          <FolderOpen className="h-5 w-5 shrink-0 text-primary-600" aria-hidden />
        ) : (
          <Folder className="h-5 w-5 shrink-0 text-primary-600" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-fg">{a.nombre}</span>
          {(resumen || totalDuplicados > 0) && (
            <span className="hidden truncate text-xs text-gray-400 sm:block">
              {resumen}
              {totalDuplicados > 0 && (
                <span className="ml-2 font-semibold text-amber-600">
                  · {totalDuplicados} {plural(totalDuplicados, 'duplicado', 'duplicados')}
                </span>
              )}
            </span>
          )}
        </span>
        {p.copiando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary-600" aria-label="Copiando" />}
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:bg-gray-800">{todos.length}</span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => {
            if (!abierta) p.onAlternar(a.id);
            setMostrarDatos((v) => (abierta ? !v : true));
          }}
          aria-pressed={mostrarDatos}
          aria-label={`Editar aseguradora ${a.nombre}`}
          title="Editar aseguradora"
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors',
            mostrarDatos
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20'
              : 'text-gray-500 hover:bg-gray-100 hover:text-primary-700 dark:hover:bg-gray-800',
          )}
        >
          <Pencil className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Editar</span>
        </button>
        {!esParticular(a) && (
          <BotonEliminarAseguradora nombre={a.nombre} onConfirmar={(t) => p.onEliminarAseguradora(a, t)} />
        )}
      </div>
      </div>

      {esDestino && (
        <div className="border-t border-primary-200 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 dark:bg-primary-900/10">
          Suelta para copiar {p.cantidadArrastre} {plural(p.cantidadArrastre, 'concepto', 'conceptos')} a {a.nombre}
        </div>
      )}

      {abierta && (
        <div className="space-y-4 border-t border-line px-4 py-3">
          {mostrarDatos && (
            <DatosAseguradora a={a} onGuardar={p.onGuardarAseguradora} onCerrar={() => setMostrarDatos(false)} />
          )}

          {visibles.length === 0 ? (
            <EstadoVacio>
              {p.hayFiltro
                ? 'Sin resultados con los filtros actuales.'
                : 'Esta aseguradora aún no tiene conceptos. Arrastra o copia desde el panel izquierdo.'}
            </EstadoVacio>
          ) : (
            TIPOS.map((tipo) => {
              const grupo = visibles.filter((s) => s.tipo === tipo);
              if (grupo.length === 0) return null;
              const completo = !!verTodos[tipo] || grupo.length <= LIMITE_FILAS;
              const mostradas = completo ? grupo : grupo.slice(0, LIMITE_FILAS);
              return (
                <div key={tipo}>
                  <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                    {ETIQUETA_PLURAL[tipo]} ({grupo.length})
                  </h4>
                  <div className="space-y-1">
                    {mostradas.map((s) => (
                      <FilaServicio
                        key={s.id}
                        s={s}
                        nombreAseguradora={a.nombre}
                        duplicado={(repetidos.get(claveConcepto(s.tipo, s.nombre)) ?? 0) > 1}
                        onGuardarServicio={p.onGuardarServicio}
                        onGuardarCosto={p.onGuardarCosto}
                        onQuitar={p.onQuitar}
                      />
                    ))}
                  </div>
                  {!completo && (
                    <button
                      type="button"
                      onClick={() => setVerTodos((prev) => ({ ...prev, [tipo]: true }))}
                      className="mt-2 text-xs font-semibold text-primary-700 hover:underline"
                    >
                      Ver {grupo.length - LIMITE_FILAS} más
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}, mismaCarpeta);

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

interface DestinoCopia {
  id: string;
  nombre: string;
  nuevos: { origen: Origen; concepto: Concepto }[];
  existentes: string[];
}
type PlanCopia = DestinoCopia[];

function ModalResultadoCopia({
  plan,
  soloInformar,
  onCerrar,
  onConfirmar,
}: {
  plan: PlanCopia;
  soloInformar: boolean;
  onCerrar: () => void;
  onConfirmar: () => void;
}) {
  const totalNuevos = plan.reduce((n, d) => n + d.nuevos.length, 0);
  const totalExistentes = plan.reduce((n, d) => n + d.existentes.length, 0);
  const relevantes = plan.filter((d) => d.nuevos.length > 0 || d.existentes.length > 0);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onCerrar} role="dialog" aria-modal="true" aria-label="Resultado de la copia">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-line bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-line p-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-fg">
              {soloInformar ? 'Estos conceptos ya existen' : 'Algunos conceptos ya existen'}
            </h3>
            <p className="mt-1 text-sm text-fg-2">
              {soloInformar
                ? 'Todos los conceptos seleccionados ya están en las aseguradoras elegidas; no hay nada que agregar.'
                : `Se pueden agregar ${totalNuevos} ${plural(totalNuevos, 'concepto', 'conceptos')}; ${totalExistentes} ya ${plural(totalExistentes, 'está', 'están')} y se omitirán.`}
            </p>
          </div>
        </div>
        <div className="space-y-4 overflow-y-auto p-5">
          {relevantes.map((d) => (
            <section key={d.id}>
              <h4 className="text-sm font-extrabold text-fg">{d.nombre}</h4>
              {d.nuevos.length > 0 && (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Se agregarán ({d.nuevos.length})</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-fg">
                    {d.nuevos.map((n) => (
                      <li key={`${n.origen}:${n.concepto.id}`} className="flex items-start gap-1.5">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                        <span className="min-w-0 break-words">{n.concepto.nombre}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.existentes.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Ya existen ({d.existentes.length})</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-fg">
                    {d.existentes.map((n, i) => (
                      <li key={`${n}:${i}`} className="flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                        <span className="min-w-0 break-words">{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-line p-4">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2">
            {soloInformar ? 'Entendido' : 'Cancelar'}
          </button>
          {!soloInformar && (
            <button type="button" onClick={onConfirmar} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
              Agregar {totalNuevos} {plural(totalNuevos, 'nuevo', 'nuevos')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface Ultimo {
  catalogos: Record<Origen, Concepto[]>;
  quirurgico: ItemQuirurgico[];
  aseguradoras: Aseguradora[];
  serviciosPorAseguradora: Map<string, Servicio[]>;
  clavesPorAseguradora: Map<string, Set<string>>;
  seleccion: Record<string, boolean>;
  seleccionados: DatoArrastrado[];
}

export default function ConceptosPage() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });
  const avisar = useCallback((...args: Parameters<typeof toast>) => toastRef.current(...args), []);

  const { data: estudiosRes, isLoading: cargaEstudios, error: errEstudios, mutate: mutEstudios } = useSWR(URL_CATALOGO.ESTUDIO, (url: string) => fetchJSON<unknown>(url), OPCIONES_SWR);
  const { data: procedimientosRes, isLoading: cargaProcedimientos, error: errProcedimientos, mutate: mutProcedimientos } = useSWR(URL_CATALOGO.PROCEDIMIENTO, (url: string) => fetchJSON<unknown>(url), OPCIONES_SWR);
  const { data: consultasRes, isLoading: cargaConsultas, error: errConsultas, mutate: mutConsultas } = useSWR(URL_CATALOGO.CONSULTA, (url: string) => fetchJSON<unknown>(url), OPCIONES_SWR);
  const { data: quirurgicoRes, isLoading: cargaQuirurgico, error: errQuirurgico, mutate: mutQuirurgico } = useSWR(URL_QUIRURGICO, (url: string) => fetchJSON<unknown>(url), OPCIONES_SWR);
  const { data: aseguradorasRes, isLoading: cargaAseguradoras, mutate: mutAseguradoras } = useSWR(URL_ASEGURADORAS, (url: string) => fetchJSON<unknown>(url), OPCIONES_SWR);
  const { data: serviciosRes, isLoading: cargaServicios, mutate: mutServicios } = useSWR(URL_SERVICIOS_LISTA, (url: string) => fetchJSON<unknown>(url), OPCIONES_SWR);

  // Panel izquierdo
  const [pestana, setPestana] = useState<Pestana>('ESTUDIO');
  const [busquedaIzq, setBusquedaIzq] = useState('');
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});
  const [agregando, setAgregando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCosto, setNuevoCosto] = useState('');
  const [nuevoOjo, setNuevoOjo] = useState<Ojo | ''>('');
  const [creando, setCreando] = useState(false);
  const refNombre = useRef<HTMLInputElement>(null);

  // Panel derecho
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  const [busquedaDer, setBusquedaDer] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('TODOS');
  const [creandoAseguradora, setCreandoAseguradora] = useState(false);

  // Arrastre y copia
  const [arrastrando, setArrastrando] = useState(0);
  const [sobre, setSobre] = useState<string | null>(null);
  const [copiandoIds, setCopiandoIds] = useState<string[]>([]);
  const copiandoRef = useRef(false);
  const [planCopia, setPlanCopia] = useState<{ plan: PlanCopia; soloInformar: boolean } | null>(null);
  const temporizadorApertura = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Las búsquedas se difieren para que escribir no bloquee la interfaz.
  const busquedaIzqDiferida = useDeferredValue(busquedaIzq);
  const busquedaDerDiferida = useDeferredValue(busquedaDer);

  useEffect(
    () => () => {
      if (temporizadorApertura.current) clearTimeout(temporizadorApertura.current);
    },
    [],
  );
  useEffect(() => {
    if (agregando) refNombre.current?.focus();
  }, [agregando]);

  const catalogos = useMemo<Record<Origen, Concepto[]>>(
    () => ({
      ESTUDIO: lista<Concepto>(estudiosRes),
      PROCEDIMIENTO: lista<Concepto>(procedimientosRes),
      CONSULTA: lista<Concepto>(consultasRes),
    }),
    [estudiosRes, procedimientosRes, consultasRes],
  );
  const quirurgico = useMemo(() => lista<ItemQuirurgico>(quirurgicoRes), [quirurgicoRes]);
  const aseguradoras = useMemo(
    () =>
      lista<Aseguradora>(aseguradorasRes)
        .filter((a) => a.activo !== false)
        .sort((x, y) => {
          if (esParticular(x) !== esParticular(y)) return esParticular(x) ? -1 : 1;
          return porNombre(x, y);
        }),
    [aseguradorasRes],
  );
  const servicios = useMemo(() => lista<Servicio>(serviciosRes), [serviciosRes]);

  const serviciosPorAseguradora = useMemo(() => {
    const mapa = new Map<string, Servicio[]>();
    for (const s of servicios) {
      const actuales = mapa.get(s.aseguranza_id);
      if (actuales) actuales.push(s);
      else mapa.set(s.aseguranza_id, [s]);
    }
    return mapa;
  }, [servicios]);

  const clavesPorAseguradora = useMemo(() => {
    const mapa = new Map<string, Set<string>>();
    for (const [id, items] of serviciosPorAseguradora) {
      mapa.set(id, new Set(items.map((s) => claveConcepto(s.tipo, s.nombre))));
    }
    return mapa;
  }, [serviciosPorAseguradora]);

  /** En cuántas aseguradoras está cada concepto genérico (calculado una sola vez). */
  const presencia = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const a of aseguradoras) {
      for (const clave of clavesPorAseguradora.get(a.id) ?? []) mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
    }
    return mapa;
  }, [aseguradoras, clavesPorAseguradora]);

  /** Conceptos genéricos con nombre repetido dentro de su catálogo. */
  const idsDuplicados = useMemo(() => {
    const repetidos = new Set<string>();
    for (const origen of TIPOS) {
      const vistos = new Map<string, string>();
      for (const c of catalogos[origen]) {
        const k = normalizar(c.nombre);
        const previo = vistos.get(k);
        if (previo) {
          repetidos.add(claveSeleccion(origen, previo));
          repetidos.add(claveSeleccion(origen, c.id));
        } else vistos.set(k, c.id);
      }
    }
    return repetidos;
  }, [catalogos]);

  const seleccionados = useMemo<DatoArrastrado[]>(
    () =>
      Object.keys(seleccion)
        .filter((k) => seleccion[k])
        .map((k) => {
          const [origen, id] = k.split(':');
          return { origen: origen as Origen, id };
        }),
    [seleccion],
  );

  // Los manejadores estables leen siempre el estado más reciente desde aquí.
  const ultimo = useRef<Ultimo>({
    catalogos: { ESTUDIO: [], PROCEDIMIENTO: [], CONSULTA: [] },
    quirurgico: [],
    aseguradoras: [],
    serviciosPorAseguradora: new Map(),
    clavesPorAseguradora: new Map(),
    seleccion: {},
    seleccionados: [],
  });
  useEffect(() => {
    ultimo.current = { catalogos, quirurgico, aseguradoras, serviciosPorAseguradora, clavesPorAseguradora, seleccion, seleccionados };
  });

  const cargando = cargaEstudios || cargaProcedimientos || cargaConsultas || cargaQuirurgico || cargaAseguradoras || cargaServicios;
  const errorPorPestana: Record<Pestana, unknown> = {
    ESTUDIO: errEstudios,
    PROCEDIMIENTO: errProcedimientos,
    CONSULTA: errConsultas,
    QUIRURGICO: errQuirurgico,
  };

  // ---------- Caché local (sin volver a pedir listas completas) ----------
  const mutarCatalogo = useCallback(
    (origen: Origen, fn: (items: Concepto[]) => Concepto[]) => {
      const mutar = origen === 'ESTUDIO' ? mutEstudios : origen === 'PROCEDIMIENTO' ? mutProcedimientos : mutConsultas;
      return mutar((actual: unknown) => mapearLista<Concepto>(actual, fn), { revalidate: false });
    },
    [mutEstudios, mutProcedimientos, mutConsultas],
  );
  const mutarServicios = useCallback(
    (fn: (items: Servicio[]) => Servicio[]) => mutServicios((actual: unknown) => mapearLista<Servicio>(actual, fn), { revalidate: false }),
    [mutServicios],
  );
  const mutarQuirurgico = useCallback(
    (fn: (items: ItemQuirurgico[]) => ItemQuirurgico[]) => mutQuirurgico((actual: unknown) => mapearLista<ItemQuirurgico>(actual, fn), { revalidate: false }),
    [mutQuirurgico],
  );
  const mutarAseguradoras = useCallback(
    (fn: (items: Aseguradora[]) => Aseguradora[]) => mutAseguradoras((actual: unknown) => mapearLista<Aseguradora>(actual, fn), { revalidate: false }),
    [mutAseguradoras],
  );

  // ---------- Copiar conceptos genéricos a aseguradoras ----------
  const ejecutarCopia = useCallback(
    async (plan: PlanCopia) => {
      if (copiandoRef.current) return;
      const destinos = plan.filter((d) => d.nuevos.length > 0);
      if (destinos.length === 0) return;
      copiandoRef.current = true;
      setCopiandoIds(destinos.map((d) => d.id));
      let copiados = 0;
      let omitidos = plan.reduce((n, d) => n + d.existentes.length, 0);
      let fallidos = 0;
      try {
        for (const destino of destinos) {
          const resultados = await ejecutarEnLotes(
            destino.nuevos.map(({ origen, concepto }) => () =>
              enviarJSON(URL_SERVICIOS, 'POST', {
                aseguranza_id: destino.id,
                tipo: origen,
                nombre: concepto.nombre,
                costo: Number(concepto.costo) || 0,
                porcentaje_cobertura: 0,
              }),
            ),
          );
          for (const r of resultados) {
            if (r.status === 'fulfilled') copiados += 1;
            // 409: alguien lo agregó entre tanto → cuenta como "ya estaba", no como fallo.
            else if ((r.reason as { status?: number } | undefined)?.status === 409) omitidos += 1;
            else fallidos += 1;
          }
        }
        // El alta no devuelve los ids: una sola recarga al terminar todo el lote.
        await mutServicios();
        if (destinos.length === 1) setAbiertas((prev) => ({ ...prev, [destinos[0].id]: true }));

        const nombreDestino = destinos.length === 1 ? destinos[0].nombre : `${destinos.length} aseguradoras`;
        if (copiados > 0) avisar(`${copiados} ${plural(copiados, 'concepto copiado', 'conceptos copiados')} a ${nombreDestino}`);
        if (omitidos > 0) avisar(`${omitidos} ${plural(omitidos, 'concepto ya existía', 'conceptos ya existían')} y se omitió`, 'warning');
        if (fallidos > 0) avisar(`No se pudieron copiar ${fallidos} ${plural(fallidos, 'concepto', 'conceptos')}`, 'error');
      } catch (err) {
        avisar(mensajeDeError(err, 'No se pudo copiar'), 'error');
      } finally {
        copiandoRef.current = false;
        setCopiandoIds([]);
      }
    },
    [avisar, mutServicios],
  );

  const copiar = useCallback(
    async (destinos: string[], lote: DatoArrastrado[]) => {
      if (destinos.length === 0 || lote.length === 0 || copiandoRef.current) return;
      const { catalogos: cat, clavesPorAseguradora: claves, aseguradoras: aseg } = ultimo.current;
      const plan: PlanCopia = destinos.map((id) => {
        const existentesClaves = claves.get(id) ?? new Set<string>();
        const vistos = new Set<string>();
        const nuevos: { origen: Origen; concepto: Concepto }[] = [];
        const existentes: string[] = [];
        for (const d of lote) {
          const concepto = cat[d.origen].find((c) => c.id === d.id);
          if (!concepto) continue;
          const clave = claveConcepto(d.origen, concepto.nombre);
          if (existentesClaves.has(clave)) {
            existentes.push(concepto.nombre);
            continue;
          }
          if (vistos.has(clave)) continue;
          vistos.add(clave);
          nuevos.push({ origen: d.origen, concepto });
        }
        return { id, nombre: aseg.find((a) => a.id === id)?.nombre ?? 'la aseguradora', nuevos, existentes };
      });
      const totalNuevos = plan.reduce((n, d) => n + d.nuevos.length, 0);
      const totalExistentes = plan.reduce((n, d) => n + d.existentes.length, 0);

      if (totalExistentes === 0) {
        await ejecutarCopia(plan);
        return;
      }
      // Un solo concepto hacia una sola aseguradora: alerta amarilla directa.
      if (lote.length === 1 && destinos.length === 1) {
        avisar(`Este concepto ya existe en ${plan[0].nombre}`, 'warning');
        return;
      }
      // Varios: ventana con lo que se puede agregar y lo que ya está.
      if (totalNuevos === 0) {
        setPlanCopia({ plan, soloInformar: true });
        return;
      }
      setPlanCopia({ plan, soloInformar: false });
    },
    [avisar, ejecutarCopia],
  );

  // ---------- Arrastre ----------
  const cancelarApertura = useCallback(() => {
    if (temporizadorApertura.current) {
      clearTimeout(temporizadorApertura.current);
      temporizadorApertura.current = null;
    }
  }, []);

  const iniciarArrastre = useCallback((e: DragEvent<HTMLElement>, origen: Origen, concepto: Concepto) => {
    const { seleccion: sel, seleccionados: marcados } = ultimo.current;
    const lote: DatoArrastrado[] = sel[claveSeleccion(origen, concepto.id)] && marcados.length > 1 ? marcados : [{ origen, id: concepto.id }];
    e.dataTransfer.setData('text/plain', JSON.stringify(lote));
    e.dataTransfer.effectAllowed = 'copy';
    const fila = e.currentTarget.closest('li');
    if (fila) e.dataTransfer.setDragImage(fila, 16, 16);
    setArrastrando(lote.length);
  }, []);

  const terminarArrastre = useCallback(() => {
    cancelarApertura();
    setArrastrando(0);
    setSobre(null);
  }, [cancelarApertura]);

  const entrarCarpeta = useCallback((id: string, abierta: boolean) => {
    setSobre(id);
    if (!abierta && !temporizadorApertura.current) {
      temporizadorApertura.current = setTimeout(() => {
        setAbiertas((prev) => ({ ...prev, [id]: true }));
        temporizadorApertura.current = null;
      }, 600);
    }
  }, []);

  const salirCarpeta = useCallback(
    (e: DragEvent<HTMLDivElement>, id: string) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      cancelarApertura();
      setSobre((actual) => (actual === id ? null : actual));
    },
    [cancelarApertura],
  );

  const soltarEnCarpeta = useCallback(
    (e: DragEvent<HTMLDivElement>, aseguranzaId: string) => {
      e.preventDefault();
      terminarArrastre();
      let lote: DatoArrastrado[] = [];
      try {
        const dato: unknown = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (Array.isArray(dato)) lote = dato.filter(esDato);
      } catch {
        lote = [];
      }
      if (lote.length > 0) void copiar([aseguranzaId], lote);
    },
    [copiar, terminarArrastre],
  );

  const alternarCarpeta = useCallback((id: string) => setAbiertas((prev) => ({ ...prev, [id]: !prev[id] })), []);

  const alternarMarca = useCallback((origen: Origen, id: string) => {
    const k = claveSeleccion(origen, id);
    setSeleccion((prev) => ({ ...prev, [k]: !prev[k] }));
  }, []);

  // ---------- Guardado de campos ----------
  const guardarConcepto = useCallback(
    async (origen: Origen, concepto: Concepto, cambios: Record<string, unknown>) => {
      if (typeof cambios.nombre === 'string') {
        const buscado = normalizar(cambios.nombre);
        if (ultimo.current.catalogos[origen].some((c) => c.id !== concepto.id && normalizar(c.nombre) === buscado)) {
          avisar('Ya existe un concepto con ese nombre', 'error');
          return false;
        }
      }
      try {
        await enviarJSON(URL_CATALOGO[origen], 'PUT', { id: concepto.id, ...cambios });
        await mutarCatalogo(origen, (items) => items.map((c) => (c.id === concepto.id ? ({ ...c, ...cambios } as Concepto) : c)));
        return true;
      } catch (err) {
        avisar(mensajeDeError(err, 'No se pudo guardar el cambio'), 'error');
        return false;
      }
    },
    [avisar, mutarCatalogo],
  );

  const guardarNombreConcepto = useCallback(
    (origen: Origen, concepto: Concepto, texto: string) => guardarConcepto(origen, concepto, { nombre: texto }),
    [guardarConcepto],
  );

  const guardarCostoConcepto = useCallback(
    async (origen: Origen, concepto: Concepto, texto: string) => {
      const costo = Number(texto);
      if (!Number.isFinite(costo) || costo < 0) {
        avisar('El costo no es válido', 'error');
        return false;
      }
      if (costo === Number(concepto.costo)) return true;
      return guardarConcepto(origen, concepto, { costo });
    },
    [avisar, guardarConcepto],
  );

  const guardarServicio = useCallback(
    async (servicio: Servicio, cambios: Record<string, unknown>) => {
      if (typeof cambios.nombre === 'string' || typeof cambios.tipo === 'string') {
        const nombre = typeof cambios.nombre === 'string' ? cambios.nombre : servicio.nombre;
        const tipo = (typeof cambios.tipo === 'string' ? cambios.tipo : servicio.tipo) as Origen;
        const clave = claveConcepto(tipo, nombre);
        const repetido = (ultimo.current.serviciosPorAseguradora.get(servicio.aseguranza_id) ?? []).some(
          (s) => s.id !== servicio.id && claveConcepto(s.tipo, s.nombre) === clave,
        );
        if (repetido) {
          avisar('Esta aseguradora ya tiene un concepto igual', 'error');
          return false;
        }
      }
      try {
        await enviarJSON(URL_SERVICIOS, 'PATCH', { id: servicio.id, ...cambios });
        await mutarServicios((items) =>
          cambios.activo === false
            ? items.filter((s) => s.id !== servicio.id)
            : items.map((s) => (s.id === servicio.id ? ({ ...s, ...cambios } as Servicio) : s)),
        );
        return true;
      } catch (err) {
        avisar(mensajeDeError(err, 'No se pudo guardar el cambio'), 'error');
        return false;
      }
    },
    [avisar, mutarServicios],
  );

  const guardarCostoServicio = useCallback(
    async (servicio: Servicio, texto: string) => {
      const costo = Number(texto);
      if (!Number.isFinite(costo) || costo < 0) {
        avisar('El costo no es válido', 'error');
        return false;
      }
      if (costo === Number(servicio.costo)) return true;
      return guardarServicio(servicio, { costo });
    },
    [avisar, guardarServicio],
  );

  const quitarServicio = useCallback(
    async (servicio: Servicio) => {
      if (await guardarServicio(servicio, { activo: false })) avisar(`"${servicio.nombre}" quitado de la aseguradora`);
    },
    [avisar, guardarServicio],
  );

  const guardarQuirurgico = useCallback(
    async (item: ItemQuirurgico, cambios: Record<string, unknown>) => {
      if (typeof cambios.nombre === 'string' || 'ojo' in cambios) {
        const nombre = normalizar(typeof cambios.nombre === 'string' ? cambios.nombre : item.nombre);
        const ojo = 'ojo' in cambios ? ((cambios.ojo as Ojo | null) ?? null) : item.ojo;
        if (ultimo.current.quirurgico.some((q) => q.id !== item.id && normalizar(q.nombre) === nombre && (q.ojo ?? null) === ojo)) {
          avisar('Ya existe ese procedimiento para ese ojo', 'error');
          return false;
        }
      }
      try {
        await enviarJSON(URL_QUIRURGICO, 'PUT', { id: item.id, ...cambios });
        await mutarQuirurgico((items) => items.map((q) => (q.id === item.id ? ({ ...q, ...cambios } as ItemQuirurgico) : q)));
        return true;
      } catch (err) {
        avisar(mensajeDeError(err, 'No se pudo guardar el cambio'), 'error');
        return false;
      }
    },
    [avisar, mutarQuirurgico],
  );

  const eliminarGenerico = useCallback(
    async (origen: Origen, concepto: Concepto) => {
      try {
        await enviarJSON(`${URL_CATALOGO[origen]}?id=${encodeURIComponent(concepto.id)}`, 'DELETE');
        setSeleccion((prev) => {
          const { [claveSeleccion(origen, concepto.id)]: _quitado, ...resto } = prev;
          return resto;
        });
        await mutarCatalogo(origen, (items) => items.filter((c) => c.id !== concepto.id));
        avisar(`"${concepto.nombre}" eliminado`);
      } catch (err) {
        avisar(mensajeDeError(err, 'No se pudo eliminar el concepto'), 'error');
      }
    },
    [avisar, mutarCatalogo],
  );

  const eliminarQuirurgico = useCallback(
    async (item: ItemQuirurgico) => {
      try {
        await enviarJSON(`${URL_QUIRURGICO}?id=${encodeURIComponent(item.id)}`, 'DELETE');
        await mutarQuirurgico((items) => items.filter((q) => q.id !== item.id));
        avisar(`"${item.nombre}" eliminado`);
      } catch (err) {
        avisar(mensajeDeError(err, 'No se pudo eliminar el procedimiento'), 'error');
      }
    },
    [avisar, mutarQuirurgico],
  );

  // ---------- Aseguradoras ----------
  const guardarAseguradora = useCallback(
    async (a: Aseguradora, cambios: Record<string, unknown>) => {
      if (typeof cambios.nombre === 'string') {
        const buscado = normalizar(cambios.nombre);
        if (ultimo.current.aseguradoras.some((x) => x.id !== a.id && normalizar(x.nombre) === buscado)) {
          avisar('Ya existe una aseguradora con ese nombre', 'error');
          return false;
        }
      }
      if ('porcentaje_cobertura' in cambios && cambios.porcentaje_cobertura !== null) {
        const n = Number(cambios.porcentaje_cobertura);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          avisar('La cobertura debe estar entre 0 y 100', 'error');
          return false;
        }
      }
      try {
        await enviarJSON(URL_ASEGURADORAS, 'PATCH', { id: a.id, ...cambios });
        await mutarAseguradoras((items) => items.map((x) => (x.id === a.id ? ({ ...x, ...cambios } as Aseguradora) : x)));
        return true;
      } catch (err) {
        avisar(mensajeDeError(err, 'No se pudo guardar el cambio'), 'error');
        return false;
      }
    },
    [avisar, mutarAseguradoras],
  );

  const eliminarAseguradora = useCallback(
    async (a: Aseguradora, confirmacion: string): Promise<string | null> => {
      try {
        await enviarJSON(`${URL_ASEGURADORAS}?id=${encodeURIComponent(a.id)}&confirmar=${encodeURIComponent(confirmacion)}`, 'DELETE');
        await mutarAseguradoras((items) => items.filter((x) => x.id !== a.id));
        avisar(`Aseguradora "${a.nombre}" eliminada`);
        return null;
      } catch (err) {
        return mensajeDeError(err, 'No se pudo eliminar la aseguradora');
      }
    },
    [avisar, mutarAseguradoras],
  );

  const crearAseguradora = useCallback(
    async (datos: Record<string, unknown>) => {
      const nombre = String(datos.nombre ?? '');
      if (!nombre) {
        avisar('Escribe el nombre de la aseguradora', 'error');
        return false;
      }
      if (ultimo.current.aseguradoras.some((x) => normalizar(x.nombre) === normalizar(nombre))) {
        avisar('Ya existe una aseguradora con ese nombre', 'error');
        return false;
      }
      if (typeof datos.porcentaje_cobertura === 'number' && (datos.porcentaje_cobertura < 0 || datos.porcentaje_cobertura > 100)) {
        avisar('La cobertura debe estar entre 0 y 100', 'error');
        return false;
      }
      try {
        const nueva = await enviarJSON<Aseguradora>(URL_ASEGURADORAS, 'POST', datos);
        if (nueva?.id) {
          await mutarAseguradoras((items) => [...items, nueva]);
          setAbiertas((prev) => ({ ...prev, [nueva.id]: true }));
        } else {
          await mutAseguradoras();
        }
        avisar(`Aseguradora "${nombre}" creada`);
        return true;
      } catch (err) {
        avisar(mensajeDeError(err, 'No se pudo crear la aseguradora'), 'error');
        return false;
      }
    },
    [avisar, mutarAseguradoras, mutAseguradoras],
  );

  // ---------- Alta de conceptos ----------
  async function crearConcepto(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nombre = nuevoNombre.trim();
    if (!nombre) {
      avisar('Escribe el nombre', 'error');
      refNombre.current?.focus();
      return;
    }
    setCreando(true);
    try {
      if (pestana === 'QUIRURGICO') {
        if (quirurgico.some((q) => normalizar(q.nombre) === normalizar(nombre) && (q.ojo ?? '') === nuevoOjo)) {
          avisar('Ya existe ese procedimiento para ese ojo', 'error');
          return;
        }
        const precio = nuevoCosto.trim() === '' ? 0 : Number(nuevoCosto);
        if (!Number.isFinite(precio) || precio < 0) {
          avisar('El precio no es válido', 'error');
          return;
        }
        const fila = await enviarJSON<ItemQuirurgico>(URL_QUIRURGICO, 'POST', { nombre, ojo: nuevoOjo || null, precio });
        if (fila?.id) await mutarQuirurgico((items) => [...items, fila]);
        else await mutQuirurgico();
      } else {
        const costo = nuevoCosto.trim() === '' ? 0 : Number(nuevoCosto);
        if (!Number.isFinite(costo) || costo < 0) {
          avisar('El costo no es válido', 'error');
          return;
        }
        if (catalogos[pestana].some((c) => normalizar(c.nombre) === normalizar(nombre))) {
          avisar('Ya existe un concepto con ese nombre', 'error');
          return;
        }
        const origen = pestana;
        const fila = await enviarJSON<Concepto>(URL_CATALOGO[origen], 'POST', cuerpoAlta(origen, nombre, costo));
        if (fila?.id) await mutarCatalogo(origen, (items) => [...items, fila]);
      }
      avisar(`"${nombre}" agregado`);
      setNuevoNombre('');
      setNuevoCosto('');
      refNombre.current?.focus();
    } catch (err) {
      avisar(mensajeDeError(err, 'No se pudo crear'), 'error');
    } finally {
      setCreando(false);
    }
  }

  function recargarPestana(p: Pestana) {
    if (p === 'QUIRURGICO') return mutQuirurgico();
    if (p === 'ESTUDIO') return mutEstudios();
    if (p === 'PROCEDIMIENTO') return mutProcedimientos();
    return mutConsultas();
  }

  // ---------- Derivados del panel izquierdo ----------
  const terminoIzq = normalizar(busquedaIzqDiferida);
  const itemsIzq = useMemo<Concepto[]>(
    () =>
      pestana === 'QUIRURGICO'
        ? []
        : catalogos[pestana].filter((c) => !terminoIzq || normalizar(c.nombre).includes(terminoIzq)).sort(porNombre),
    [pestana, catalogos, terminoIzq],
  );
  const quirurgicoVisible = useMemo(
    () => quirurgico.filter((q) => !terminoIzq || normalizar(q.nombre).includes(terminoIzq)).sort(porNombre),
    [quirurgico, terminoIzq],
  );
  const todosMarcados = pestana !== 'QUIRURGICO' && itemsIzq.length > 0 && itemsIzq.every((c) => seleccion[claveSeleccion(pestana, c.id)]);

  function alternarVisibles() {
    if (pestana === 'QUIRURGICO') return;
    const origen = pestana;
    setSeleccion((prev) => {
      const siguiente = { ...prev };
      for (const c of itemsIzq) {
        if (todosMarcados) delete siguiente[claveSeleccion(origen, c.id)];
        else siguiente[claveSeleccion(origen, c.id)] = true;
      }
      return siguiente;
    });
  }

  const conteoPestana = (p: Pestana) => (p === 'QUIRURGICO' ? quirurgico.length : catalogos[p].length);
  const tituloPestana = PESTANAS.find((p) => p.clave === pestana)?.titulo ?? '';
  const etiquetaPestana = PESTANAS.find((p) => p.clave === pestana)?.etiqueta.toLowerCase() ?? '';

  // ---------- Derivados del panel derecho ----------
  const terminoDer = normalizar(busquedaDerDiferida);
  const hayFiltroDer = terminoDer !== '' || filtroTipo !== 'TODOS';

  const carpetas = useMemo(
    () =>
      aseguradoras
        .map((a) => ({ a, todos: serviciosPorAseguradora.get(a.id) ?? SIN_SERVICIOS }))
        .filter(({ a, todos }) => {
          if (!hayFiltroDer) return true;
          if (todos.some((s) => coincideServicio(s, filtroTipo, terminoDer))) return true;
          return filtroTipo === 'TODOS' && terminoDer !== '' && normalizar(a.nombre).includes(terminoDer);
        }),
    [aseguradoras, serviciosPorAseguradora, hayFiltroDer, filtroTipo, terminoDer],
  );

  // ---------- Render ----------
  function renderPanelIzquierdo() {
    const error = errorPorPestana[pestana];
    return (
      <section className="flex max-h-[70vh] flex-col rounded-xl border border-line bg-white dark:bg-gray-900 lg:sticky lg:top-4 lg:max-h-[calc(100vh-3rem)]">
        <header className="space-y-3 border-b border-line p-4">
          <div>
            <h2 className="text-sm font-bold text-fg">{tituloPestana}</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              {pestana === 'QUIRURGICO'
                ? 'Se usa al crear cirugías. Cada procedimiento lleva su precio (aplica a todas las aseguradoras; si una aseguradora tiene un servicio con el mismo nombre, se usa el de ella).'
                : 'Marca varios o arrastra ⋮⋮ a una aseguradora. El precio de la copia es independiente.'}
            </p>
          </div>
          <div role="tablist" aria-label="Tipo de concepto" className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            {PESTANAS.map((p) => {
              const activa = p.clave === pestana;
              return (
                <button
                  key={p.clave}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  title={p.titulo}
                  onClick={() => {
                    setPestana(p.clave);
                    setBusquedaIzq('');
                    setAgregando(false);
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-semibold transition-colors',
                    activa ? 'bg-white text-fg shadow-sm dark:bg-gray-900' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {p.etiqueta}
                  <span className="rounded-full bg-gray-200 px-1.5 text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {conteoPestana(p.clave)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <CampoBusqueda valor={busquedaIzq} onCambio={setBusquedaIzq} placeholder={`Buscar en ${etiquetaPestana}`} />
          </div>
          {pestana !== 'QUIRURGICO' && itemsIzq.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-500">
              <input type="checkbox" checked={todosMarcados} onChange={alternarVisibles} className="h-4 w-4 rounded border-line accent-primary-600" />
              {todosMarcados ? 'Quitar selección de' : 'Seleccionar'} {itemsIzq.length} {plural(itemsIzq.length, 'visible', 'visibles')}
            </label>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error ? (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
              <p className="font-semibold">No se pudo cargar este catálogo.</p>
              {(pestana === 'CONSULTA' || pestana === 'QUIRURGICO') && (
                <p className="text-xs">
                  Si es un catálogo nuevo, falta aplicar en Supabase la migración <code>sql/conceptos-consultas-quirurgico.sql</code>.
                </p>
              )}
              <button type="button" onClick={() => void recargarPestana(pestana)} className="text-xs font-semibold underline">
                Reintentar
              </button>
            </div>
          ) : pestana === 'QUIRURGICO' ? (
            quirurgicoVisible.length === 0 ? (
              <EstadoVacio>{terminoIzq ? 'Sin resultados.' : 'Aún no hay procedimientos quirúrgicos. Agrega el primero abajo.'}</EstadoVacio>
            ) : (
              <ul className="space-y-1.5">
                {quirurgicoVisible.map((q) => (
                  <FilaQuirurgica key={q.id} item={q} onGuardar={guardarQuirurgico} onEliminar={eliminarQuirurgico} />
                ))}
              </ul>
            )
          ) : itemsIzq.length === 0 ? (
            <EstadoVacio>{terminoIzq ? 'Sin resultados.' : `Aún no hay ${etiquetaPestana}. Agrega el primero abajo.`}</EstadoVacio>
          ) : (
            <ul className="space-y-1.5">
              {itemsIzq.map((c) => (
                <FilaGenerica
                  key={c.id}
                  origen={pestana}
                  c={c}
                  marcado={!!seleccion[claveSeleccion(pestana, c.id)]}
                  presencia={presencia.get(claveConcepto(pestana, c.nombre)) ?? 0}
                  total={aseguradoras.length}
                  duplicado={idsDuplicados.has(claveSeleccion(pestana, c.id))}
                  onMarcar={alternarMarca}
                  onIniciarArrastre={iniciarArrastre}
                  onTerminarArrastre={terminarArrastre}
                  onGuardarNombre={guardarNombreConcepto}
                  onGuardarCosto={guardarCostoConcepto}
                  onEliminar={eliminarGenerico}
                />
              ))}
            </ul>
          )}
        </div>

        {seleccionados.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-primary-200 bg-primary-50 px-3 py-2 dark:bg-primary-900/10">
            <span className="text-sm font-semibold text-primary-700">
              {seleccionados.length} {plural(seleccionados.length, 'seleccionado', 'seleccionados')}
            </span>
            <select
              aria-label="Copiar seleccionados a"
              value=""
              disabled={copiandoIds.length > 0}
              onChange={(e) => {
                const valor = e.target.value;
                if (!valor) return;
                void copiar(valor === '__todas' ? aseguradoras.map((a) => a.id) : [valor], seleccionados);
              }}
              className="rounded-md border border-line bg-white px-2 py-1 text-sm text-fg dark:bg-gray-900"
            >
              <option value="">Copiar a…</option>
              <option value="__todas">Todas las aseguradoras</option>
              {aseguradoras.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
            {copiandoIds.length > 0 && <Loader2 className="h-4 w-4 animate-spin text-primary-600" aria-label="Copiando" />}
            <button type="button" onClick={() => setSeleccion({})} className="ml-auto text-xs font-semibold text-gray-500 hover:text-gray-700">
              Limpiar
            </button>
          </div>
        )}

        <footer className="border-t border-line p-3">
          {!agregando ? (
            <button
              type="button"
              onClick={() => setAgregando(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/10"
            >
              <Plus className="h-4 w-4" aria-hidden /> {NUEVO_TEXTO[pestana]}
            </button>
          ) : (
            <form
              onSubmit={crearConcepto}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setAgregando(false);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                ref={refNombre}
                type="text"
                aria-label="Nombre"
                placeholder="Nombre"
                maxLength={255}
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                className="min-w-[140px] flex-1 rounded-md border border-line bg-transparent px-2 py-2 text-sm text-fg focus:border-primary-500 focus:outline-none"
              />
              {pestana === 'QUIRURGICO' && (
                <select
                  aria-label="Ojo"
                  value={nuevoOjo}
                  onChange={(e) => setNuevoOjo(e.target.value as Ojo | '')}
                  className="rounded-md border border-line bg-transparent px-2 py-2 text-sm text-fg"
                >
                  <option value="">Sin ojo</option>
                  <option value="OD">OD</option>
                  <option value="OI">OI</option>
                  <option value="OU">OU</option>
                </select>
              )}
              {(

                <input
                  type="number"
                  inputMode="decimal"
                  aria-label="Costo"
                  placeholder="$ Costo"
                  min={0}
                  step="0.01"
                  value={nuevoCosto}
                  onChange={(e) => setNuevoCosto(e.target.value)}
                  className="w-28 rounded-md border border-line bg-transparent px-2 py-2 text-right text-sm text-fg focus:border-primary-500 focus:outline-none"
                />
              )}
              <button
                type="submit"
                disabled={creando}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {creando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Agregar
              </button>
              <button
                type="button"
                onClick={() => setAgregando(false)}
                aria-label="Cerrar formulario"
                className="rounded-md p-2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </form>
          )}
        </footer>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-fg">Conceptos</h2>
          <ol className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
            <li><b className="text-gray-500">1.</b> Marca o arrastra un concepto genérico</li>
            <li><b className="text-gray-500">2.</b> Suéltalo en la carpeta de una aseguradora</li>
            <li><b className="text-gray-500">3.</b> Ajusta su precio ahí; el genérico no cambia</li>
          </ol>
        </div>
        <button
          type="button"
          onClick={() => setCreandoAseguradora(true)}
          disabled={creandoAseguradora}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary-300 px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50 dark:hover:bg-primary-900/10"
        >
          <Plus className="h-4 w-4" aria-hidden /> Nueva aseguradora
        </button>
      </div>

      {cargando ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]" aria-busy="true">
          <div className="h-96 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
          {renderPanelIzquierdo()}

          <section className="space-y-3">
            {arrastrando > 0 && (
              <div className="sticky top-2 z-20 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
                Suelta sobre una aseguradora para copiar {arrastrando} {plural(arrastrando, 'concepto', 'conceptos')}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-fg">Aseguradoras</h2>
                <span className="text-xs text-gray-400">({aseguradoras.length})</span>
                <div className="ml-auto flex gap-3 text-xs font-semibold text-primary-700">
                  <button type="button" onClick={() => setAbiertas(Object.fromEntries(aseguradoras.map((a) => [a.id, true])))} className="hover:underline">
                    Expandir todo
                  </button>
                  <button type="button" onClick={() => setAbiertas({})} className="hover:underline">
                    Contraer todo
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CampoBusqueda valor={busquedaDer} onCambio={setBusquedaDer} placeholder="Buscar concepto o aseguradora" />
                <div className="flex flex-wrap gap-1">
                  {CHIPS_TIPO.map((chip) => (
                    <button
                      key={chip.clave}
                      type="button"
                      aria-pressed={filtroTipo === chip.clave}
                      onClick={() => setFiltroTipo(chip.clave)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                        filtroTipo === chip.clave
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-line text-gray-500 hover:border-primary-300 hover:text-primary-700',
                      )}
                    >
                      {chip.etiqueta}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {creandoAseguradora && <FormNuevaAseguradora onCrear={crearAseguradora} onCancelar={() => setCreandoAseguradora(false)} />}

            {aseguradoras.length === 0 && !creandoAseguradora && (
              <EstadoVacio>Aún no hay aseguradoras. Crea la primera con «Nueva aseguradora».</EstadoVacio>
            )}
            {aseguradoras.length > 0 && carpetas.length === 0 && <EstadoVacio>Sin resultados con los filtros actuales.</EstadoVacio>}
            {carpetas.map(({ a, todos }) => (
              <Carpeta
                key={a.id}
                a={a}
                todos={todos}
                abiertaManual={!!abiertas[a.id]}
                esDestino={sobre === a.id}
                copiando={copiandoIds.includes(a.id)}
                hayArrastre={arrastrando > 0}
                cantidadArrastre={sobre === a.id ? arrastrando : 0}
                filtroTipo={filtroTipo}
                termino={terminoDer}
                hayFiltro={hayFiltroDer}
                onAlternar={alternarCarpeta}
                onEntrar={entrarCarpeta}
                onSalir={salirCarpeta}
                onSoltar={soltarEnCarpeta}
                onGuardarServicio={guardarServicio}
                onGuardarCosto={guardarCostoServicio}
                onQuitar={quitarServicio}
                onGuardarAseguradora={guardarAseguradora}
                onEliminarAseguradora={eliminarAseguradora}
              />
            ))}
          </section>
        </div>
      )}
      {planCopia && (
        <ModalResultadoCopia
          plan={planCopia.plan}
          soloInformar={planCopia.soloInformar}
          onCerrar={() => setPlanCopia(null)}
          onConfirmar={() => {
            const plan = planCopia.plan;
            setPlanCopia(null);
            void ejecutarCopia(plan);
          }}
        />
      )}
    </div>
  );
}
