'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Plus,
  Eye,
  EyeOff,
  X,
  User,
  Trash2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFetch, useInvalidar } from '@/hooks/useFetch';
import { useDebounce } from '@/hooks/useDebounce';
import { enviarJSON } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import BarraRevalidando from '@/components/ui/BarraRevalidando';
import ConfirmModal from '@/components/ui/ConfirmModal';
import Pagination from '@/components/ui/Pagination';

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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const comoLista = (actual: unknown): UsuarioAPI[] => (Array.isArray(actual) ? (actual as UsuarioAPI[]) : []);
const msg = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/** Validación local (el servidor sigue siendo la autoridad). */
function validarUsuario(nombre: string, email: string, password: string, requierePassword: boolean): string | null {
  if (!nombre.trim()) return 'El nombre es obligatorio';
  if (nombre.trim().length > 120) return 'El nombre no puede exceder 120 caracteres';
  if (!EMAIL_RE.test(email.trim())) return 'Correo electrónico no válido';
  if (requierePassword && !password) return 'La contraseña es obligatoria';
  if (password && password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (password.length > 72) return 'La contraseña no puede exceder 72 caracteres';
  return null;
}

const rolConfig: Record<string, { label: string; color: string }> = {
  admin: { label: 'Administrador', color: 'bg-red-50 text-red-700 ring-red-200' },
  doctor: { label: 'Doctor', color: 'bg-primary-50 text-primary-700 ring-primary-200' },
  recepcionista: { label: 'Recepcionista', color: 'bg-amber-50 text-amber-700 ring-amber-200' },
  enfermero: { label: 'Enfermero(a)', color: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
};

const avatarColors = ['bg-primary-500', 'bg-sky-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500', 'bg-cyan-500', 'bg-amber-500', 'bg-violet-500'];

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

function getAvatarColor(id: string): string {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return avatarColors[hash % avatarColors.length];
}

function formatDate(dateStr: string | null, now: Date): string {
  if (!dateStr) return 'Nunca';
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Ahora mismo';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs}h`;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function UsuariosPage() {
  const { data: usuarios, loading, validating, error, mutate } = useFetch<UsuarioAPI>('/api/configuracion/usuarios');
  const invalidar = useInvalidar();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState<UsuarioAPI | null>(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UsuarioAPI | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setNow(new Date()); setMounted(true); }, []);

  // Form state
  const [formNombre, setFormNombre] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRol, setFormRol] = useState('recepcionista');

  const debouncedSearch = useDebounce(search);
  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return usuarios.filter(
      (u) => (u.nombre || '').toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term)
    );
  }, [usuarios, debouncedSearch]);

  const paginated = useMemo(
    () => filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
    [filtered, page]
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
    if (saving) return;
    const invalido = validarUsuario(formNombre, formEmail, formPassword, true);
    if (invalido) { setFormError(invalido); return; }
    setSaving(true);
    setFormError(null);
    try {
      await mutate(
        async (actual: unknown) => {
          const nuevo = await enviarJSON<Partial<UsuarioAPI>>('/api/configuracion/usuarios', 'POST', {
            nombre: formNombre.trim(),
            email: formEmail.trim(),
            password: formPassword,
            rol: formRol,
          });
          const fila: UsuarioAPI = {
            id: String(nuevo.id),
            email: nuevo.email ?? formEmail.trim(),
            nombre: nuevo.nombre ?? formNombre.trim(),
            rol: nuevo.rol ?? formRol,
            activo: nuevo.activo ?? true,
            created_at: nuevo.created_at ?? '',
            last_sign_in_at: null,
            email_confirmed_at: null,
          };
          return [...comoLista(actual), fila];
        },
        { populateCache: true, revalidate: true }
      );
      handleCloseSidebar();
      toast('Usuario creado exitosamente');
      invalidar('/api/configuracion/doctores');
    } catch (err) {
      setFormError(msg(err, 'Error al crear usuario'));
    } finally {
      setSaving(false);
    }
  }, [saving, formNombre, formEmail, formPassword, formRol, mutate, invalidar, handleCloseSidebar, toast]);

  const handleUpdate = useCallback(async () => {
    if (!editingUser || saving) return;
    const invalido = validarUsuario(formNombre, formEmail, formPassword, false);
    if (invalido) { setFormError(invalido); return; }
    setSaving(true);
    setFormError(null);
    const id = editingUser.id;
    const cambios = { nombre: formNombre.trim(), email: formEmail.trim(), rol: formRol };
    const aplicar = (actual: unknown) => comoLista(actual).map((u) => (u.id === id ? { ...u, ...cambios } : u));
    try {
      const updates: Record<string, unknown> = { id, ...cambios };
      if (formPassword) updates.password = formPassword;
      await mutate(
        async (actual: unknown) => {
          await enviarJSON('/api/configuracion/usuarios', 'PATCH', updates);
          return aplicar(actual);
        },
        { optimisticData: aplicar, rollbackOnError: true, populateCache: true, revalidate: true }
      );
      handleCloseSidebar();
      toast('Usuario actualizado exitosamente');
      invalidar('/api/configuracion/doctores');
    } catch (err) {
      setFormError(msg(err, 'Error al actualizar usuario'));
    } finally {
      setSaving(false);
    }
  }, [editingUser, saving, formNombre, formEmail, formPassword, formRol, mutate, invalidar, handleCloseSidebar, toast]);

  const setActivo = useCallback(async (user: UsuarioAPI, activo: boolean) => {
    const aplicar = (actual: unknown) => comoLista(actual).map((u) => (u.id === user.id ? { ...u, activo } : u));
    setToggling(user.id);
    try {
      await mutate(
        async (actual: unknown) => {
          await enviarJSON('/api/configuracion/usuarios', 'PATCH', { id: user.id, activo });
          return aplicar(actual);
        },
        { optimisticData: aplicar, rollbackOnError: true, populateCache: true, revalidate: true }
      );
      toast(activo ? 'Usuario activado' : 'Usuario desactivado');
    } catch (err) {
      toast(msg(err, 'No se pudo cambiar el estado'), 'error');
    } finally {
      setToggling(null);
      setDeactivateTarget(null);
    }
  }, [mutate, toast]);

  // Desactivar es destructivo (bloquea el acceso): se confirma; activar es inmediato.
  const handleToggleActive = useCallback((user: UsuarioAPI) => {
    if (user.activo) setDeactivateTarget(user);
    else setActivo(user, true);
  }, [setActivo]);

  const handleDelete = useCallback(async (userId: string) => {
    const quitar = (actual: unknown) => comoLista(actual).filter((u) => u.id !== userId);
    setDeleting(userId);
    try {
      await mutate(
        async (actual: unknown) => {
          await enviarJSON(`/api/configuracion/usuarios?id=${encodeURIComponent(userId)}`, 'DELETE');
          return quitar(actual);
        },
        { optimisticData: quitar, rollbackOnError: true, populateCache: true, revalidate: true }
      );
      toast('Usuario eliminado');
      if (editingUser?.id === userId) handleCloseSidebar();
    } catch (err) {
      toast(msg(err, 'No se pudo eliminar el usuario'), 'error');
    } finally {
      setDeleting(null);
      setDeleteTarget(null);
    }
  }, [mutate, toast, editingUser, handleCloseSidebar]);

  // Si el filtro/borrado deja la página actual vacía, volver a la última con datos.
  useEffect(() => {
    const ultima = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    if (page > ultima) setPage(ultima);
  }, [filtered.length, page]);

  const cargandoInicial = loading && usuarios.length === 0;

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
              className="w-full pl-8 pr-4 py-2.5 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
        {error && usuarios.length === 0 && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {/* Table */}
        {cargandoInicial ? (
          <div className="rounded-2xl border border-line bg-surface p-6 space-y-3" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-surface-2" />
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
            <table className="w-full">
              <thead>
                <tr className="border-b border-line/70 bg-gray-50 dark:bg-surface-2/50 dark:bg-surface-2/50">
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted dark:text-muted">Colaborador</th>
                  <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted dark:text-muted">Rol Clínico</th>
                  <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted dark:text-muted">Estado</th>
                  <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted dark:text-muted">Último Acceso</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted dark:text-muted">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 anim-lista">
                {paginated.map((user) => {
                  const initials = getInitials(user.nombre || user.email);
                  const avatarColor = getAvatarColor(user.id);
                  const rol = rolConfig[user.rol] || rolConfig.recepcionista;
                  return (
                    <tr key={user.id} className={cn('group transition-colors hover:bg-gray-50 dark:bg-surface-2/60 dark:hover:bg-surface-2/60', editingUser?.id === user.id && 'bg-primary-50/40')}>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white', avatarColor)}>{initials}</div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-fg">{user.nombre || 'Sin nombre'}</div>
                            <div className="text-xs text-muted dark:text-muted truncate">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-6 py-4">
                        <span className={cn('inline-flex rounded-md px-2.5 py-1 text-xs font-extrabold ring-1 ring-inset', rol.color)}>{rol.label}</span>
                      </td>
                      <td className="hidden sm:table-cell px-6 py-4">
                        <button
                          onClick={() => handleToggleActive(user)}
                          disabled={toggling === user.id}
                          aria-label={user.activo ? `Desactivar a ${user.nombre || user.email}` : `Activar a ${user.nombre || user.email}`}
                          className={cn('inline-flex items-center gap-1.5 text-xs font-bold transition-colors disabled:opacity-50', user.activo ? 'text-emerald-600' : 'text-muted dark:text-muted')}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', user.activo ? 'bg-emerald-500' : 'bg-gray-300')} />
                          {user.activo ? 'ACTIVO' : 'INACTIVO'}
                        </button>
                      </td>
                      <td className="hidden md:table-cell px-6 py-4 text-sm text-muted">{mounted && now ? formatDate(user.last_sign_in_at, now) : '...'}</td>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleEditUser(user)} className="text-sm font-semibold text-primary-600 hover:text-primary-800 transition-colors">Editar</button>
                          <button
                            onClick={() => setDeleteTarget(user.id)}
                            disabled={deleting === user.id}
                            aria-label={`Eliminar a ${user.nombre || user.email}`}
                            className="text-muted dark:text-muted hover:text-red-600 transition-colors disabled:opacity-50"
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
                    <User className="h-10 w-10 text-gray-300 dark:text-muted mx-auto mb-3" />
                    <p className="text-sm font-medium text-muted">No se encontraron usuarios</p>
                  </td></tr>
                )}
              </tbody>
            </table>

            {/* Pagination */}
            <Pagination
              page={page}
              total={filtered.length}
              pageSize={5}
              totalItems={filtered.length}
              onPageChange={(p) => setPage(p)}
              label="usuarios"
            />
          </div>
        )}
      </div>

      {/* Sidebar — New or Edit */}
      {(editingUser || showNewUser) && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden animate-fadeIn" onClick={handleCloseSidebar} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl animate-fadeIn lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:rounded-xl lg:w-[380px] lg:shrink-0 w-full">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none lg:sticky lg:top-6">
              <div className="flex items-center justify-between border-b border-line/70 px-6 py-4">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">
                  {editingUser ? 'Editar Colaborador' : 'Nuevo Colaborador'}
                </h3>
                <button onClick={handleCloseSidebar} aria-label="Cerrar" className="text-muted dark:text-muted hover:text-gray-600 dark:hover:text-fg dark:text-muted dark:text-fg dark:text-muted transition-colors"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Nombre Completo <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    maxLength={120}
                    placeholder="Ej. Juan Pérez"
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Correo Electrónico <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="correo@eyeadvanced.com"
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
                    Contraseña {editingUser ? '(dejar vacío para no cambiar)' : <span className="text-red-500">*</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      autoComplete="new-password"
                      maxLength={72}
                      placeholder={editingUser ? '••••••••••••' : 'Mínimo 8 caracteres'}
                      className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 pr-10 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                    <button type="button" onClick={() => setShowPassword((p) => !p)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted dark:text-muted hover:text-gray-600 dark:hover:text-fg dark:text-muted dark:text-fg dark:text-muted">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Rol en el Sistema</label>
                  <select
                    value={formRol}
                    onChange={(e) => setFormRol(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  >
                    <option value="doctor">Doctor (Médico Especialista)</option>
                    <option value="admin">Administrador</option>
                    <option value="recepcionista">Recepcionista</option>
                    <option value="enfermero">Enfermero(a) — solo su agenda y, si aplica, sus honorarios</option>
                  </select>
                </div>
                {formError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {formError}
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button onClick={handleCloseSidebar} className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-bold text-fg-2 dark:text-muted hover:bg-gray-50 dark:bg-surface-2 transition-colors">CANCELAR</button>
                  <button
                    onClick={editingUser ? handleUpdate : handleCreate}
                    disabled={saving || !formNombre || !formEmail || (!editingUser && !formPassword)}
                    className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : editingUser ? 'GUARDAR CAMBIOS' : 'CREAR USUARIO'}
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

      <ConfirmModal
        isOpen={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => deactivateTarget && setActivo(deactivateTarget, false)}
        title="Desactivar Usuario"
        message={`¿Desactivar a ${deactivateTarget?.nombre || deactivateTarget?.email || 'este usuario'}? Ya no podrá iniciar sesión.`}
        confirmLabel="DESACTIVAR"
        variant="warning"
        loading={!!toggling}
      />
    </div>
  );
}
