'use client';

import { useCallback, useRef, useState } from 'react';
import { refreshUser } from '@/hooks/useUser';
import { enviarJSON } from '@/lib/fetcher';

// supabase-js solo se descarga al subir/eliminar una foto.
const getSupabaseBrowser = async () => (await import('@/lib/supabase/client')).createClient();

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

  const guardarUrl = useCallback(async (avatarUrl: string | null) => {
    try {
      await enviarJSON('/api/configuracion/usuarios', 'PATCH', { id: userId, avatar_url: avatarUrl });
    } catch (err) {
      throw new Error(err instanceof Error && err.message ? err.message : 'No se pudo guardar la foto');
    }
  }, [userId]);

  const onCropComplete = useCallback(async (blob: Blob) => {
    if (!userId || uploading) return;
    setUploading(true);
    try {
      const supabase = await getSupabaseBrowser();
      const filePath = `avatars/${userId}/avatar.jpg`;
      const { error } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      // La ruta no cambia al reemplazar la foto: el parámetro evita que el
      // navegador/CDN siga mostrando la imagen anterior.
      const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      await guardarUrl(avatarUrl);
      setAvatarPreview(avatarUrl);
      notificar('Foto de perfil actualizada');
      // Solo se refresca el perfil compartido (avatar en Sidebar/TopBar), sin recargar la pantalla.
      await refreshUser();
    } catch (err) {
      notificar(err instanceof Error ? err.message : 'Error al subir la imagen', 'error');
    } finally {
      setUploading(false);
    }
  }, [userId, uploading, guardarUrl, notificar]);

  const eliminar = useCallback(async () => {
    if (!userId || uploading) return;
    setUploading(true);
    try {
      const supabase = await getSupabaseBrowser();
      await supabase.storage.from('avatars').remove([`avatars/${userId}/avatar.jpg`]);
      await guardarUrl(null);
      setAvatarPreview(null);
      notificar('Foto de perfil eliminada');
      // Solo se refresca el perfil compartido (avatar en Sidebar/TopBar), sin recargar la pantalla.
      await refreshUser();
    } catch (err) {
      notificar(err instanceof Error ? err.message : 'Error al eliminar la imagen', 'error');
    } finally {
      setUploading(false);
    }
  }, [userId, uploading, guardarUrl, notificar]);

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
