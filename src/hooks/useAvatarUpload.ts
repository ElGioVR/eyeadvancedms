'use client';

import { useCallback, useRef, useState } from 'react';
import { refreshUser } from '@/hooks/useUser';
import { enviarJSON } from '@/lib/fetcher';

export const AVATAR_MAX_SIZE = 500 * 1024;
export const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type Notificar = (mensaje: string, tipo?: 'success' | 'error') => void;

/**
 * Lógica compartida para cambiar / eliminar la foto de perfil propia
 * (selección → recorte → Storage `avatars` → PATCH /api/configuracion/usuarios).
 * Usada por /configuracion y /mi-perfil.
 */
export function useAvatarUpload(userId: string | null | undefined, notificar: Notificar) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = useState('');

  const abrirSelector = useCallback(() => fileInputRef.current?.click(), []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      notificar('Formato no permitido. Usa JPEG, PNG o WebP', 'error');
      return;
    }
    if (file.size > AVATAR_MAX_SIZE) {
      notificar('La imagen no puede superar 500KB', 'error');
      return;
    }
    setSelectedImageSrc(URL.createObjectURL(file));
    setCropModalOpen(true);
  }, [notificar]);

  const onCropComplete = useCallback(async (blob: Blob) => {
    if (!userId || uploading) return;
    setUploading(true);
    try {
      // La subida pasa por el servidor (no depende de las políticas RLS de Storage).
      const form = new FormData();
      form.append('file', new File([blob], 'avatar.jpg', { type: blob.type || 'image/jpeg' }));
      const { avatar_url: avatarUrl } = await enviarJSON<{ avatar_url: string }>('/api/usuarios/me/avatar', 'POST', form);
      setAvatarPreview(avatarUrl);
      notificar('Foto de perfil actualizada');
      // Solo se refresca el perfil compartido (avatar en Sidebar/TopBar), sin recargar la pantalla.
      await refreshUser();
    } catch (err) {
      notificar(err instanceof Error ? err.message : 'Error al subir la imagen', 'error');
    } finally {
      setUploading(false);
    }
  }, [userId, uploading, notificar]);

  const eliminar = useCallback(async () => {
    if (!userId || uploading) return;
    setUploading(true);
    try {
      await enviarJSON('/api/usuarios/me/avatar', 'DELETE');
      setAvatarPreview(null);
      notificar('Foto de perfil eliminada');
      // Solo se refresca el perfil compartido (avatar en Sidebar/TopBar), sin recargar la pantalla.
      await refreshUser();
    } catch (err) {
      notificar(err instanceof Error ? err.message : 'Error al eliminar la imagen', 'error');
    } finally {
      setUploading(false);
    }
  }, [userId, uploading, notificar]);

  return {
    fileInputRef,
    /** `undefined` = sin cambios en esta sesión (usar user.avatar_url). */
    avatarPreview,
    uploading,
    abrirSelector,
    onFileChange,
    eliminar,
    cropModal: {
      isOpen: cropModalOpen,
      onClose: () => setCropModalOpen(false),
      imageSrc: selectedImageSrc,
      onCropComplete,
    },
  };
}
