'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, Package, Pencil, Plus, Search, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFetch, useInvalidar } from '@/hooks/useFetch';
import { useDebounce } from '@/hooks/useDebounce';
import { enviarJSON } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import {
  DISENOS_LIO,
  PLANTILLA_CSV_MODELOS_LIO,
  parsearCsvModelosLio,
  type DisenoLio,
  type FilaModeloLio,
  type ModeloLio,
  URL_ESCRS_IOL,
  URL_IOLCON,
} from '@/lib/catalogos/modelos-lio';

const URL_ADMIN = '/api/configuracion/modelos-lio';
const msg = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const etiquetaDiseno = (d: string) => DISENOS_LIO.find((x) => x.value === d)?.label ?? d;
const ORIGEN: Record<string, string> = { MANUAL: 'Manual', INVENTARIO: 'Inventario', CSV: 'CSV' };

interface Formulario {
  id?: string;
  fabricante: string;
  modelo: string;
  diseno: DisenoLio;
  torico: boolean;
  notas: string;
}
const VACIO: Formulario = { fabricante: '', modelo: '', diseno: 'MONOFOCAL', torico: false, notas: '' };

export default function ModelosLioPage() {
  const { data: modelos, loading, validating, error } = useFetch<ModeloLio>(URL_ADMIN);
  const invalidar = useInvalidar();
  const { toast } = useToast();

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'pendientes' | 'inactivos'>('todos');
  const [form, setForm] = useState<Formulario | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [importacion, setImportacion] = useState<{ filas: FilaModeloLio[]; errores: string[] } | null>(null);
  const inputCsv = useRef<HTMLInputElement>(null);

  const termino = useDebounce(busqueda.trim().toLowerCase(), 200);
  const visibles = useMemo(
    () =>
      modelos.filter((m) => {
        if (filtro === 'pendientes' && (m.verificado || !m.activo)) return false;
        if (filtro === 'inactivos' && m.activo) return false;
        if (filtro === 'todos' && !m.activo) return false;
        return !termino || `${m.fabricante} ${m.modelo}`.toLowerCase().includes(termino);
      }),
    [modelos, filtro, termino]
  );
  const pendientes = modelos.filter((m) => m.activo && !m.verificado).length;

  const refrescar = () => void invalidar(URL_ADMIN, '/api/catalogos/modelos-lio');

  const guardar = async () => {
    if (!form || guardando) return;
    if (!form.fabricante.trim() || !form.modelo.trim()) return setErrorForm('Fabricante y modelo son obligatorios');
    setGuardando(true);
    setErrorForm(null);
    try {
      const base = { fabricante: form.fabricante.trim(), modelo: form.modelo.trim(), diseno: form.diseno, torico: form.torico, notas: form.notas.trim() || null };
      if (form.id) await enviarJSON(URL_ADMIN, 'PATCH', { id: form.id, ...base, verificado: true });
      else await enviarJSON(URL_ADMIN, 'POST', base);
      toast(form.id ? 'Modelo actualizado' : 'Modelo agregado', 'success');
      setForm(null);
      refrescar();
    } catch (err) {
      setErrorForm(msg(err, 'No se pudo guardar'));
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = async (m: ModeloLio, cambios: Partial<Pick<ModeloLio, 'activo' | 'verificado'>>, texto: string) => {
    try {
      await enviarJSON(URL_ADMIN, 'PATCH', { id: m.id, ...cambios });
      toast(texto, 'success');
      refrescar();
    } catch (err) {
      toast(msg(err, 'No se pudo actualizar'), 'error');
    }
  };

  const leerCsv = async (file: File | undefined) => {
    if (!file) return;
    const texto = await file.text();
    setImportacion(parsearCsvModelosLio(texto));
    if (inputCsv.current) inputCsv.current.value = '';
  };

  const confirmarImportacion = async () => {
    if (!importacion?.filas.length || guardando) return;
    setGuardando(true);
    try {
      const r = await enviarJSON<{ creadas: number; omitidas: number }>(URL_ADMIN, 'POST', { filas: importacion.filas });
      toast(`${r.creadas} modelo(s) importado(s)${r.omitidas ? ` · ${r.omitidas} ya existían` : ''}`, 'success');
      setImportacion(null);
      refrescar();
    } catch (err) {
      toast(msg(err, 'No se pudo importar'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const traerDelInventario = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      const r = await enviarJSON<{ creadas: number }>(URL_ADMIN, 'POST', { accion: 'sembrar_inventario' });
      toast(r.creadas ? `${r.creadas} modelo(s) nuevo(s) desde el inventario · revísalos en «Por verificar»` : 'No hay modelos nuevos en el inventario', 'success');
      if (r.creadas) setFiltro('pendientes');
      refrescar();
    } catch (err) {
      toast(msg(err, 'No se pudo leer el inventario'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const descargarPlantilla = () => {
    const blob = new Blob([PLANTILLA_CSV_MODELOS_LIO], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plantilla-modelos-lio.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface p-4 text-sm text-fg-2">
        <p className="font-bold text-fg">Catálogo de modelos de lente intraocular</p>
        <p className="mt-1 text-xs text-muted">
          Se usa en el formulario de cirugía para elegir el modelo según el tipo de LIO. Los modelos marcados «Por verificar»
          vienen del inventario o de un CSV: revisa fabricante, modelo, diseño y toricidad contra la ficha del fabricante o{' '}
          <a href={URL_IOLCON} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-600 hover:underline">IOLCon</a>{' '}
          (solo consulta; sus condiciones no permiten copiar la base completa). Para calcular o comparar lentes tóricos, usa la{' '}
          <a href={URL_ESCRS_IOL} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-600 hover:underline">calculadora de la ESCRS</a>.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar fabricante o modelo…" className="input-field pl-9" aria-label="Buscar modelo" />
        </div>
        <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Filtro">
          {([
            ['todos', 'Activos'],
            ['pendientes', `Por verificar${pendientes ? ` (${pendientes})` : ''}`],
            ['inactivos', 'Inactivos'],
          ] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFiltro(v)} className={cn('rounded-md px-3 py-1.5 text-xs font-bold', filtro === v ? 'bg-surface-2 text-fg' : 'text-muted')}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => void traerDelInventario()} disabled={guardando} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-bold text-fg-2 hover:bg-surface-2 disabled:opacity-50">
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />} Traer del inventario
        </button>
        <button onClick={descargarPlantilla} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-bold text-fg-2 hover:bg-surface-2">
          <Download className="h-3.5 w-3.5" /> Plantilla CSV
        </button>
        <button onClick={() => inputCsv.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-bold text-fg-2 hover:bg-surface-2">
          <Upload className="h-3.5 w-3.5" /> Importar CSV
        </button>
        <input ref={inputCsv} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void leerCsv(e.target.files?.[0])} />
        <button onClick={() => { setErrorForm(null); setForm({ ...VACIO }); }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700">
          <Plus className="h-3.5 w-3.5" /> Agregar modelo
        </button>
      </div>

      <div className="relative overflow-x-auto rounded-xl border border-line bg-surface" aria-busy={loading || validating}>
        <BarraRevalidando activo={validating} />
        {error ? (
          <p className="p-6 text-sm text-red-600">{msg(error, 'No se pudo cargar el catálogo')} (solo administradores).</p>
        ) : loading && modelos.length === 0 ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : visibles.length === 0 ? (
          <div className="p-6 text-sm text-muted">
            <p>Sin modelos en esta vista.</p>
            {modelos.length === 0 && (
              <p className="mt-1 text-xs">
                Usa «Traer del inventario» para cargar los LIO que ya tienen registrados, o agrega e importa modelos manualmente.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2.5">Fabricante</th>
                <th className="px-4 py-2.5">Modelo</th>
                <th className="px-4 py-2.5">Diseño</th>
                <th className="px-4 py-2.5">Tórico</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((m) => (
                <tr key={m.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-fg">{m.fabricante}</td>
                  <td className="px-4 py-2.5 text-fg-2">{m.modelo}</td>
                  <td className="px-4 py-2.5 text-fg-2">{etiquetaDiseno(m.diseno)}</td>
                  <td className="px-4 py-2.5 text-fg-2">{m.torico ? 'Sí' : 'No'}</td>
                  <td className="px-4 py-2.5">
                    {m.verificado ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Verificado</span>
                    ) : (
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Por verificar · {ORIGEN[m.origen] || m.origen}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    {!m.verificado && m.activo && (
                      <button onClick={() => void cambiar(m, { verificado: true }, 'Marcado como verificado')} className="mr-2 text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-300">Verificar</button>
                    )}
                    <button onClick={() => { setErrorForm(null); setForm({ id: m.id, fabricante: m.fabricante, modelo: m.modelo, diseno: m.diseno, torico: m.torico, notas: m.notas || '' }); }} className="mr-2 inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline" aria-label={`Editar ${m.modelo}`}>
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                    <button onClick={() => void cambiar(m, { activo: !m.activo }, m.activo ? 'Modelo desactivado' : 'Modelo reactivado')} className="text-xs font-bold text-muted hover:underline">
                      {m.activo ? 'Desactivar' : 'Reactivar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {form && (
        <Modal isOpen onClose={() => setForm(null)} maxWidth="max-w-md">
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-fg">{form.id ? 'Editar modelo' : 'Agregar modelo'}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-muted">Fabricante *
                <input value={form.fabricante} onChange={(e) => setForm({ ...form, fabricante: e.target.value })} maxLength={120} placeholder="Ej. Alcon" className="input-field mt-1" />
              </label>
              <label className="block text-xs font-bold text-muted">Modelo *
                <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} maxLength={160} placeholder="Nombre y código del fabricante" className="input-field mt-1" />
              </label>
              <label className="block text-xs font-bold text-muted">Diseño *
                <select value={form.diseno} onChange={(e) => setForm({ ...form, diseno: e.target.value as DisenoLio })} className="input-field mt-1">
                  {DISENOS_LIO.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm font-medium text-fg">
                <input type="checkbox" checked={form.torico} onChange={(e) => setForm({ ...form, torico: e.target.checked })} className="h-4 w-4" /> Tórico
              </label>
            </div>
            <label className="block text-xs font-bold text-muted">Notas
              <input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} maxLength={500} placeholder="Opcional (p. ej. fuente consultada)" className="input-field mt-1" />
            </label>
            {errorForm && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{errorForm}</p>}
            <p className="text-[11px] text-muted">Al guardar desde aquí el modelo queda como verificado.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2">Cancelar</button>
              <button onClick={() => void guardar()} disabled={guardando} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
                {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {importacion && (
        <Modal isOpen onClose={() => setImportacion(null)} maxWidth="max-w-lg">
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-fg">Importar modelos de LIO</h3>
            <p className="text-sm text-fg-2">
              {importacion.filas.length} fila(s) válida(s){importacion.errores.length ? ` · ${importacion.errores.length} con error` : ''}. Los importados quedan «Por verificar»; los que ya existen se omiten.
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
    </div>
  );
}
