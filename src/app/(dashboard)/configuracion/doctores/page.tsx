'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Search,
  X,
  Mail,
  Phone,
  Stethoscope,
  Trash2,
  Loader2,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text';
import { useFetch } from '@/hooks/useFetch';
import { useToast } from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';

interface DoctorAPI {
  id: string;
  alias: string;
  nombre: string | null;
  apellido: string | null;
  especialidad: string;
  cedula: string | null;
  telefono: string | null;
  email: string | null;
  usuario_id: string | null;
  activo: boolean;
  created_at: string;
}

interface UsuarioOption {
  id: string;
  email: string;
  nombre: string;
  rol?: string;
}

const avatarColors = [
  'bg-primary-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-violet-500',
];


function getAvatarColor(id: string): string {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return avatarColors[hash % avatarColors.length];
}

export default function DoctoresPage() {
  const { data: doctores, loading, error, refetch } = useFetch<DoctorAPI>('/api/configuracion/doctores');
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [editingDoctor, setEditingDoctor] = useState<DoctorAPI | null>(null);
  const [showNewDoctor, setShowNewDoctor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [formAlias, setFormAlias] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formApellido, setFormApellido] = useState('');
  const [formEspecialidad, setFormEspecialidad] = useState('Oftalmología');
  const [formCedula, setFormCedula] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formUsuarioId, setFormUsuarioId] = useState('');
  const [usuariosDoctor, setUsuariosDoctor] = useState<UsuarioOption[]>([]);

  const filtered = useMemo(
    () =>
      doctores.filter(
        (d) =>
          d.alias.toLowerCase().includes(search.toLowerCase()) ||
          d.especialidad.toLowerCase().includes(search.toLowerCase()) ||
          (d.cedula && d.cedula.toLowerCase().includes(search.toLowerCase()))
      ),
    [doctores, search]
  );

  const resetForm = useCallback(() => {
    setFormAlias('');
    setFormNombre('');
    setFormApellido('');
    setFormEspecialidad('Oftalmología');
    setFormCedula('');
    setFormTelefono('');
    setFormEmail('');
    setFormUsuarioId('');
  }, []);

  const fetchUsuariosDoctor = useCallback(async () => {
    try {
      const res = await fetch('/api/configuracion/usuarios');
      if (res.ok) {
        const data = await res.json();
        const all: UsuarioOption[] = Array.isArray(data) ? data : data.data || [];
        setUsuariosDoctor(all.filter((u) => ['doctor', 'admin'].includes((u as any).rol)));
      }
    } catch { /* silent */ }
  }, []);

  const handleNewDoctor = useCallback(() => {
    resetForm();
    setFormError(null);
    setShowNewDoctor(true);
    fetchUsuariosDoctor();
  }, [resetForm, fetchUsuariosDoctor]);

  const handleEditDoctor = useCallback((doc: DoctorAPI) => {
    setFormAlias(doc.alias);
    setFormNombre(doc.nombre || '');
    setFormApellido(doc.apellido || '');
    setFormEspecialidad(doc.especialidad);
    setFormCedula(doc.cedula || '');
    setFormTelefono(doc.telefono || '');
    setFormEmail(doc.email || '');
    setFormUsuarioId(doc.usuario_id || '');
    setFormError(null);
    setEditingDoctor(doc);
    fetchUsuariosDoctor();
  }, [fetchUsuariosDoctor]);

  const handleCloseSidebar = useCallback(() => {
    setEditingDoctor(null);
    setShowNewDoctor(false);
    resetForm();
  }, [resetForm]);

  const handleCreate = useCallback(async () => {
    if (!formAlias.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/configuracion/doctores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: formAlias,
          nombre: formNombre || null,
          apellido: formApellido || null,
          especialidad: formEspecialidad,
          cedula: formCedula,
          telefono: formTelefono,
          email: formEmail,
          usuario_id: formUsuarioId || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Error al crear doctor');
        return;
      }
      handleCloseSidebar();
      toast('Doctor creado exitosamente');
      await refetch();
    } finally {
      setSaving(false);
    }
  }, [formAlias, formNombre, formApellido, formEspecialidad, formCedula, formTelefono, formEmail, refetch, handleCloseSidebar, toast]);

  const handleUpdate = useCallback(async () => {
    if (!editingDoctor) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/configuracion/doctores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingDoctor.id,
          alias: formAlias,
          nombre: formNombre || null,
          apellido: formApellido || null,
          especialidad: formEspecialidad,
          cedula: formCedula,
          telefono: formTelefono,
          email: formEmail,
          usuario_id: formUsuarioId || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Error al actualizar doctor');
        return;
      }
      handleCloseSidebar();
      toast('Doctor actualizado exitosamente');
      await refetch();
    } finally {
      setSaving(false);
    }
  }, [editingDoctor, formAlias, formNombre, formApellido, formEspecialidad, formCedula, formTelefono, formEmail, refetch, handleCloseSidebar, toast]);

  const handleDelete = useCallback(async (doctorId: string) => {
    setDeleting(doctorId);
    try {
      const res = await fetch(`/api/configuracion/doctores?id=${doctorId}`, { method: 'DELETE' });
      if (res.ok) {
        toast('Doctor eliminado');
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
              placeholder="Buscar doctor por nombre, especialidad o cédula..."
              className="w-full pl-8 pr-4 py-2.5 bg-white dark:bg-[#16181C] border border-gray-200 dark:border-[#2F3336] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <button
            onClick={handleNewDoctor}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            NUEVO DOCTOR
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
              <div key={i} className="h-64 rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] p-12 text-center">
            <Stethoscope className="h-10 w-10 text-gray-300 dark:text-[#71767B] mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-[#71767B]">No se encontraron doctores</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((doc) => {
              const initials = getInitials(doc.alias);
              const avatarColor = getAvatarColor(doc.id);
              return (
                <div key={doc.id} className="group overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                  <div className="p-5">
                    <div className="flex items-start gap-4 mb-4">
                      <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white', avatarColor)}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA] truncate">{doc.alias}</h3>
                        {(doc.nombre || doc.apellido) && (
                          <p className="text-xs text-gray-500 dark:text-[#71767B] mt-0.5 truncate">
                            {[doc.nombre, doc.apellido].filter(Boolean).join(' ')}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-[#71767B] flex items-center gap-1 mt-0.5">
                          <Stethoscope className="h-3 w-3" />
                          {doc.especialidad}
                        </p>
                        {doc.cedula && (
                          <p className="text-xs text-gray-400 dark:text-[#71767B] mt-0.5">Céd. {doc.cedula}</p>
                        )}
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="space-y-1.5 text-xs text-gray-500 dark:text-[#71767B] border-t border-gray-100 dark:border-[#2F3336] pt-3">
                      {doc.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-gray-400 dark:text-[#71767B] dark:text-[#71767B]" />
                          <span className="truncate">{doc.email}</span>
                        </div>
                      )}
                      {doc.telefono && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-gray-400 dark:text-[#71767B] dark:text-[#71767B]" />
                          <span>{doc.telefono}</span>
                        </div>
                      )}
                      {!doc.email && !doc.telefono && (
                        <p className="text-gray-300 dark:text-[#71767B] italic">Sin contacto registrado</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => handleEditDoctor(doc)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-[#2F3336] px-3 py-2 text-xs font-bold text-gray-600 dark:text-[#E7E9EA] dark:text-[#71767B] hover:bg-gray-50 dark:hover:bg-[#1D1F23] dark:bg-[#202327] transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        onClick={() => setDeleteTarget(doc.id)}
                        disabled={deleting === doc.id}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-[#2F3336] px-3 py-2 text-xs font-bold text-gray-400 dark:text-[#71767B] dark:text-[#71767B] hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                      >
                        {deleting === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sidebar — New or Edit */}
      {(editingDoctor || showNewDoctor) && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={handleCloseSidebar} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:rounded-xl lg:w-[380px] lg:shrink-0 w-full">
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm lg:sticky lg:top-6">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">
                  {editingDoctor ? 'Editar Doctor' : 'Nuevo Doctor'}
                </h3>
                <button onClick={handleCloseSidebar} className="text-gray-400 dark:text-[#71767B] dark:text-[#71767B] hover:text-gray-600 dark:hover:text-[#E7E9EA] dark:text-[#E7E9EA] dark:text-[#71767B] transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">
                    Alias <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formAlias}
                    onChange={(e) => setFormAlias(e.target.value)}
                    placeholder="Ej. DR BAYARDO"
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-[#71767B]">Nombre con el que se muestra en toda la app (agenda, citas, reportes).</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Nombre</label>
                    <input
                      type="text"
                      value={formNombre}
                      onChange={(e) => setFormNombre(e.target.value)}
                      placeholder="Bayardo"
                      className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Apellido</label>
                    <input
                      type="text"
                      value={formApellido}
                      onChange={(e) => setFormApellido(e.target.value)}
                      placeholder="Cisneros"
                      className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Especialidad</label>
                  <select
                    value={formEspecialidad}
                    onChange={(e) => setFormEspecialidad(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  >
                    <option value="Oftalmología">Oftalmología</option>
                    <option value="Oftalmología Pediátrica">Oftalmología Pediátrica</option>
                    <option value="Glaucoma">Glaucoma</option>
                    <option value="Retina">Retina</option>
                    <option value="Catarata y Cirugía Refractiva">Catarata y Cirugía Refractiva</option>
                    <option value="Cornea y Superficie Ocular">Córnea y Superficie Ocular</option>
                    <option value="Estrabismo">Estrabismo</option>
                    <option value="Optometría">Optometría</option>
                    <option value="Neuroftalmología">Neuroftalmología</option>
                    <option value="Oculoplástica">Oculoplástica</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Cédula Profesional</label>
                  <input
                    type="text"
                    value={formCedula}
                    onChange={(e) => setFormCedula(e.target.value)}
                    placeholder="Ej. 12345678"
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
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Correo Electrónico</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="correo@eyeadvanced.com"
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Vincular Usuario</label>
                  <select
                    value={formUsuarioId}
                    onChange={(e) => setFormUsuarioId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  >
                    <option value="">Sin vincular</option>
                    {usuariosDoctor.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre || u.email} {(u as any).rol === 'admin' ? '(Admin)' : '(Doctor)'}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-gray-400 dark:text-[#71767B]">Usuarios con rol Doctor o Administrador</p>
                </div>
                {formError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {formError}
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleCloseSidebar}
                    className="flex-1 rounded-lg border border-gray-200 dark:border-[#2F3336] px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] dark:text-[#71767B] hover:bg-gray-50 dark:hover:bg-[#1D1F23] dark:bg-[#202327] transition-colors"
                  >
                    CANCELAR
                  </button>
                  <button
                    onClick={editingDoctor ? handleUpdate : handleCreate}
                    disabled={saving || !formAlias.trim()}
                    className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</>
                    ) : editingDoctor ? 'GUARDAR CAMBIOS' : 'CREAR DOCTOR'}
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
        title="Eliminar Doctor"
        message="¿Eliminar este doctor? Esta acción no se puede deshacer."
        confirmLabel="ELIMINAR"
        variant="danger"
        loading={!!deleting}
      />
    </div>
  );
}
