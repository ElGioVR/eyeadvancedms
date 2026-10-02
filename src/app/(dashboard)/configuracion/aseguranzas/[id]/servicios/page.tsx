'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Search, X, Loader2, ShieldCheck, Upload, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { useFetch } from '@/hooks/useFetch';
import { useDebounce } from '@/hooks/useDebounce';
import { enviarJSON } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import { SkeletonTabla } from '@/components/ui/Skeleton';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';

interface ServicioAPI {
  id: string;
  aseguranza_id: string;
  tipo: 'ESTUDIO' | 'PROCEDIMIENTO' | 'CONSULTA';
  nombre: string;
  costo: number;
  porcentaje_cobertura: number;
  activo: boolean;
  aseguranzas: { nombre: string };
}

interface AseguranzaAPI {
  id: string;
  nombre: string;
}

interface ServiciosResp {
  data?: ServicioAPI[];
}

const msg = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

const TIPOS = ['Todos', 'ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA'] as const;

const tipoBadge: Record<string, string> = {
  ESTUDIO: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PROCEDIMIENTO: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  CONSULTA: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

export default function ServiciosPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  // Servicios (respuesta { data }) y nombre de la aseguranza (lista compartida/precargada).
  const serviciosKey = id ? `/api/configuracion/aseguranzas/servicios?aseguranza_id=${encodeURIComponent(id)}` : null;
  const {
    data: serviciosResp,
    error: serviciosError,
    isLoading: serviciosLoading,
    isValidating: serviciosValidating,
    mutate: mutateServicios,
  } = useSWR<ServiciosResp>(serviciosKey);
  const servicios = useMemo(() => serviciosResp?.data ?? [], [serviciosResp]);
  const loading = serviciosLoading && !serviciosResp;
  const error = serviciosError ? msg(serviciosError, 'Error al cargar datos') : null;
  const { data: aseguranzas } = useFetch<AseguranzaAPI>('/api/configuracion/aseguranzas');
  const insuranceName = useMemo(() => aseguranzas.find((a) => a.id === id)?.nombre ?? '', [aseguranzas, id]);

  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('Todos');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCosto, setEditCosto] = useState('');
  const [editCobertura, setEditCobertura] = useState('');
  const [editNombre, setEditNombre] = useState('');
  const [editTipo, setEditTipo] = useState<ServicioAPI['tipo']>('ESTUDIO');
  const [savingId, setSavingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // El input se limpia al elegir archivo (para poder re-elegir el mismo): se guarda aquí para confirmar.
  const archivoRef = useRef<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    validos: number;
    duplicados: number;
    errores: number;
    total: number;
    rows: Array<{ nombre: string; tipo: string; costo: number; porcentaje_cobertura: number; errores: string[]; duplicado: boolean }>;
  } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importModo, setImportModo] = useState<'agregar' | 'reemplazar'>('agregar');

  // Plantilla CSV con las columnas permitidas y filas de ejemplo
  const handleDescargarPlantilla = useCallback(() => {
    const bom = '\uFEFF';
    const csv = [
      'nombre,tipo,costo,porcentaje_cobertura',
      'Calculo de Lente Intraocular,ESTUDIO,350,40',
      'Consulta Primera Vez,CONSULTA,300,50',
      'Facoemulsificacion Por Ojo,PROCEDIMIENTO,12000,80',
    ].join('\n');
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-servicios-aseguranza.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { Todos: servicios.length, ESTUDIO: 0, PROCEDIMIENTO: 0, CONSULTA: 0 };
    servicios.forEach((s) => { c[s.tipo] = (c[s.tipo] || 0) + 1; });
    return c;
  }, [servicios]);

  const debouncedSearch = useDebounce(search);
  const filtered = useMemo(() => {
    let list = servicios;
    if (filterTipo !== 'Todos') list = list.filter((s) => s.tipo === filterTipo);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((s) => (s.nombre || '').toLowerCase().includes(q));
    }
    return list;
  }, [servicios, filterTipo, debouncedSearch]);

  const startEdit = useCallback((s: ServicioAPI) => {
    setEditingId(s.id);
    setEditNombre(s.nombre);
    setEditTipo(s.tipo);
    setEditCosto(s.costo.toString());
    setEditCobertura(s.porcentaje_cobertura.toString());
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditNombre('');
    setEditCosto('');
    setEditCobertura('');
  }, []);

  const saveEdit = useCallback(async (servId: string) => {
    if (savingId) return;
    const costo = editCosto.trim() === '' ? 0 : Number(editCosto);
    const cobertura = editCobertura.trim() === '' ? 0 : Number(editCobertura);
    const nombre = editNombre.trim().replace(/\s+/g, ' ');
    if (!nombre) { toast('El nombre no puede quedar vacío', 'error'); return; }
    if (!Number.isFinite(costo) || costo < 0) { toast('El costo debe ser un número mayor o igual a 0', 'error'); return; }
    if (!Number.isFinite(cobertura) || cobertura < 0 || cobertura > 100) { toast('La cobertura debe estar entre 0 y 100', 'error'); return; }
    const aplicar = (actual: ServiciosResp | undefined): ServiciosResp => ({
      ...(actual ?? {}),
      data: (actual?.data ?? []).map((s) => (s.id === servId ? { ...s, nombre, tipo: editTipo, costo, porcentaje_cobertura: cobertura } : s)),
    });
    setSavingId(servId);
    try {
      await mutateServicios(
        async (actual) => {
          await enviarJSON('/api/configuracion/aseguranzas/servicios', 'PATCH', { id: servId, nombre, tipo: editTipo, costo, porcentaje_cobertura: cobertura });
          return aplicar(actual);
        },
        { optimisticData: aplicar, rollbackOnError: true, populateCache: true, revalidate: false }
      );
      toast('Servicio actualizado');
      cancelEdit();
    } catch (err) {
      toast(msg(err, 'Error al guardar'), 'error');
    } finally {
      setSavingId(null);
    }
  }, [savingId, editNombre, editTipo, editCosto, editCobertura, toast, cancelEdit, mutateServicios]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, servId: string) => {
    if (e.key === 'Enter') saveEdit(servId);
    if (e.key === 'Escape') cancelEdit();
  }, [saveEdit, cancelEdit]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    archivoRef.current = file;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('aseguranza_id', id);

      const res = await fetch('/api/configuracion/aseguranzas/servicios/import', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error || 'Error al procesar archivo', 'error');
        return;
      }
      const data = await res.json();
      setImportPreview(data);
      setShowImportModal(true);
    } catch {
      toast('Error de red', 'error');
    } finally {
      setImporting(false);
    }
  }, [id, toast]);

  const handleConfirmImport = useCallback(async () => {
    if (importing) return;
    const file = archivoRef.current;
    if (!file) {
      toast('Vuelve a seleccionar el archivo', 'error');
      return;
    }
    setImporting(true);
    try {

      const formData = new FormData();
      formData.append('file', file);
      formData.append('aseguranza_id', id);
      formData.append('confirm', 'true');
      formData.append('modo', importModo);

      const res = await fetch('/api/configuracion/aseguranzas/servicios/import', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error || 'Error al importar', 'error');
        return;
      }
      const data = await res.json();
      if (importModo === 'reemplazar') {
        toast(`Matriz reemplazada: ${data.insertados ?? 0} servicios cargados${data.errores ? ` · ${data.errores} con error` : ''}`);
      } else {
        toast(`Servicios importados: ${data.insertados ?? 0} nuevos${data.omitidos ? ` · ${data.omitidos} duplicados omitidos` : ''}`);
      }
      setShowImportModal(false);
      setImportPreview(null);
      archivoRef.current = null;
      // Revalida la matriz en segundo plano (la tabla actual se mantiene hasta que llega).
      mutateServicios();
    } catch {
      toast('Error de red', 'error');
    } finally {
      setImporting(false);
    }
  }, [id, toast, importModo, importing, mutateServicios]);

  const handleCloseImportModal = useCallback(() => {
    setShowImportModal(false);
    setImportPreview(null);
    archivoRef.current = null;
  }, []);

  return (
    <div>
      <PageHeader
        title="Matriz de Consultas"
        subtitle={insuranceName ? `Servicios de ${insuranceName}` : 'Cargando...'}
        backLink={{ href: '/configuracion/aseguranzas', label: 'Aseguranzas' }}
        action={
          insuranceName ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 px-3 py-1.5 text-xs font-bold text-primary-700 dark:text-primary-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                {insuranceName}
              </span>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".xlsx,.csv"
                onChange={handleFileSelect}
              />
              <button
                onClick={handleDescargarPlantilla}
                disabled={importing}
                title="Descargar plantilla CSV con el formato permitido"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-fg-2 hover:bg-surface-2 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Plantilla
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {importing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Importar
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar servicio por nombre..."
            className="w-full pl-8 pr-4 py-2.5 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 text-fg"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {TIPOS.map((t) => (
            <button
              key={t}
              onClick={() => setFilterTipo(t)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                filterTipo === t
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-2 text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-surface-3'
              )}
            >
              {t} ({counts[t] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {error && !serviciosResp && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div aria-busy="true">
          <SkeletonTabla filas={6} columnas={5} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-12 text-center animate-fadeIn">
          <ShieldCheck className="h-10 w-10 text-gray-300 dark:text-muted mx-auto mb-3" />
          <p className="text-sm font-medium text-muted">No se encontraron servicios</p>
        </div>
      ) : (
        <div className="relative rounded-2xl border border-line bg-surface overflow-hidden animate-fadeIn" aria-busy={serviciosValidating}>
          <BarraRevalidando activo={serviciosValidating} />
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/70">
                  <th className="text-left px-5 py-3 text-xs font-bold text-muted uppercase tracking-wider">Nombre</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-muted uppercase tracking-wider">Tipo</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-muted uppercase tracking-wider">Costo ($)</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-muted uppercase tracking-wider">% Cobertura</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-muted uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="anim-lista">
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 dark:border-line last:border-0 hover:bg-surface-2 transition-colors">
                    <td className="px-5 py-3 font-medium text-fg">
                      {editingId === s.id ? (
                        <input
                          type="text"
                          value={editNombre}
                          onChange={(e) => setEditNombre(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, s.id)}
                          autoFocus
                          maxLength={500}
                          aria-label="Nombre del servicio"
                          className="w-full rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      ) : s.nombre}
                    </td>
                    <td className="px-5 py-3">
                      {editingId === s.id ? (
                        <select
                          value={editTipo}
                          onChange={(e) => setEditTipo(e.target.value as ServicioAPI['tipo'])}
                          onKeyDown={(e) => handleKeyDown(e, s.id)}
                          aria-label="Tipo de servicio"
                          className="rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        >
                          {TIPOS.filter((t) => t !== 'Todos').map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={cn('inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase', tipoBadge[s.tipo])}>
                          {s.tipo}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {editingId === s.id ? (
                        <input
                          type="number"
                          value={editCosto}
                          onChange={(e) => setEditCosto(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, s.id)}
                          className="w-24 text-right rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      ) : (
                        <span className="text-fg-2 font-mono">${s.costo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {editingId === s.id ? (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={editCobertura}
                          onChange={(e) => setEditCobertura(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, s.id)}
                          className="w-20 text-right rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      ) : (
                        <span className="font-mono text-fg-2">{s.porcentaje_cobertura}%</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {editingId === s.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          {savingId === s.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-500" />}
                          <button
                            onClick={() => saveEdit(s.id)}
                            disabled={savingId === s.id}
                            className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:text-primary-700 disabled:opacity-50"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={savingId === s.id}
                            aria-label="Cancelar edición"
                            className="text-xs font-bold text-muted hover:text-gray-600 dark:hover:text-fg disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(s)}
                          className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:text-primary-700"
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-line/70">
            {filtered.map((s) => (
              <div key={s.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-fg break-words">{s.nombre}</p>
                  <span className={cn('shrink-0 inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase', tipoBadge[s.tipo])}>
                    {s.tipo}
                  </span>
                </div>
                {editingId === s.id ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-muted w-20">Nombre</label>
                      <input
                        type="text"
                        value={editNombre}
                        onChange={(e) => setEditNombre(e.target.value)}
                        maxLength={500}
                        className="flex-1 min-w-0 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-muted w-20">Tipo</label>
                      <select
                          value={editTipo}
                          onChange={(e) => setEditTipo(e.target.value as ServicioAPI['tipo'])}
                          onKeyDown={(e) => handleKeyDown(e, s.id)}
                          aria-label="Tipo de servicio"
                          className="flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        >
                          {TIPOS.filter((t) => t !== 'Todos').map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-muted w-20">Costo ($)</label>
                      <input
                        type="number"
                        value={editCosto}
                        onChange={(e) => setEditCosto(e.target.value)}
                        className="flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-muted w-20">% Cobertura</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={editCobertura}
                        onChange={(e) => setEditCobertura(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, s.id)}
                        className="flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      {savingId === s.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-500" />}
                      <button
                        onClick={() => saveEdit(s.id)}
                        disabled={savingId === s.id}
                        className="flex-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        GUARDAR
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={savingId === s.id}
                        className="rounded-md border border-line px-3 py-1.5 text-xs font-bold text-fg-2 hover:bg-surface-2 disabled:opacity-50"
                      >
                        CANCELAR
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span className="font-mono">${s.costo.toLocaleString('es-MX', { minimumFractionDigits: 2 })} &middot; {s.porcentaje_cobertura}% cobertura</span>
                    <button
                      onClick={() => startEdit(s)}
                      className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:text-primary-700"
                    >
                      Editar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={showImportModal} onClose={handleCloseImportModal}>
        <h3 className="text-lg font-bold text-fg mb-4">Confirmar importación</h3>
        {importPreview && (
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-3 text-center">
                <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{importPreview.validos}</p>
                <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Nuevos</p>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 p-3 text-center">
                <p className="text-lg font-extrabold text-amber-600 dark:text-amber-400">{importPreview.duplicados}</p>
                <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">Duplicados</p>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-500/10 p-3 text-center">
                <p className="text-lg font-extrabold text-red-600 dark:text-red-400">{importPreview.errores}</p>
                <p className="text-[10px] font-bold uppercase text-red-700 dark:text-red-400">Con error</p>
              </div>
            </div>

            {/* Modo de importación */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Modo de importación</p>
              <label className={cn(
                'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                importModo === 'agregar' ? 'border-primary-400 bg-primary-50/50 dark:border-primary-500/40 dark:bg-primary-500/5' : 'border-line hover:bg-surface-2'
              )}>
                <input type="radio" name="modo-import" checked={importModo === 'agregar'} onChange={() => setImportModo('agregar')} className="mt-0.5 h-4 w-4 text-primary-600" />
                <span>
                  <span className="block text-sm font-bold text-fg">Agregar</span>
                  <span className="block text-xs text-muted">Los duplicados se omiten, no se tocan los existentes.</span>
                </span>
              </label>
              <label className={cn(
                'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                importModo === 'reemplazar' ? 'border-red-400 bg-red-50/50 dark:border-red-500/40 dark:bg-red-500/5' : 'border-line hover:bg-surface-2'
              )}>
                <input type="radio" name="modo-import" checked={importModo === 'reemplazar'} onChange={() => setImportModo('reemplazar')} className="mt-0.5 h-4 w-4 text-red-600" />
                <span>
                  <span className="block text-sm font-bold text-fg">Limpiar todo y volver a cargar</span>
                  <span className="block text-xs text-red-600 dark:text-red-400">Elimina TODOS los servicios actuales de esta aseguranza y carga solo los del archivo.</span>
                </span>
              </label>
            </div>

            {/* Detalle de filas con problema */}
            {importPreview.rows.length > 0 && importPreview.rows.some((r) => r.duplicado || r.errores.length > 0) && (
              <div className="rounded-lg border border-line overflow-hidden">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted px-3 py-2 bg-surface-2">
                  Detalle ({importPreview.rows.filter((r) => r.duplicado || r.errores.length > 0).length})
                </p>
                <div className="max-h-40 overflow-y-auto divide-y divide-line/60">
                  {importPreview.rows.filter((r) => r.duplicado || r.errores.length > 0).slice(0, 50).map((r, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold',
                          r.errores.length > 0 ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                        )}>
                          {r.errores.length > 0 ? 'Error' : 'Duplicado'}
                        </span>
                        <span className="font-medium text-fg truncate">{r.nombre}</span>
                      </div>
                      {r.errores.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">{r.errores.join('; ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handleCloseImportModal}
            className="rounded-lg border border-line px-4 py-2 text-xs font-bold text-fg-2 hover:bg-surface-2"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmImport}
            disabled={importing || !importPreview || (importModo === 'agregar' && (importPreview?.validos ?? 0) - (importPreview?.duplicados ?? 0) <= 0)}
            className={cn(
              'rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50',
              importModo === 'reemplazar' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'
            )}
          >
            {importing ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importando…</span> : importModo === 'reemplazar' ? 'Limpiar y cargar' : 'Confirmar importación'}
          </button>
        </div>
      </Modal>
    </div>
  );
}