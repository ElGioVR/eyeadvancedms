import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

export const BUCKET_CIRUGIAS = 'cirugias';
export const MAX_TAMANO_ARCHIVO = 10 * 1024 * 1024; // 10 MB
export const MAX_ARCHIVOS_POR_CIRUGIA = 20;

export const EXTENSIONES_PERMITIDAS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
export const MIME_PERMITIDOS: Record<string, string[]> = {
  pdf: ['application/pdf'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
};

export interface ArchivoValidado {
  nombreOriginal: string;
  nombreStorage: string;
  storagePath: string;
  mimeType: string;
  size: number;
}

function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .toLowerCase();
}

function extensionDe(nombre: string): string | null {
  const partes = nombre.split('.');
  if (partes.length < 2) return null;
  return partes.pop()?.toLowerCase() || null;
}

export function validarArchivo(
  file: File,
  opciones: { maxBytes?: number; permitirVacios?: boolean } = {}
): { valido: true } | { valido: false; error: string } {
  const maxBytes = opciones.maxBytes ?? MAX_TAMANO_ARCHIVO;

  if (!file || file.size === 0) {
    return { valido: false, error: 'El archivo es obligatorio' };
  }

  if (file.size > maxBytes) {
    return {
      valido: false,
      error: `El archivo excede el tamaño máximo permitido (${Math.round(maxBytes / 1024 / 1024)} MB)`,
    };
  }

  const ext = extensionDe(file.name);
  if (!ext || !EXTENSIONES_PERMITIDAS.includes(ext)) {
    return {
      valido: false,
      error: `Formato no permitido. Use: ${EXTENSIONES_PERMITIDAS.join(', ')}`,
    };
  }

  const permitidos = MIME_PERMITIDOS[ext] || [];
  if (!permitidos.includes(file.type)) {
    return {
      valido: false,
      error: `El tipo MIME del archivo no coincide con su extensión (${ext})`,
    };
  }

  return { valido: true };
}

export async function subirArchivoACirugia(
  cirugiaId: string,
  file: File,
  usuarioId: string
): Promise<{ ok: true; datos: ArchivoValidado } | { ok: false; error: string }> {
  const validacion = validarArchivo(file);
  if (!validacion.valido) {
    return { ok: false, error: validacion.error };
  }

  const supabase = getSupabaseAdmin();

  // Validar límite de cantidad de archivos activos
  const { count, error: countError } = await supabase
    .from('cirugia_archivos')
    .select('*', { count: 'exact', head: true })
    .eq('cirugia_id', cirugiaId)
    .is('deleted_at', null);

  if (countError) {
    return { ok: false, error: 'Error al verificar archivos existentes' };
  }

  if ((count || 0) >= MAX_ARCHIVOS_POR_CIRUGIA) {
    return {
      ok: false,
      error: `Límite de ${MAX_ARCHIVOS_POR_CIRUGIA} archivos por cirugía alcanzado`,
    };
  }

  const ext = extensionDe(file.name) as string;
  const nombreOriginal = file.name;
  const nombreStorage = `${randomUUID()}_${normalizarNombre(nombreOriginal)}`;
  const storagePath = `${cirugiaId}/${nombreStorage}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_CIRUGIAS)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return { ok: false, error: uploadError.message || 'Error al subir archivo a Storage' };
  }

  return {
    ok: true,
    datos: {
      nombreOriginal,
      nombreStorage,
      storagePath,
      mimeType: file.type,
      size: file.size,
    },
  };
}

export async function eliminarArchivoDeStorage(storagePath: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.storage.from(BUCKET_CIRUGIAS).remove([storagePath]);
}

export async function generarUrlFirmada(
  storagePath: string,
  expiresInSeconds = 3600
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(BUCKET_CIRUGIAS)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message || 'Error al generar URL firmada' };
  }

  return { ok: true, url: data.signedUrl };
}
