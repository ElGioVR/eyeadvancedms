import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

export const BUCKET_CIRUGIAS = 'cirugias';
export const MAX_TAMANO_ARCHIVO = 10 * 1024 * 1024; // 10 MB
export const MAX_ARCHIVOS_POR_CIRUGIA = 20;
/** Vigencia de las URLs firmadas de descarga/vista previa (corta: se usan al instante). */
export const URL_FIRMADA_TTL_S = 300;
export const MAX_LARGO_NOMBRE = 200;

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
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+/, '')
    .toLowerCase()
    .slice(-100);
}

/** Nombre visible: sin rutas, sin caracteres de control y con largo acotado. */
function limpiarNombreOriginal(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() || '';
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(-MAX_LARGO_NOMBRE);
}

/** Firma binaria («magic bytes») esperada por extensión: el MIME del navegador no es confiable. */
function firmaCoincide(ext: string, bytes: Uint8Array): boolean {
  function empieza(firma: number[], desde = 0) {
    return firma.every((b, i) => bytes[desde + i] === b);
  }
  if (ext === 'pdf') return empieza([0x25, 0x50, 0x44, 0x46]); // %PDF
  if (ext === 'jpg' || ext === 'jpeg') return empieza([0xff, 0xd8, 0xff]);
  if (ext === 'png') return empieza([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (ext === 'webp') return empieza([0x52, 0x49, 0x46, 0x46]) && empieza([0x57, 0x45, 0x42, 0x50], 8); // RIFF....WEBP
  return false;
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

  // Nombre: sin rutas («/», «\\», «..») ni caracteres de control, largo acotado.
  const nombre = typeof file.name === 'string' ? file.name : '';
  if (
    !nombre ||
    nombre.length > MAX_LARGO_NOMBRE ||
    /[\\/]/.test(nombre) ||
    nombre.includes('..') ||
    /[\u0000-\u001f\u007f]/.test(nombre)
  ) {
    return { valido: false, error: 'Nombre de archivo no permitido' };
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

  const ext = extensionDe(file.name) || '';

  // El contenido debe corresponder a la extensión (no basta el MIME declarado).
  const cabecera = await file
    .slice(0, 16)
    .arrayBuffer()
    .then((b) => new Uint8Array(b))
    .catch(() => null);
  if (!cabecera) {
    return { ok: false, error: 'No se pudo leer el archivo' };
  }
  if (!firmaCoincide(ext, cabecera)) {
    return { ok: false, error: `El contenido del archivo no corresponde a su extensión (${ext})` };
  }

  const nombreOriginal = limpiarNombreOriginal(file.name) || `archivo.${ext}`;
  const nombreStorage = `${randomUUID()}_${normalizarNombre(nombreOriginal) || `archivo.${ext}`}`;
  const storagePath = `${cirugiaId}/${nombreStorage}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_CIRUGIAS)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    // No se expone el mensaje interno de Storage al cliente.
    console.error('[storage-cirugia.subir]', uploadError);
    return { ok: false, error: 'Error al subir archivo a Storage' };
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
  if (!storagePath || storagePath.includes('..') || storagePath.startsWith('/')) return;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(BUCKET_CIRUGIAS).remove([storagePath]);
  // Antes el error se ignoraba en silencio: ahora lo ven los llamadores (que ya lo capturan).
  if (error) throw error;
}

export async function generarUrlFirmada(
  storagePath: string,
  expiresInSeconds = URL_FIRMADA_TTL_S
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // Rutas internas únicamente: «<cirugiaId>/<archivo>» sin segmentos «..».
  if (!storagePath || storagePath.includes('..') || storagePath.startsWith('/')) {
    return { ok: false, error: 'Ruta de archivo no válida' };
  }
  const ttl = Math.min(Math.max(Math.floor(expiresInSeconds) || URL_FIRMADA_TTL_S, 30), 3600);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(BUCKET_CIRUGIAS)
    .createSignedUrl(storagePath, ttl);

  if (error || !data?.signedUrl) {
    if (error) console.error('[storage-cirugia.urlFirmada]', error);
    return { ok: false, error: 'Error al generar URL firmada' };
  }

  return { ok: true, url: data.signedUrl };
}
