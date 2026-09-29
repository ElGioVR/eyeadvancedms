'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Camera, Save, Loader2, X, Bell } from 'lucide-react';
import useSWR from 'swr';
import { useUser, refreshUser } from '@/hooks/useUser';
import { enviarJSON } from '@/lib/fetcher';
import Skeleton from '@/components/ui/Skeleton';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { useToast } from '@/components/ui/Toast';
import dynamic from 'next/dynamic';

// Carga diferida: react-image-crop y supabase-js solo se descargan al usarse
const AvatarCropModal = dynamic(() => import('@/components/ui/AvatarCropModal'), { ssr: false });
const getSupabaseBrowser = async () => (await import('@/lib/supabase/client')).createClient();

const rolLabels: Record<string, string> = {
  admin: 'Administrador',
  doctor: 'Doctor (Médico Especialista)',
  recepcionista: 'Recepcionista',
};


function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  return new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(dateStr: string | null, now: Date): string {
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

interface PrefsResp {
  data?: { tipo_evento: string; canal?: string; activo: boolean }[];
}

export default function PerfilPage() {
  const { user, loading } = useUser();
  const { toast } = useToast();
  const [now, setNow] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setNow(new Date()); setMounted(true); }, []);

  // Preferencias de notificación (SWR): el toggle es optimista y se revierte si falla.
  const { data: prefsResp, mutate: mutatePrefs } = useSWR<PrefsResp>(user ? '/api/notificaciones/preferencias' : null);
  const notifPrefs = useMemo(() => {
    const prefs: Record<string, boolean> = {};
    for (const p of prefsResp?.data ?? []) prefs[p.tipo_evento] = p.activo;
    return prefs;
  }, [prefsResp]);

  const toggleNotifPref = useCallback(async (tipo: string) => {
    const next = !notifPrefs[tipo];
    const conCambio = (actual: PrefsResp | undefined): PrefsResp => {
      const lista = actual?.data ?? [];
      const existe = lista.some((p) => p.tipo_evento === tipo);
      return {
        ...(actual ?? {}),
        data: existe
          ? lista.map((p) => (p.tipo_evento === tipo ? { ...p, activo: next } : p))
          : [...lista, { tipo_evento: tipo, canal: 'IN_APP', activo: next }],
      };
    };
    try {
      await mutatePrefs(
        async (actual) => {
          await enviarJSON('/api/notificaciones/preferencias', 'PATCH', {
            preferencias: [{ tipo_evento: tipo, canal: 'IN_APP', activo: next }],
          });
          return conCambio(actual);
        },
        { optimisticData: conCambio, rollbackOnError: true, populateCache: true, revalidate: false }
      );
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : 'No se pudo guardar la preferencia', 'error');
    }
  }, [notifPrefs, mutatePrefs, toast]);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Form state
  const [nombre, setNombre] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Foto de perfil (lógica compartida con /mi-perfil)
  const avatar = useAvatarUpload(user?.id, toast);
  const { fileInputRef, uploading } = avatar;

  // Initialize form with user data
  if (user && !initialized) {
    setNombre(user.nombre);
    setInitialized(true);
  }

  const handleAvatarClick = avatar.abrirSelector;
  const handleAvatarChange = avatar.onFileChange;
  const handleRemoveAvatar = avatar.eliminar;

  const handleSaveProfile = async () => {
    if (!user || saving) return;
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      toast('El nombre es obligatorio', 'error');
      return;
    }
    if (nombreLimpio.length > 120) {
      toast('El nombre no puede exceder 120 caracteres', 'error');
      return;
    }
    setSaving(true);
    try {
      const supabase = await getSupabaseBrowser();
      const { error } = await supabase.auth.updateUser({
        data: { nombre: nombreLimpio },
      });
      if (error) throw error;

      await enviarJSON('/api/configuracion/usuarios', 'PATCH', { id: user.id, nombre: nombreLimpio });

      toast('Perfil actualizado');
      // Solo se refresca el perfil compartido (Sidebar, TopBar…), sin recargar la pantalla.
      await refreshUser();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar';
      toast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user || savingPassword) return;
    if (!currentPassword) {
      toast('Escribe tu contraseña actual', 'error');
      return;
    }
    if (!newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      toast('Las contraseñas no coinciden', 'error');
      return;
    }
    if (newPassword.length < 8) {
      toast('La contraseña debe tener al menos 8 caracteres', 'error');
      return;
    }
    if (newPassword.length > 72) {
      toast('La contraseña no puede exceder 72 caracteres', 'error');
      return;
    }
    if (newPassword === currentPassword) {
      toast('La nueva contraseña debe ser distinta de la actual', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      await enviarJSON('/api/configuracion/usuarios', 'PATCH', {
        id: user.id,
        password_actual: currentPassword,
        password: newPassword,
      });
      toast('Contraseña actualizada');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : 'Error al cambiar contraseña';
      toast(message, 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" aria-busy="true" aria-label="Cargando perfil">
        <div className="space-y-6">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar la información del usuario.
      </div>
    );
  }

  const displayAvatar = avatar.avatarPreview !== undefined ? avatar.avatarPreview : user.avatar_url;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] animate-fadeIn">
        {/* Main form */}
        <div className="space-y-6">
          {/* Photo */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
            <div className="border-b border-line/70 px-6 py-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">Foto de Perfil</h3>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  {displayAvatar ? (
                    <img
                      src={displayAvatar}
                      alt={user.nombre}
                      className="flex h-20 w-20 items-center justify-center rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-500 text-2xl font-bold text-white">
                      {user.iniciales}
                    </div>
                  )}
                  <button
                    onClick={handleAvatarClick}
                    disabled={uploading}
                    aria-label="Cambiar foto de perfil"
                    className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div>
                  <p className="text-sm font-bold text-fg">{user.nombre || 'Sin nombre'}</p>
                  <p className="text-xs text-muted mt-0.5">{user.email}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      onClick={handleAvatarClick}
                      disabled={uploading}
                      className="text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-50"
                    >
                      Cambiar foto
                    </button>
                    {displayAvatar && (
                      <button
                        onClick={handleRemoveAvatar}
                        disabled={uploading}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Personal info */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
            <div className="border-b border-line/70 px-6 py-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">Información Personal</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Nombre Completo</label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    maxLength={120}
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Correo Electrónico</label>
                  <input
                    type="email"
                    defaultValue={user.email}
                    disabled
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-muted cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Rol</label>
                  <input
                    type="text"
                    value={rolLabels[user.rol] || user.rol}
                    disabled
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-muted cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Password */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
            <div className="border-b border-line/70 px-6 py-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">Cambiar Contraseña</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
                  <label htmlFor="password-actual" className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Contraseña Actual</label>
                  <input
                    id="password-actual"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Tu contraseña actual"
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Nueva Contraseña</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    maxLength={72}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">Confirmar Contraseña</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    maxLength={72}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repetir contraseña"
                    className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500">Las contraseñas no coinciden</p>
              )}
              <div className="flex justify-end">
                <button
                  onClick={handleChangePassword}
                  disabled={!currentPassword || !newPassword || !confirmPassword || savingPassword || newPassword !== confirmPassword}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors disabled:opacity-50"
                >
                  {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {savingPassword ? 'Guardando…' : 'Cambiar Contraseña'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveProfile}
              disabled={saving || !nombre.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Guardando…' : 'Guardar Cambios'}
            </button>
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
            <div className="border-b border-line/70 px-6 py-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">Resumen</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs text-muted">Rol</p>
                <p className="text-sm font-bold text-fg">{rolLabels[user.rol] || user.rol}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Estado</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Activo
                </span>
              </div>
              <div>
                <p className="text-xs text-muted">Fecha de Registro</p>
                <p className="text-sm font-medium text-fg-2">{mounted ? formatDate(user.created_at) : '...'}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Último Acceso</p>
                <p className="text-sm font-medium text-fg-2">{mounted && now ? formatTime(user.last_sign_in_at, now) : '...'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AvatarCropModal {...avatar.cropModal} />

      {/* Notification Preferences */}
      <div className="mx-auto max-w-[1440px] mt-8">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card dark:shadow-none">
          <div className="border-b border-line/70 px-6 py-4 flex items-center gap-3">
            <Bell className="h-5 w-5 text-primary-600" />
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-fg">Preferencias de Notificación</h3>
              <p className="text-xs text-muted">Elige qué notificaciones deseas recibir</p>
            </div>
          </div>
          <div className="p-6">
            {[
              { key: 'PAGO_HONORARIOS', label: 'Pago de honorarios', desc: 'Cuando se registre un pago de tus honorarios' },
              { key: 'RECORDATORIO_CONSULTA', label: 'Recordatorio de consulta', desc: '10 minutos antes de una consulta programada' },
              { key: 'ASIGNACION_SERVICIO', label: 'Asignación de servicio', desc: 'Cuando se te asigne un estudio o procedimiento' },
              { key: 'PROXIMA_CIRUGIA', label: 'Próxima cirugía', desc: 'Cirugía programada y quién atiende' },
              { key: 'CANCELACION', label: 'Cancelaciones', desc: 'Cuando se cancele una consulta o cirugía' },
              { key: 'REAGENDADO', label: 'Reagendados', desc: 'Cuando se posponga o reagende una cita' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between py-3 border-b border-gray-50 dark:border-line last:border-0">
                <div>
                  <p className="text-sm font-bold text-fg">{item.label}</p>
                  <p className="text-xs text-muted">{item.desc}</p>
                </div>
                <button
                  onClick={() => toggleNotifPref(item.key)}
                  role="switch"
                  aria-checked={!!notifPrefs[item.key]}
                  aria-label={item.label}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${notifPrefs[item.key] ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform mt-0.5 ${notifPrefs[item.key] ? 'translate-x-5.5 ml-0.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
