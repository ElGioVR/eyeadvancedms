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
import { useFetch } from '@/hooks/useFetch';
import { useToast } from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';

interface DoctorAPI {
  id: string;
  nombre: string;
  especialidad: string;
  cedula: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  created_at: string;
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

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

  const [formNombre, setFormNombre] = useState('');
  const [formEspecialidad, setFormEspecialidad] = useState('Oftalmología');
  const [formCedula, setFormCedula] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');

  const filtered = useMemo(
    () =>
      doctores.filter(
        (d) =>
          d.nombre.toLowerCase().includes(search.toLowerCase()) ||
          d.especialidad.toLowerCase().includes(search.toLowerCase()) ||
          (d.cedula && d.cedula.toLowerCase().includes(search.toLowerCase()))
      ),
    [doctores, search]
  );

  const resetForm = useCallback(() => {
    setFormNombre('');
    setFormEspecialidad('Oftalmología');
    setFormCedula('');
    setFormTelefono('');
    setFormEmail('');
  }, []);

  const handleNewDoctor = useCallback(() => {
    resetForm();
    setFormError(null);
    setShowNewDoctor(true);
  }, [resetForm]);

  const handleEditDoctor = useCallback((doc: DoctorAPI) => {
    setFormNombre(doc.nombre);
    setFormEspecialidad(doc.especialidad);
    setFormCedula(doc.cedula || '');
    setFormTelefono(doc.telefono || '');
    setFormEmail(doc.email || '');
    setFormError(null);
    setEditingDoctor(doc);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setEditingDoctor(null);
    setShowNewDoctor(false);
    resetForm();
  }, [resetForm]);

  const handleCreate = useCallback(async () => {
    if (!formNombre.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/configuracion/doctores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formNombre,
          especialidad: formEspecialidad,
          cedula: formCedula,
          telefono: formTelefono,
          email: formEmail,
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
  }, [formNombre, formEspecialidad, formCedula, formTelefono, formEmail, refetch, handleCloseSidebar, toast]);

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
          nombre: formNombre,
          especialidad: formEspecialidad,
          cedula: formCedula,
          telefono: formTelefono,
          email: formEmail,
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
  }, [editingDoctor, formNombre, formEspecialidad, formCedula, formTelefono, formEmail, refetch, handleCloseSidebar, toast]);

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
              className="w-full pl-8 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
              <div key={i} className="h-64 rounded-xl border border-gray-200 bg-white animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <Stethoscope className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">No se encontraron doctores</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((doc) => {
              const initials = getInitials(doc.nombre);
              const avatarColor = getAvatarColor(doc.id);
              return (
                <div key={doc.id} className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                  <div className="p-5">
                    <div className="flex items-start gap-4 mb-4">
                      <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white', avatarColor)}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-gray-900 truncate">{doc.nombre}</h3>
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Stethoscope className="h-3 w-3" />
                          {doc.especialidad}
                        </p>
                        {doc.cedula && (
                          <p className="text-xs text-gray-400 mt-0.5">Céd. {doc.cedula}</p>
                        )}
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="space-y-1.5 text-xs text-gray-500 border-t border-gray-100 pt-3">
                      {doc.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-gray-400" />
                          <span className="truncate">{doc.email}</span>
                        </div>
                      )}
                      {doc.telefono && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-gray-400" />
                          <span>{doc.telefono}</span>
                        </div>
                      )}
                      {!doc.email && !doc.telefono && (
                        <p className="text-gray-300 italic">Sin contacto registrado</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => handleEditDoctor(doc)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        onClick={() => setDeleteTarget(doc.id)}
                        disabled={deleting === doc.id}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-400 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
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
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-6">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">
                  {editingDoctor ? 'Editar Doctor' : 'Nuevo Doctor'}
                </h3>
                <button onClick={handleCloseSidebar} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Nombre Completo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    placeholder="Ej. Dra. María García"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Especialidad</label>
                  <select
                    value={formEspecialidad}
                    onChange={(e) => setFormEspecialidad(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Cédula Profesional</label>
                  <input
                    type="text"
                    value={formCedula}
                    onChange={(e) => setFormCedula(e.target.value)}
                    placeholder="Ej. 12345678"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Teléfono</label>
                  <input
                    type="text"
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
                    placeholder="Ej. 664-111-2222"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Correo Electrónico</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="correo@eyeadvanced.com"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
                    className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    CANCELAR
                  </button>
                  <button
                    onClick={editingDoctor ? handleUpdate : handleCreate}
                    disabled={saving || !formNombre.trim()}
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
