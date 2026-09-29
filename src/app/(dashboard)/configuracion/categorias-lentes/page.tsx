'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Search,
  X,
  Package,
  Trash2,
  Loader2,
  Pencil,
} from 'lucide-react';
import ClientDate from '@/components/ui/ClientDate';
import { cn } from '@/lib/utils';
import { useFetch, useInvalidar } from '@/hooks/useFetch';
import { useDebounce } from '@/hooks/useDebounce';
import { enviarJSON } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import ConfirmModal from '@/components/ui/ConfirmModal';

interface CategoriaAPI {
  id: string;
  nombre: string;
  descripcion: string | null;
  created_at: string;
}

const iconColors = [
  'bg-primary-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-violet-500',
];

const comoLista = (actual: unknown): CategoriaAPI[] => (Array.isArray(actual) ? (actual as CategoriaAPI[]) : []);
const msg = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

function getIconColor(id: string): string {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return iconColors[hash % iconColors.length];
}

export default function CategoriasLentesPage() {
  const { data: categorias, loading, validating, error, mutate } = useFetch<CategoriaAPI>('/api/configuracion/categorias-lentes');
  const invalidar = useInvalidar();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<CategoriaAPI | null>(null);
  const [showNewItem, setShowNewItem] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [formNombre, setFormNombre] = useState('');
  const [formDescripcion, setFormDescripcion] = useState('');

  const debouncedSearch = useDebounce(search);
  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return categorias.filter((c) =>
      (c.nombre || '').toLowerCase().includes(term) ||
      (c.descripcion && c.descripcion.toLowerCase().includes(term))
    );
  }, [categorias, debouncedSearch]);

  const resetForm = useCallback(() => {
    setFormNombre('');
    setFormDescripcion('');
  }, []);

  const handleNewItem = useCallback(() => {
    resetForm();
    setFormError(null);
    setShowNewItem(true);
  }, [resetForm]);

  const handleEditItem = useCallback((item: CategoriaAPI) => {
    setFormNombre(item.nombre);
    setFormDescripcion(item.descripcion || '');
    setFormError(null);
    setEditingItem(item);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setEditingItem(null);
    setShowNewItem(false);
    resetForm();
  }, [resetForm]);

  /** Validación local (el servidor sigue siendo la autoridad). */
  const validar = useCallback((): string | null => {
    if (!formNombre.trim()) return 'El nombre es obligatorio';
    if (formNombre.trim().length > 255) return 'El nombre no puede exceder 255 caracteres';
    if (formDescripcion.length > 2000) return 'La descripción es demasiado larga';
    return null;
  }, [formNombre, formDescripcion]);

  const handleCreate = useCallback(async () => {
    if (saving) return;
    const invalido = validar();
    if (invalido) { setFormError(invalido); return; }
    setSaving(true);
    setFormError(null);
    try {
      const body = { nombre: formNombre.trim(), descripcion: formDescripcion.trim() };
      await mutate(
        async (actual: unknown) => {
          const nueva = await enviarJSON<CategoriaAPI>('/api/configuracion/categorias-lentes', 'POST', body);
          return nueva?.id ? [...comoLista(actual), nueva] : comoLista(actual);
        },
        { populateCache: true, revalidate: true }
      );
      handleCloseSidebar();
      toast('Categoría creada exitosamente');
    } catch (err) {
      setFormError(msg(err, 'Error al crear categoría'));
    } finally {
      setSaving(false);
    }
  }, [saving, validar, formNombre, formDescripcion, mutate, handleCloseSidebar, toast]);

  const handleUpdate = useCallback(async () => {
    if (!editingItem || saving) return;
    const invalido = validar();
    if (invalido) { setFormError(invalido); return; }
    setSaving(true);
    setFormError(null);
    const id = editingItem.id;
    const body = { nombre: formNombre.trim(), descripcion: formDescripcion.trim() };
    const aplicar = (actual: unknown) =>
      comoLista(actual).map((c) => (c.id === id ? { ...c, ...body, descripcion: body.descripcion || null } : c));
    try {
      await mutate(
        async (actual: unknown) => {
          await enviarJSON('/api/configuracion/categorias-lentes', 'PATCH', { id, ...body });
          return aplicar(actual);
        },
        { optimisticData: aplicar, rollbackOnError: true, populateCache: true, revalidate: true }
      );
      handleCloseSidebar();
      toast('Categoría actualizada exitosamente');
      // El nombre de la categoría se muestra en las fichas de inventario.
      invalidar('/api/inventario');
    } catch (err) {
      setFormError(msg(err, 'Error al actualizar categoría'));
    } finally {
      setSaving(false);
    }
  }, [editingItem, saving, validar, formNombre, formDescripcion, mutate, invalidar, handleCloseSidebar, toast]);

  const handleDelete = useCallback(async (itemId: string) => {
    const quitar = (actual: unknown) => comoLista(actual).filter((c) => c.id !== itemId);
    setDeleting(itemId);
    try {
      await mutate(
        async (actual: unknown) => {
          await enviarJSON(`/api/configuracion/categorias-lentes?id=${encodeURIComponent(itemId)}`, 'DELETE');
          return quitar(actual);
        },
        { optimisticData: quitar, rollbackOnError: true, populateCache: true, revalidate: true }
      );
      toast('Categoría eliminada');
      if (editingItem?.id === itemId) handleCloseSidebar();
    } catch (err) {
      toast(msg(err, 'No se pudo eliminar la categoría'), 'error');
    } finally {
      setDeleting(null);
      setDeleteTarget(null);
    }
  }, [mutate, toast, editingItem, handleCloseSidebar]);

  const cargandoInicial = loading && categorias.length === 0;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="mb-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar categoría por nombre o descripción..."
              className="w-full pl-8 pr-4 py-2.5 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <button
            onClick={handleNewItem}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            NUEVA CATEGORÍA
          </button>
        </div>

        {/* Error */}
        {error && categorias.length === 0 && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {/* Table */}
        {cargandoInicial ? (
          <div className="rounded-2xl border border-line bg-surface p-6 space-y-3" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-4">
                <div className="h-9 w-9 rounded-lg bg-gray-200 dark:bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-surface-2 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 dark:bg-surface-2 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none animate-fadeIn" aria-busy={validating}>
            <BarraRevalidando activo={validating} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="border-b border-line/70 bg-gray-50 dark:bg-surface-2/50 dark:bg-surface-2/50">
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted dark:text-muted">Categoría</th>
                    <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted dark:text-muted">Descripción</th>
                    <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted dark:text-muted">Creada</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted dark:text-muted">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60 anim-lista">
                  {filtered.map((cat) => {
                    const iconColor = getIconColor(cat.id);
                    return (
                      <tr key={cat.id} className="group transition-colors hover:bg-gray-50 dark:bg-surface-2/60 dark:hover:bg-surface-2/60">
                        <td className="px-4 sm:px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white', iconColor)}>
                              <Package className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-bold text-fg">{cat.nombre}</span>
                          </div>
                        </td>
                        <td className="hidden sm:table-cell px-6 py-4 text-sm text-muted max-w-xs truncate">
                          {cat.descripcion || <span className="text-gray-300 dark:text-muted italic">Sin descripción</span>}
                        </td>
                        <td className="hidden md:table-cell px-6 py-4 text-sm text-muted">
                           <ClientDate date={cat.created_at} options={{ day: '2-digit', month: 'short', year: 'numeric' }} />
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditItem(cat)}
                              aria-label={`Editar ${cat.nombre}`}
                              className="text-muted dark:text-muted hover:text-primary-600 transition-colors"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(cat.id)}
                              disabled={deleting === cat.id}
                              aria-label={`Eliminar ${cat.nombre}`}
                              className="text-muted dark:text-muted hover:text-red-600 transition-colors disabled:opacity-50"
                            >
                              {deleting === cat.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 sm:px-6 py-12 text-center">
                        <Package className="h-10 w-10 text-gray-300 dark:text-muted mx-auto mb-3" />
                        <p className="text-sm font-medium text-muted">No se encontraron categorías</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line/70 bg-gray-50 dark:bg-surface-2/30 dark:bg-surface-2/30 px-4 sm:px-6 py-3">
              <span className="text-sm text-muted dark:text-muted">{filtered.length} categorías</span>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar — New or Edit */}
      {(editingItem || showNewItem) && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden animate-fadeIn" onClick={handleCloseSidebar} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl animate-fadeIn lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:rounded-xl lg:w-[380px] lg:shrink-0 w-full">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none lg:sticky lg:top-6">
              <div className="flex items-center justify-between border-b border-line/70 px-6 py-4">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">
                  {editingItem ? 'Editar Categoría' : 'Nueva Categoría'}
                </h3>
                <button onClick={handleCloseSidebar} aria-label="Cerrar" className="text-muted dark:text-muted hover:text-gray-600 dark:hover:text-fg transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    placeholder="Ej. Lentes Monofocales, Lentes Bifocales..."
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Descripción</label>
                  <textarea
                    value={formDescripcion}
                    onChange={(e) => setFormDescripcion(e.target.value)}
                    placeholder="Descripción de la categoría..."
                    rows={3}
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
                  />
                </div>
                {formError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {formError}
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleCloseSidebar}
                    className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors"
                  >
                    CANCELAR
                  </button>
                  <button
                    onClick={editingItem ? handleUpdate : handleCreate}
                    disabled={saving || !formNombre.trim()}
                    className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
                    ) : editingItem ? 'GUARDAR CAMBIOS' : 'CREAR CATEGORÍA'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Eliminar Categoría"
        message="¿Eliminar esta categoría? Esta acción no se puede deshacer."
        confirmLabel="ELIMINAR"
        variant="danger"
        loading={!!deleting}
      />
    </div>
  );
}
