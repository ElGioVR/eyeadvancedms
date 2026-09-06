'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Eye,
  EyeOff,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  Trash2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFetch } from '@/hooks/useFetch';
import { useToast } from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';

interface UsuarioAPI {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  activo: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}

const ITEMS_PER_PAGE = 5;

const rolConfig: Record<string, { label: string; color: string }> = {
  admin: { label: 'Administrador', color: 'bg-red-50 text-red-700 ring-red-200' },
  doctor: { label: 'Doctor', color: 'bg-primary-50 text-primary-700 ring-primary-200' },
  recepcionista: { label: 'Recepcionista', color: 'bg-amber-50 text-amber-700 ring-amber-200' },
};

const avatarColors = ['bg-primary-500', 'bg-sky-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500', 'bg-cyan-500', 'bg-amber-500', 'bg-violet-500'];

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

function getAvatarColor(id: string): string {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return avatarColors[hash % avatarColors.length];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Ahora mismo';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs}h`;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function UsuariosPage() {
  const { data: usuarios, loading, error, refetch } = useFetch<UsuarioAPI>('/api/configuracion/usuarios');
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState<UsuarioAPI | null>(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [formNombre, setFormNombre] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRol, setFormRol] = useState('recepcionista');

  const filtered = useMemo(
    () =>
      usuarios.filter(
        (u) =>
          u.nombre.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())
      ),
    [usuarios, search]
  );

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const resetForm = useCallback(() => {
    setFormNombre('');
    setFormEmail('');
    setFormPassword('');
    setFormRol('recepcionista');
  }, []);

  const handleNewUser = useCallback(() => {
    resetForm();
    setFormError(null);
    setShowNewUser(true);
  }, [resetForm]);

  const handleEditUser = useCallback((user: UsuarioAPI) => {
    setFormNombre(user.nombre);
    setFormEmail(user.email);
    setFormPassword('');
    setFormRol(user.rol);
    setFormError(null);
    setEditingUser(user);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setEditingUser(null);
    setShowNewUser(false);
    resetForm();
  }, [resetForm]);

  const handleCreate = useCallback(async () => {
    if (!formNombre || !formEmail || !formPassword) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/configuracion/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formNombre,
          email: formEmail,
          password: formPassword,
          rol: formRol,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Error al crear usuario');
        return;
      }
      handleCloseSidebar();
      toast('Usuario creado exitosamente');
      await refetch();
    } finally {
      setSaving(false);
    }
  }, [formNombre, formEmail, formPassword, formRol, refetch, handleCloseSidebar, toast]);

  const handleUpdate = useCallback(async () => {
    if (!editingUser) return;
    setSaving(true);
    setFormError(null);
    try {
      const updates: Record<string, any> = {
        id: editingUser.id,
        nombre: formNombre,
        email: formEmail,
        rol: formRol,
      };
      if (formPassword) updates.password = formPassword;

      const res = await fetch('/api/configuracion/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Error al actualizar usuario');
        return;
      }
      handleCloseSidebar();
      toast('Usuario actualizado exitosamente');
      await refetch();
    } finally {
      setSaving(false);
    }
  }, [editingUser, formNombre, formEmail, formPassword, formRol, refetch, handleCloseSidebar, toast]);

  const handleToggleActive = useCallback(async (user: UsuarioAPI) => {
    const res = await fetch('/api/configuracion/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, activo: !user.activo }),
    });
    if (res.ok) {
      toast(user.activo ? 'Usuario desactivado' : 'Usuario activado');
      await refetch();
    }
  }, [refetch, toast]);

  const handleDelete = useCallback(async (userId: string) => {
    setDeleting(userId);
    try {
      const res = await fetch(`/api/configuracion/usuarios?id=${userId}`, { method: 'DELETE' });
      if (res.ok) {
        toast('Usuario eliminado');
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
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar usuario por nombre o email..."
              className="w-full pl-8 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <button
            onClick={handleNewUser}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            NUEVO USUARIO
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {/* Table */}
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Colaborador</th>
                  <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Rol Clínico</th>
                  <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Estado</th>
                  <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Último Acceso</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map((user) => {
                  const initials = getInitials(user.nombre || user.email);
                  const avatarColor = getAvatarColor(user.id);
                  const rol = rolConfig[user.rol] || rolConfig.recepcionista;
                  return (
                    <tr key={user.id} className={cn('group transition-colors hover:bg-gray-50/60', editingUser?.id === user.id && 'bg-primary-50/40')}>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white', avatarColor)}>{initials}</div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-gray-900">{user.nombre || 'Sin nombre'}</div>
                            <div className="text-xs text-gray-400 truncate">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-6 py-4">
                        <span className={cn('inline-flex rounded-md px-2.5 py-1 text-xs font-extrabold ring-1 ring-inset', rol.color)}>{rol.label}</span>
                      </td>
                      <td className="hidden sm:table-cell px-6 py-4">
                        <button
                          onClick={() => handleToggleActive(user)}
                          className={cn('inline-flex items-center gap-1.5 text-xs font-bold', user.activo ? 'text-emerald-600' : 'text-gray-400')}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', user.activo ? 'bg-emerald-500' : 'bg-gray-300')} />
                          {user.activo ? 'ACTIVO' : 'INACTIVO'}
                        </button>
                      </td>
                      <td className="hidden md:table-cell px-6 py-4 text-sm text-gray-500">{formatDate(user.last_sign_in_at)}</td>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleEditUser(user)} className="text-sm font-semibold text-primary-600 hover:text-primary-800 transition-colors">Editar</button>
                          <button
                            onClick={() => setDeleteTarget(user.id)}
                            disabled={deleting === user.id}
                            className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          >
                            {deleting === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr><td colSpan={5} className="px-4 sm:px-6 py-12 text-center">
                    <User className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-500">No se encontraron usuarios</p>
                  </td></tr>
                )}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/30 px-4 sm:px-6 py-3">
              <span className="hidden sm:inline text-sm text-gray-400">Mostrando {paginated.length} de {filtered.length} usuarios</span>
              <span className="sm:hidden text-sm text-gray-400">{paginated.length}/{filtered.length}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 sm:px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Anterior</span>
                </button>
                <div className="hidden sm:flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setPage(p)} className={cn('h-8 w-8 rounded-md text-sm font-bold transition-colors', p === page ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>{p}</button>
                  ))}
                </div>
                <span className="sm:hidden text-sm font-medium text-gray-600 px-2">{page}/{totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 sm:px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  <span className="hidden sm:inline">Siguiente</span><ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar — New or Edit */}
      {(editingUser || showNewUser) && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={handleCloseSidebar} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:rounded-xl lg:w-[380px] lg:shrink-0 w-full">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-6">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900">
                  {editingUser ? 'Editar Colaborador' : 'Nuevo Colaborador'}
                </h3>
                <button onClick={handleCloseSidebar} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nombre Completo <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Correo Electrónico <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="correo@eyeadvanced.com"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Contraseña {editingUser ? '(dejar vacío para no cambiar)' : <span className="text-red-500">*</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder={editingUser ? '••••••••••••' : 'Mínimo 6 caracteres'}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 pr-10 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                    <button type="button" onClick={() => setShowPassword((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Rol en el Sistema</label>
                  <select
                    value={formRol}
                    onChange={(e) => setFormRol(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  >
                    <option value="doctor">Doctor (Médico Especialista)</option>
                    <option value="admin">Administrador</option>
                    <option value="recepcionista">Recepcionista</option>
                  </select>
                </div>
                {formError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {formError}
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button onClick={handleCloseSidebar} className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">CANCELAR</button>
                  <button
                    onClick={editingUser ? handleUpdate : handleCreate}
                    disabled={saving || !formNombre || !formEmail || (!editingUser && !formPassword)}
                    className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : editingUser ? 'GUARDAR CAMBIOS' : 'CREAR USUARIO'}
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
        title="Eliminar Usuario"
        message="¿Eliminar este usuario? Esta acción no se puede deshacer."
        confirmLabel="ELIMINAR"
        variant="danger"
        loading={!!deleting}
      />
    </div>
  );
}
