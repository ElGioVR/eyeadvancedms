'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Search, X, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
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

const TIPOS = ['Todos', 'ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA'] as const;

const tipoBadge: Record<string, string> = {
  ESTUDIO: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PROCEDIMIENTO: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  CONSULTA: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

export default function ServiciosPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [servicios, setServicios] = useState<ServicioAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insuranceName, setInsuranceName] = useState('');
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('Todos');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCosto, setEditCosto] = useState('');
  const [editCobertura, setEditCobertura] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{ validos: number; duplicados: number; errores: number } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [servRes, segRes] = await Promise.all([
          fetch(`/api/configuracion/aseguranzas/servicios?aseguranza_id=${id}`),
          fetch('/api/configuracion/aseguranzas'),
        ]);
        if (servRes.ok) {
          const servJson = await servRes.json();
          setServicios(Array.isArray(servJson) ? servJson : servJson.data ?? []);
        }
        if (segRes.ok) {
          const segJson = await segRes.json();
          const list: AseguranzaAPI[] = Array.isArray(segJson) ? segJson : segJson.data ?? [];
          const match = list.find((s) => s.id === id);
          if (match) setInsuranceName(match.nombre);
        }
      } catch {
        setError('Error al cargar datos');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { Todos: servicios.length, ESTUDIO: 0, PROCEDIMIENTO: 0, CONSULTA: 0 };
    servicios.forEach((s) => { c[s.tipo] = (c[s.tipo] || 0) + 1; });
    return c;
  }, [servicios]);

  const filtered = useMemo(() => {
    let list = servicios;
    if (filterTipo !== 'Todos') list = list.filter((s) => s.tipo === filterTipo);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.nombre.toLowerCase().includes(q));
    }
    return list;
  }, [servicios, filterTipo, search]);

  const startEdit = useCallback((s: ServicioAPI) => {
    setEditingId(s.id);
    setEditCosto(s.costo.toString());
    setEditCobertura(s.porcentaje_cobertura.toString());
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditCosto('');
    setEditCobertura('');
  }, []);

  const saveEdit = useCallback(async (servId: string) => {
    setSavingId(servId);
    try {
      const costo = parseFloat(editCosto) || 0;
      const cobertura = parseFloat(editCobertura) || 0;
      const res = await fetch('/api/configuracion/aseguranzas/servicios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: servId, costo, porcentaje_cobertura: cobertura }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast(err.error || 'Error al guardar', 'error');
        return;
      }
      setServicios((prev) =>
        prev.map((s) => (s.id === servId ? { ...s, costo, porcentaje_cobertura: cobertura } : s))
      );
      toast('Servicio actualizado');
      cancelEdit();
    } catch {
      toast('Error de red', 'error');
    } finally {
      setSavingId(null);
    }
  }, [editCosto, editCobertura, toast, cancelEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, servId: string) => {
    if (e.key === 'Enter') saveEdit(servId);
    if (e.key === 'Escape') cancelEdit();
  }, [saveEdit, cancelEdit]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

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
        const err = await res.json();
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
    setImporting(true);
    try {
      const file = fileInputRef.current?.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('aseguranza_id', id);
      formData.append('confirm', 'true');

      const res = await fetch('/api/configuracion/aseguranzas/servicios/import', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        toast(err.error || 'Error al importar', 'error');
        return;
      }
      toast('Servicios importados exitosamente');
      setShowImportModal(false);
      setImportPreview(null);

      const servRes = await fetch(`/api/configuracion/aseguranzas/servicios?aseguranza_id=${id}`);
      if (servRes.ok) {
        const servJson = await servRes.json();
        setServicios(Array.isArray(servJson) ? servJson : servJson.data ?? []);
      }
    } catch {
      toast('Error de red', 'error');
    } finally {
      setImporting(false);
    }
  }, [id, toast]);

  const handleCloseImportModal = useCallback(() => {
    setShowImportModal(false);
    setImportPreview(null);
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
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
              />
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
            className="w-full pl-8 pr-4 py-2.5 bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 text-gray-900 dark:text-[#E7E9EA]"
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
                  : 'bg-gray-100 dark:bg-[#202327] text-gray-600 dark:text-[#71767B] hover:bg-gray-200 dark:hover:bg-[#2F3336]'
              )}
            >
              {t} ({counts[t] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-12 text-center">
          <ShieldCheck className="h-10 w-10 text-gray-300 dark:text-[#71767B] mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-[#71767B]">No se encontraron servicios</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-[#2F3336]">
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider">Nombre</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider">Tipo</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider">Costo ($)</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider">% Cobertura</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 dark:border-[#2F3336] last:border-0 hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-[#E7E9EA]">{s.nombre}</td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase', tipoBadge[s.tipo])}>
                        {s.tipo}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {editingId === s.id ? (
                        <input
                          type="number"
                          value={editCosto}
                          onChange={(e) => setEditCosto(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, s.id)}
                          autoFocus
                          className="w-24 text-right rounded-md border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-2 py-1 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      ) : (
                        <span className="text-gray-700 dark:text-[#E7E9EA] font-mono">${s.costo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
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
                          className="w-20 text-right rounded-md border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-2 py-1 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      ) : (
                        <span className="font-mono text-gray-700 dark:text-[#E7E9EA]">{s.porcentaje_cobertura}%</span>
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
                            className="text-xs font-bold text-gray-400 dark:text-[#71767B] hover:text-gray-600 dark:hover:text-[#E7E9EA] disabled:opacity-50"
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

          <div className="md:hidden divide-y divide-gray-100 dark:divide-[#2F3336]">
            {filtered.map((s) => (
              <div key={s.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-[#E7E9EA] break-words">{s.nombre}</p>
                  <span className={cn('shrink-0 inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase', tipoBadge[s.tipo])}>
                    {s.tipo}
                  </span>
                </div>
                {editingId === s.id ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-gray-500 dark:text-[#71767B] w-20">Costo ($)</label>
                      <input
                        type="number"
                        value={editCosto}
                        onChange={(e) => setEditCosto(e.target.value)}
                        className="flex-1 rounded-md border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-2 py-1 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-gray-500 dark:text-[#71767B] w-20">% Cobertura</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={editCobertura}
                        onChange={(e) => setEditCobertura(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, s.id)}
                        className="flex-1 rounded-md border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-2 py-1 text-sm text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20"
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
                        className="rounded-md border border-gray-200 dark:border-[#2F3336] px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] disabled:opacity-50"
                      >
                        CANCELAR
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-[#71767B]">
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
        <h3 className="text-lg font-bold text-gray-900 dark:text-[#E7E9EA] mb-4">Confirmar importación</h3>
        {importPreview && (
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-[#71767B]">Válidos</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{importPreview.validos}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-[#71767B]">Duplicados</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">{importPreview.duplicados}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-[#71767B]">Errores</span>
              <span className="font-bold text-red-600 dark:text-red-400">{importPreview.errores}</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handleCloseImportModal}
            className="rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2 text-xs font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23]"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmImport}
            disabled={importing || (importPreview?.validos ?? 0) === 0}
            className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirmar importación'}
          </button>
        </div>
      </Modal>
    </div>
  );
}