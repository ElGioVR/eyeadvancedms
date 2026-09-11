'use client';

import { useState, useRef } from 'react';
import { Camera, Save, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import AvatarCropModal from '@/components/ui/AvatarCropModal';

const rolLabels: Record<string, string> = {
  admin: 'Administrador',
  doctor: 'Doctor (Médico Especialista)',
  recepcionista: 'Recepcionista',
};

const AVATAR_MAX_SIZE = 500 * 1024;
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  return new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(dateStr: string | null): string {
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

export default function PerfilPage() {
  const { user, loading } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Form state
  const [nombre, setNombre] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Avatar state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = useState('');

  // Initialize form with user data
  if (user && !initialized) {
    setNombre(user.nombre);
    setInitialized(true);
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      toast('Formato no permitido. Usa JPEG, PNG o WebP', 'error');
      return;
    }

    if (file.size > AVATAR_MAX_SIZE) {
      toast('La imagen no puede superar 500KB', 'error');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setSelectedImageSrc(previewUrl);
    setCropModalOpen(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCropComplete = async (blob: Blob) => {
    if (!user) return;
    setUploading(true);

    try {
      const supabase = createClient();
      const filePath = `avatars/${user.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const avatarUrl = urlData.publicUrl;

      const res = await fetch('/api/configuracion/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, avatar_url: avatarUrl }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      setAvatarPreview(avatarUrl);
      toast('Foto de perfil actualizada');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al subir la imagen';
      toast(message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setUploading(true);

    try {
      const supabase = createClient();
      const filePath = `avatars/${user.id}/avatar.jpg`;

      await supabase.storage.from('avatars').remove([filePath]);

      const res = await fetch('/api/configuracion/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, avatar_url: null }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      setAvatarPreview(null);
      toast('Foto de perfil eliminada');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar la imagen';
      toast(message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: { nombre },
      });
      if (error) throw error;

      await fetch('/api/configuracion/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, nombre }),
      });

      toast('Perfil actualizado');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar';
      toast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      toast('Las contraseñas no coinciden', 'error');
      return;
    }
    if (newPassword.length < 6) {
      toast('La contraseña debe tener al menos 6 caracteres', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/configuracion/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user!.id, password: newPassword }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      toast('Contraseña actualizada');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cambiar contraseña';
      toast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-40 rounded-xl bg-gray-200 dark:bg-[#202327]" />
          <div className="h-64 rounded-xl bg-gray-200 dark:bg-[#202327]" />
        </div>
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

  const displayAvatar = avatarPreview || user.avatar_url;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main form */}
        <div className="space-y-6">
          {/* Photo */}
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Foto de Perfil</h3>
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
                    className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{user.nombre || 'Sin nombre'}</p>
                  <p className="text-xs text-gray-400 dark:text-[#71767B] mt-0.5">{user.email}</p>
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
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Información Personal</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Nombre Completo</label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-[#E7E9EA] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Correo Electrónico</label>
                  <input
                    type="email"
                    defaultValue={user.email}
                    disabled
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-100 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-500 dark:text-[#71767B] cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Rol</label>
                  <input
                    type="text"
                    value={rolLabels[user.rol] || user.rol}
                    disabled
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-100 dark:bg-[#202327] px-4 py-2.5 text-sm font-medium text-gray-500 dark:text-[#71767B] cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Password */}
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Cambiar Contraseña</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Nueva Contraseña</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-[#71767B] uppercase tracking-wider mb-1.5">Confirmar Contraseña</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repetir contraseña"
                    className="w-full rounded-lg border border-gray-200 dark:border-[#2F3336] bg-gray-50 dark:bg-[#202327] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500">Las contraseñas no coinciden</p>
              )}
              <div className="flex justify-end">
                <button
                  onClick={handleChangePassword}
                  disabled={!newPassword || !confirmPassword || saving || newPassword !== confirmPassword}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] px-4 py-2 text-sm font-bold text-gray-600 dark:text-[#E7E9EA] hover:bg-gray-50 dark:hover:bg-[#1D1F23] transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Cambiar Contraseña
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveProfile}
              disabled={saving || !nombre}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar Cambios
            </button>
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2F3336] bg-white dark:bg-[#16181C] shadow-sm">
            <div className="border-b border-gray-100 dark:border-[#2F3336] px-6 py-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-[#E7E9EA]">Resumen</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs text-gray-400 dark:text-[#71767B]">Rol</p>
                <p className="text-sm font-bold text-gray-900 dark:text-[#E7E9EA]">{rolLabels[user.rol] || user.rol}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-[#71767B]">Estado</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Activo
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-[#71767B]">Fecha de Registro</p>
                <p className="text-sm font-medium text-gray-700 dark:text-[#E7E9EA]">{formatDate(user.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-[#71767B]">Último Acceso</p>
                <p className="text-sm font-medium text-gray-700 dark:text-[#E7E9EA]">{formatTime(user.last_sign_in_at)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AvatarCropModal
        isOpen={cropModalOpen}
        onClose={() => setCropModalOpen(false)}
        imageSrc={selectedImageSrc}
        onCropComplete={handleCropComplete}
      />
    </>
  );
}
