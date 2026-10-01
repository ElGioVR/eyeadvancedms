'use client';

import { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, Download, Loader2, Mail, MapPin, Package, Pencil, Phone, Plus, Search, Tag, Trash2, Upload, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFetch, useInvalidar } from '@/hooks/useFetch';
import { useDebounce } from '@/hooks/useDebounce';
import { enviarJSON } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import {
  DISENOS_LIO, PLANTILLA_CSV_MODELOS_LIO, URL_ESCRS_IOL, URL_IOLCON,
  fabricanteCanonico, parsearCsvModelosLio,
  type DisenoLio, type FilaModeloLio, type ModeloLio,
} from '@/lib/catalogos/modelos-lio';

/**
 * Marcas (antes Proveedores + Modelos de LIO): cada marca tiene sus datos de
 * contacto (tabla proveedores) y sus modelos de lente (cat_modelos_lio,
 * agrupados por fabricante). Todo se agrega, edita y desactiva desde aquí.
 */

interface Proveedor {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  contacto: string | null;
  activo: boolean;
}

interface Marca {
  clave: string;
  nombre: string;
  proveedor: Proveedor | null;
  modelos: ModeloLio[];
}

const URL_PROVEEDORES = '/api/configuracion/proveedores';
const URL_MODELOS = '/api/configuracion/modelos-lio';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const msg = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const etiquetaDiseno = (d: string) => DISENOS_LIO.find((x) => x.value === d)?.label ?? d;
const ORIGEN: Record<string, string> = { MANUAL: 'Manual', INVENTARIO: 'Inventario', CSV: 'CSV' };
const COLORES = ['bg-primary-500', 'bg-sky-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500', 'bg-cyan-500', 'bg-amber-500', 'bg-violet-500'];
const color = (t: string) => COLORES[t.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES.length];
const iniciales = (t: string) => t.split(/\s+/).filter((p) => /[a-z0-9]/i.test(p)).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

interface FormMarca { proveedorId: string | null; nombreOriginal: string | null; nombre: string; contacto: string; telefono: string; email: string; direccion: string }
interface FormModelo { id?: string; modelo: string; diseno: DisenoLio; torico: boolean; notas: string }

export default function MarcasPage() {
  const proveedoresQ = useFetch<Proveedor>(URL_PROVEEDORES);
  const modelosQ = useFetch<ModeloLio>(URL_MODELOS);
  const invalidar = useInvalidar();
  const { toast } = useToast();

  const [busqueda, setBusqueda] = useState('');
  const termino = useDebounce(busqueda.trim().toLowerCase(), 200);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [verInactivos, setVerInactivos] = useState(false);
  const [formMarca, setFormMarca] = useState<FormMarca | null>(null);
  const [formModelo, setFormModelo] = useState<FormModelo | null>(null);
  const [borrarMarca, setBorrarMarca] = useState<Marca | null>(null);
  const [importacion, setImportacion] = useState<{ filas: FilaModeloLio[]; errores: string[] } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const inputCsv = useRef<HTMLInputElement>(null);

  const sinPermisoModelos = !!modelosQ.error;

  // Unión de marcas: proveedores activos + fabricantes del catálogo (alias agrupados).
  const marcas = useMemo<Marca[]>(() => {
    const mapa = new Map<string, Marca>();
    const obtener = (nombre: string) => {
      const canon = fabricanteCanonico(nombre);
      const clave = canon.toLowerCase();
      let m = mapa.get(clave);
      if (!m) { m = { clave, nombre: canon, proveedor: null, modelos: [] }; mapa.set(clave, m); }
      return m;
    };
    for (const p of proveedoresQ.data) {
      if (p.activo === false) continue;
      const m = obtener(p.nombre);
      if (!m.proveedor) { m.proveedor = p; m.nombre = p.nombre; }
    }
    for (const mod of modelosQ.data) obtener(mod.fabricante).modelos.push(mod);
    return [...mapa.values()]
      .filter((m) => m.proveedor || m.modelos.some((x) => x.activo))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [proveedoresQ.data, modelosQ.data]);

  const visibles = useMemo(
    () => marcas.filter((m) => !termino || m.nombre.toLowerCase().includes(termino) || m.modelos.some((x) => x.modelo.toLowerCase().includes(termino))),
    [marcas, termino],
  );
  const marca = marcas.find((m) => m.clave === seleccion) ?? visibles[0] ?? null;
  const modelosDeMarca = useMemo(() => {
    if (!marca) return [];
    return marca.modelos
      .filter((x) => verInactivos || x.activo)
      .filter((x) => !termino || marca.nombre.toLowerCase().includes(termino) || x.modelo.toLowerCase().includes(termino))
      .sort((a, b) => Number(b.activo) - Number(a.activo) || a.modelo.localeCompare(b.modelo, 'es'));
  }, [marca, verInactivos, termino]);

  const refrescar = () => void invalidar(URL_PROVEEDORES, URL_MODELOS, '/api/catalogos/modelos-lio');

  // ── Marca ───────────────────────────────────────────────
  const abrirMarca = (m: Marca | null) => {
    setErrorForm(null);
    const p = m?.proveedor;
    setFormMarca({
      proveedorId: p?.id ?? null,
      nombreOriginal: m?.nombre ?? null,
      nombre: m?.nombre ?? '',
      contacto: p?.contacto ?? '',
      telefono: p?.telefono ?? '',
      email: p?.email ?? '',
      direccion: p?.direccion ?? '',
    });
  };

  const guardarMarca = async () => {
    if (!formMarca || guardando) return;
    const nombre = formMarca.nombre.trim().replace(/\s+/g, ' ');
    if (!nombre) return setErrorForm('El nombre de la marca es obligatorio');
    if (formMarca.email.trim() && !EMAIL_RE.test(formMarca.email.trim())) return setErrorForm('El correo no es válido');
    const otra = marcas.find((m) => m.clave === fabricanteCanonico(nombre).toLowerCase());
    if (otra && otra.nombre !== formMarca.nombreOriginal) return setErrorForm(`Ya existe la marca «${otra.nombre}»`);
    setGuardando(true);
    setErrorForm(null);
    try {
      const datos = {
        nombre,
        contacto: formMarca.contacto.trim() || null,
        telefono: formMarca.telefono.trim() || null,
        email: formMarca.email.trim() || null,
        direccion: formMarca.direccion.trim() || null,
      };
      if (formMarca.proveedorId) await enviarJSON(URL_PROVEEDORES, 'PATCH', { id: formMarca.proveedorId, ...datos });
      else {
        // POST no acepta null: solo los campos con valor.
        await enviarJSON(URL_PROVEEDORES, 'POST', Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== null)));
      }
      // Renombrar: los modelos de la marca toman el nombre nuevo.
      if (formMarca.nombreOriginal && formMarca.nombreOriginal !== nombre && !sinPermisoModelos) {
        await enviarJSON(URL_MODELOS, 'POST', { accion: 'renombrar_fabricante', de: formMarca.nombreOriginal, a: nombre });
      }
      toast(formMarca.nombreOriginal ? 'Marca actualizada' : 'Marca agregada', 'success');
      setSeleccion(fabricanteCanonico(nombre).toLowerCase());
      setFormMarca(null);
      refrescar();
    } catch (err) {
      setErrorForm(msg(err, 'No se pudo guardar la marca'));
    } finally {
      setGuardando(false);
    }
  };

  const confirmarBorrarMarca = async () => {
    if (!borrarMarca || guardando) return;
    setGuardando(true);
    try {
      if (borrarMarca.proveedor) await enviarJSON(`${URL_PROVEEDORES}?id=${borrarMarca.proveedor.id}`, 'DELETE');
      if (borrarMarca.modelos.some((m) => m.activo) && !sinPermisoModelos) {
        await enviarJSON(URL_MODELOS, 'POST', { accion: 'activar_fabricante', fabricante: borrarMarca.nombre, activo: false });
      }
      toast('Marca desactivada', 'success');
      setBorrarMarca(null);
      setSeleccion(null);
      refrescar();
    } catch (err) {
      toast(msg(err, 'No se pudo desactivar la marca'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  // ── Modelos ─────────────────────────────────────────────
  const guardarModelo = async () => {
    if (!formModelo || !marca || guardando) return;
    if (!formModelo.modelo.trim()) return setErrorForm('El modelo es obligatorio');
    setGuardando(true);
    setErrorForm(null);
    try {
      const base = { fabricante: marca.nombre, modelo: formModelo.modelo.trim(), diseno: formModelo.diseno, torico: formModelo.torico, notas: formModelo.notas.trim() || null };
      if (formModelo.id) await enviarJSON(URL_MODELOS, 'PATCH', { id: formModelo.id, ...base, verificado: true });
      else await enviarJSON(URL_MODELOS, 'POST', base);
      toast(formModelo.id ? 'Modelo actualizado' : 'Modelo agregado', 'success');
      setFormModelo(null);
      refrescar();
    } catch (err) {
      setErrorForm(msg(err, 'No se pudo guardar el modelo'));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarModelo = async (m: ModeloLio, cambios: Partial<Pick<ModeloLio, 'activo' | 'verificado'>>, texto: string) => {
    try {
      await enviarJSON(URL_MODELOS, 'PATCH', { id: m.id, ...cambios });
      toast(texto, 'success');
      refrescar();
    } catch (err) {
      toast(msg(err, 'No se pudo actualizar'), 'error');
    }
  };

  // ── Herramientas del catálogo ───────────────────────────
  const traerDelInventario = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      const r = await enviarJSON<{ creadas: number }>(URL_MODELOS, 'POST', { accion: 'sembrar_inventario' });
      toast(r.creadas ? `${r.creadas} modelo(s) nuevo(s) desde el inventario (por verificar)` : 'No hay modelos nuevos en el inventario', 'success');
      refrescar();
    } catch (err) {
      toast(msg(err, 'No se pudo leer el inventario'), 'error');
    } finally {
      setGuardando(false);
    }
  };
  const leerCsv = async (file: File | undefined) => {
    if (!file) return;
    setImportacion(parsearCsvModelosLio(await file.text()));
    if (inputCsv.current) inputCsv.current.value = '';
  };
  const confirmarImportacion = async () => {
    if (!importacion?.filas.length || guardando) return;
    setGuardando(true);
    try {
      const r = await enviarJSON<{ creadas: number; omitidas: number }>(URL_MODELOS, 'POST', { filas: importacion.filas });
      toast(`${r.creadas} modelo(s) importado(s)${r.omitidas ? ` · ${r.omitidas} ya existían` : ''}`, 'success');
      setImportacion(null);
      refrescar();
    } catch (err) {
      toast(msg(err, 'No se pudo importar'), 'error');
    } finally {
      setGuardando(false);
    }
  };
  const descargarPlantilla = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([PLANTILLA_CSV_MODELOS_LIO], { type: 'text/csv;charset=utf-8' }));
    a.download = 'plantilla-modelos-lio.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cargando = (proveedoresQ.loading || modelosQ.loading) && marcas.length === 0;
  const btnSec = 'inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-bold text-fg-2 hover:bg-surface-2 disabled:opacity-50';

  return (
    <div className="space-y-4">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar marca o modelo…" className="input-field pl-9" aria-label="Buscar marca o modelo" />
        </div>
        {!sinPermisoModelos && (
          <>
            <button onClick={() => void traerDelInventario()} disabled={guardando} className={btnSec}>
              <Package className="h-3.5 w-3.5" /> Traer del inventario
            </button>
            <button onClick={descargarPlantilla} className={btnSec}><Download className="h-3.5 w-3.5" /> Plantilla CSV</button>
            <button onClick={() => inputCsv.current?.click()} className={btnSec}><Upload className="h-3.5 w-3.5" /> Importar CSV</button>
            <input ref={inputCsv} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void leerCsv(e.target.files?.[0])} />
          </>
        )}
        <button onClick={() => abrirMarca(null)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700">
          <Plus className="h-3.5 w-3.5" /> NUEVA MARCA
        </button>
      </div>

      {sinPermisoModelos && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Los modelos de lente solo los administra un administrador; aquí puedes ver y editar los datos de las marcas.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Lista de marcas */}
        <div className="relative rounded-xl border border-line bg-surface" aria-busy={proveedoresQ.validating || modelosQ.validating}>
          <BarraRevalidando activo={proveedoresQ.validating || modelosQ.validating} />
          <div className="border-b border-line px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted">
            {visibles.length} marca(s)
          </div>
          {cargando ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
          ) : visibles.length === 0 ? (
            <p className="p-4 text-sm text-muted">Sin marcas{termino ? ' que coincidan' : ''}. Usa «Nueva marca» para agregar una.</p>
          ) : (
            <ul className="max-h-[65vh] divide-y divide-line/60 overflow-y-auto">
              {visibles.map((m) => {
                const activos = m.modelos.filter((x) => x.activo);
                const pendientes = activos.filter((x) => !x.verificado).length;
                return (
                  <li key={m.clave}>
                    <button
                      onClick={() => setSeleccion(m.clave)}
                      className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors', marca?.clave === m.clave ? 'bg-primary-50/70 dark:bg-primary-500/10' : 'hover:bg-surface-2')}
                    >
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white', color(m.clave))}>{iniciales(m.nombre)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-fg">{m.nombre}</span>
                        <span className="block text-[11px] text-muted">
                          {activos.length} modelo(s){activos.some((x) => x.torico) ? ` · ${activos.filter((x) => x.torico).length} tórico(s)` : ''}
                          {pendientes ? <span className="text-amber-600 dark:text-amber-400"> · {pendientes} por verificar</span> : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detalle de la marca */}
        <div className="rounded-xl border border-line bg-surface">
          {!marca ? (
            <p className="p-6 text-sm text-muted">Selecciona una marca para ver sus modelos.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start gap-4 border-b border-line p-5">
                <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white', color(marca.clave))}>{iniciales(marca.nombre)}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="flex items-center gap-2 text-lg font-extrabold text-fg"><Tag className="h-4 w-4 text-primary-500" /> {marca.nombre}</h2>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
                    {marca.proveedor?.contacto && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5 text-muted" />{marca.proveedor.contacto}</span>}
                    {marca.proveedor?.telefono && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-muted" />{marca.proveedor.telefono}</span>}
                    {marca.proveedor?.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-muted" />{marca.proveedor.email}</span>}
                    {marca.proveedor?.direccion && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted" />{marca.proveedor.direccion}</span>}
                    {!marca.proveedor && <span className="text-muted">Sin datos de contacto · edita la marca para agregarlos</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => abrirMarca(marca)} className={btnSec}><Pencil className="h-3.5 w-3.5" /> Editar marca</button>
                  <button onClick={() => setBorrarMarca(marca)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10" aria-label={`Desactivar ${marca.nombre}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {!sinPermisoModelos && (
                <>
                  <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <h3 className="text-sm font-bold text-fg">Modelos de lente</h3>
                    <label className="inline-flex items-center gap-1.5 text-xs text-muted">
                      <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} className="h-3.5 w-3.5" /> Ver inactivos
                    </label>
                    <div className="flex-1" />
                    <button
                      onClick={() => { setErrorForm(null); setFormModelo({ modelo: '', diseno: 'MONOFOCAL', torico: false, notas: '' }); }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700"
                    >
                      <Plus className="h-3.5 w-3.5" /> Agregar modelo
                    </button>
                  </div>
                  {modelosDeMarca.length === 0 ? (
                    <p className="px-5 pb-5 text-sm text-muted">Esta marca no tiene modelos{verInactivos ? '' : ' activos'}.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-y border-line text-left text-[11px] uppercase tracking-wider text-muted">
                          <tr>
                            <th className="px-5 py-2">Modelo</th>
                            <th className="px-3 py-2">Diseño</th>
                            <th className="px-3 py-2">Tórico</th>
                            <th className="px-3 py-2">Estado</th>
                            <th className="px-5 py-2 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {modelosDeMarca.map((m) => (
                            <tr key={m.id} className={cn('border-b border-line/60 last:border-0', !m.activo && 'opacity-60')}>
                              <td className="px-5 py-2.5 font-medium text-fg">{m.modelo}</td>
                              <td className="px-3 py-2.5 text-fg-2">{etiquetaDiseno(m.diseno)}</td>
                              <td className="px-3 py-2.5 text-fg-2">{m.torico ? 'Sí' : 'No'}</td>
                              <td className="px-3 py-2.5">
                                {!m.activo ? (
                                  <span className="text-xs font-bold text-muted">Inactivo</span>
                                ) : m.verificado ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Verificado</span>
                                ) : (
                                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Por verificar · {ORIGEN[m.origen] || m.origen}</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-5 py-2.5 text-right">
                                {!m.verificado && m.activo && (
                                  <button onClick={() => void cambiarModelo(m, { verificado: true }, 'Marcado como verificado')} className="mr-3 text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-300">Verificar</button>
                                )}
                                <button
                                  onClick={() => { setErrorForm(null); setFormModelo({ id: m.id, modelo: m.modelo, diseno: m.diseno, torico: m.torico, notas: m.notas || '' }); }}
                                  className="mr-3 inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline"
                                  aria-label={`Editar ${m.modelo}`}
                                >
                                  <Pencil className="h-3 w-3" /> Editar
                                </button>
                                <button onClick={() => void cambiarModelo(m, { activo: !m.activo }, m.activo ? 'Modelo desactivado' : 'Modelo reactivado')} className="text-xs font-bold text-muted hover:underline">
                                  {m.activo ? 'Desactivar' : 'Reactivar'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="border-t border-line px-5 py-3 text-[11px] text-muted">
                    Verifica cada modelo con la ficha del fabricante o en{' '}
                    <a href={URL_IOLCON} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-600 hover:underline">IOLCon</a>{' '}
                    / <a href={URL_ESCRS_IOL} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-600 hover:underline">ESCRS</a> (solo consulta).
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal marca */}
      {formMarca && (
        <Modal isOpen onClose={() => setFormMarca(null)} maxWidth="max-w-md">
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-fg">{formMarca.nombreOriginal ? 'Editar marca' : 'Nueva marca'}</h3>
            <label className="block text-xs font-bold text-muted">Nombre de la marca *
              <input value={formMarca.nombre} onChange={(e) => setFormMarca({ ...formMarca, nombre: e.target.value })} maxLength={120} placeholder="Ej. Bausch + Lomb" className="input-field mt-1" autoFocus />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-muted">Contacto
                <input value={formMarca.contacto} onChange={(e) => setFormMarca({ ...formMarca, contacto: e.target.value })} maxLength={255} placeholder="Nombre del representante" className="input-field mt-1" />
              </label>
              <label className="block text-xs font-bold text-muted">Teléfono
                <input value={formMarca.telefono} onChange={(e) => setFormMarca({ ...formMarca, telefono: e.target.value })} maxLength={20} className="input-field mt-1" />
              </label>
            </div>
            <label className="block text-xs font-bold text-muted">Correo
              <input type="email" value={formMarca.email} onChange={(e) => setFormMarca({ ...formMarca, email: e.target.value })} className="input-field mt-1" />
            </label>
            <label className="block text-xs font-bold text-muted">Dirección
              <input value={formMarca.direccion} onChange={(e) => setFormMarca({ ...formMarca, direccion: e.target.value })} className="input-field mt-1" />
            </label>
            {formMarca.nombreOriginal && formMarca.nombre.trim() && formMarca.nombre.trim() !== formMarca.nombreOriginal && (
              <p className="text-[11px] text-muted">Al cambiar el nombre, todos los modelos de la marca toman el nombre nuevo.</p>
            )}
            {errorForm && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{errorForm}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setFormMarca(null)} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2">Cancelar</button>
              <button onClick={() => void guardarMarca()} disabled={guardando} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
                {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal modelo */}
      {formModelo && marca && (
        <Modal isOpen onClose={() => setFormModelo(null)} maxWidth="max-w-md">
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-fg">{formModelo.id ? 'Editar modelo' : 'Agregar modelo'} · {marca.nombre}</h3>
            <label className="block text-xs font-bold text-muted">Modelo *
              <input value={formModelo.modelo} onChange={(e) => setFormModelo({ ...formModelo, modelo: e.target.value })} maxLength={160} placeholder="Nombre y código del fabricante" className="input-field mt-1" autoFocus />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-muted">Diseño *
                <select value={formModelo.diseno} onChange={(e) => setFormModelo({ ...formModelo, diseno: e.target.value as DisenoLio })} className="input-field mt-1">
                  {DISENOS_LIO.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm font-medium text-fg">
                <input type="checkbox" checked={formModelo.torico} onChange={(e) => setFormModelo({ ...formModelo, torico: e.target.checked })} className="h-4 w-4" /> Tórico
              </label>
            </div>
            <label className="block text-xs font-bold text-muted">Notas
              <input value={formModelo.notas} onChange={(e) => setFormModelo({ ...formModelo, notas: e.target.value })} maxLength={500} placeholder="Opcional (p. ej. fuente consultada)" className="input-field mt-1" />
            </label>
            {errorForm && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{errorForm}</p>}
            <p className="text-[11px] text-muted">Al guardar desde aquí el modelo queda como verificado.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setFormModelo(null)} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2">Cancelar</button>
              <button onClick={() => void guardarModelo()} disabled={guardando} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
                {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Importación CSV */}
      {importacion && (
        <Modal isOpen onClose={() => setImportacion(null)} maxWidth="max-w-lg">
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-fg">Importar modelos de LIO</h3>
            <p className="text-sm text-fg-2">
              {importacion.filas.length} fila(s) válida(s){importacion.errores.length ? ` · ${importacion.errores.length} con error` : ''}. Cada fila va a la marca de su columna «fabricante»; quedan «Por verificar» y los repetidos se omiten.
            </p>
            {importacion.errores.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                {importacion.errores.slice(0, 50).map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setImportacion(null)} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2">Cancelar</button>
              <button onClick={() => void confirmarImportacion()} disabled={guardando || importacion.filas.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
                {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Importar {importacion.filas.length}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal
        isOpen={!!borrarMarca}
        onClose={() => setBorrarMarca(null)}
        onConfirm={() => void confirmarBorrarMarca()}
        title="Desactivar marca"
        message={borrarMarca ? `Se desactivarán «${borrarMarca.nombre}» y sus ${borrarMarca.modelos.filter((m) => m.activo).length} modelo(s) activos. Las cirugías e inventario que ya los usan no cambian. ¿Continuar?` : ''}
        confirmLabel="Desactivar"
        loading={guardando}
      />
    </div>
  );
}
