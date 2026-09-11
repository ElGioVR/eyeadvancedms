'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Search,
  X,
  ShieldCheck,
  Phone,
  MapPin,
  User,
  Trash2,
  Loader2,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFetch } from '@/hooks/useFetch';
import { useToast } from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';

interface AseguranzaAPI {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  contacto: string | null;
  porcentaje_cobertura: number | null;
  activo: boolean;
  created_at: string;
}

const cardColors = [
  'bg-primary-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-violet-500',
];

function getCardColor(id: string): string {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return cardColors[hash % cardColors.length];
}

export default function AseguranzasPage() {
  const { data: aseguranzas, loading, error, refetch } = useFetch<AseguranzaAPI>('/api/configuracion/aseguranzas');
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<AseguranzaAPI | null>(null);
  const [showNewItem, setShowNewItem] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [formNombre, setFormNombre] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formDireccion, setFormDireccion] = useState('');
  const [formContacto, setFormContacto] = useState('');
  const [formCobertura, setFormCobertura] = useState('');

  const filtered = useMemo(
    () =>
      aseguranzas.filter((a) =>
        a.nombre.toLowerCase().includes(search.toLowerCase()) ||
        (a.contacto && a.contacto.toLowerCase().includes(search.toLowerCase()))
      ),
    [aseguranzas, search]
  );

  const resetForm = useCallback(() => {
    setFormNombre('');
    setFormTelefono('');
    setFormDireccion('');
    setFormContacto('');
    setFormCobertura('');
  }, []);

  const handleNewItem = useCallback(() => {
    resetForm();
    setFormError(null);
    setShowNewItem(true);
  }, [resetForm]);

  const handleEditItem = useCallback((item: AseguranzaAPI) => {
    setFormNombre(item.nombre);
    setFormTelefono(item.telefono || '');
    setFormDireccion(item.direccion || '');
    setFormContacto(item.contacto || '');
    setFormCobertura(item.porcentaje_cobertura?.toString() || '');
    setFormError(null);
    setEditingItem(item);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setEditingItem(null);
    setShowNewItem(false);
    resetForm();
  }, [resetForm]);

  const handleCreate = useCallback(async () => {
    if (!formNombre.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/configuracion/aseguranzas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formNombre,
          telefono: formTelefono,
          direccion: formDireccion,
          contacto: formContacto,
          porcentaje_cobertura: formCobertura ? parseFloat(formCobertura) : 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Error al crear aseguranza');
        return;
      }
      handleCloseSidebar();
      toast('Aseguranza creada exitosamente');
      await refetch();
    } finally {
      setSaving(false);
    }
  }, [formNombre, formTelefono, formDireccion, formContacto, formCobertura, refetch, handleCloseSidebar, toast]);

  const handleUpdate = useCallback(async () => {
    if (!editingItem) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/configuracion/aseguranzas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingItem.id,
          nombre: formNombre,
          telefono: formTelefono,
          direccion: formDireccion,
          contacto: formContacto,
          porcentaje_cobertura: formCobertura ? parseFloat(formCobertura) : 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Error al actualizar aseguranza');
        return;
      }
      handleCloseSidebar();
      toast('Aseguranza actualizada exitosamente');
      await refetch();
    } finally {
      setSaving(false);
    }
  }, [editingItem, formNombre, formTelefono, formDireccion, formContacto, formCobertura, refetch, handleCloseSidebar, toast]);

  const handleDelete = useCallback(async (itemId: string) => {
    setDeleting(itemId);
    try {
      const res = await fetch(`/api/configuracion/aseguranzas?id=${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        toast('Aseguranza eliminada');
        await refetch();
      }
    } finally {
      setDeleting(null);
      setDeleteTarget(null);
    }
  }, [refetch, toast]);

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
              placeholder="Buscar aseguranza por nombre o contacto..."
              className="w-full pl-8 pr-4 py-2.5 bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <button
            onClick={handleNewItem}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            NUEVA ASEGURANZA
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {/* Cards */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-12 text-center">
            <ShieldCheck className="h-10 w-10 text-gray-300 dark:text-[#71767B] mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-[#71767B]">No se encontraron aseguranzas</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => {
              const cardColor = getCardColor(item.id);
              return (
                <div key={item.id} className="group overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                  <div className={cn('h-1.5 w-full', cardColor)} />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg text-white text-sm font-bold', cardColor)}>
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{item.nombre}</h3>
                          {item.activo === false && (
                            <span className="text-[10px] font-bold text-gray-400 dark:text-[#71767B] dark:text-[#71767B] uppercase">Inactiva</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditItem(item)}
                          className="text-gray-400 dark:text-[#71767B] dark:text-[#71767B] hover:text-primary-600 transition-colors p-1"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(item.id)}
                          disabled={deleting === item.id}
                          className="text-gray-400 dark:text-[#71767B] dark:text-[#71767B] hover:text-red-600 transition-colors p-1 disabled:opacity-50"
                        >
                          {deleting === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="space-y-2 text-xs text-gray-500 dark:text-[#71767B] border-t border-gray-100 dark:border-[#2F3336] pt-3">
                      {item.porcentaje_cobertura != null && item.porcentaje_cobertura > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-600">{item.porcentaje_cobertura}%</span>
                          <span>cobertura</span>
                        </div>
                      )}
                      {item.contacto && (
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-gray-400 dark:text-[#71767B] dark:text-[#71767B]" />
                          <span>{item.contacto}</span>
                        </div>
                      )}
                      {item.telefono && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-gray-400 dark:text-[#71767B] dark:text-[#71767B]" />
                          <span>{item.telefono}</span>
                        </div>
                      )}
                      {item.direccion && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-gray-400 dark:text-[#71767B] dark:text-[#71767B]" />
                          <span className="truncate">{item.direccion}</span>
                        </div>
                      )}
                      {!item.contacto && !item.telefono && !item.direccion && (
                        <p className="text-gray-300 dark:text-[#71767B] italic">Sin información de contacto</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sidebar — New or Edit */}
      {(editingItem || showNewItem) && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={handleCloseSidebar} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:rounded-xl lg:w-[380px] lg:shrink-0 w-full">
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm lg:sticky lg:top-6">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">
                  {editingItem ? 'Editar Aseguranza' : 'Nueva Aseguranza'}
                </h3>
                <button onClick={handleCloseSidebar} className="text-gray-400 dark:text-[#71767B] dark:text-[#71767B] hover:text-gray-600 dark:hover:text-[#E7E9EA] transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    placeholder="Ej. GNP, MetLife, AXA..."
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Persona de Contacto</label>
                  <input
                    type="text"
                    value={formContacto}
                    onChange={(e) => setFormContacto(e.target.value)}
                    placeholder="Nombre del representante"
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Teléfono</label>
                  <input
                    type="text"
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
                    placeholder="Ej. 664-111-2222"
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Dirección</label>
                  <input
                    type="text"
                    value={formDireccion}
                    onChange={(e) => setFormDireccion(e.target.value)}
                    placeholder="Dirección completa"
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">% Cobertura</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={formCobertura}
                    onChange={(e) => setFormCobertura(e.target.value)}
                    placeholder="Ej. 70.00"
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
                    className="flex-1 rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors"
                  >
                    CANCELAR
                  </button>
                  <button
                    onClick={editingItem ? handleUpdate : handleCreate}
                    disabled={saving || !formNombre.trim()}
                    className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</>
                    ) : editingItem ? 'GUARDAR CAMBIOS' : 'CREAR ASEGURANZA'}
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
        title="Eliminar Aseguranza"
        message="¿Eliminar esta aseguranza? Esta acción no se puede deshacer."
        confirmLabel="ELIMINAR"
        variant="danger"
        loading={!!deleting}
      />
    </div>
  );
}
