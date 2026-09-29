import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { generarUrlFirmada, eliminarArchivoDeStorage, URL_FIRMADA_TTL_S } from '@/lib/storage-cirugia';
import { verificarPermisoArchivo } from '@/lib/permisos-archivo';
import { validarId } from '@/lib/api/validar';
import { handleSupabaseError } from '@/lib/supabase/handle-error';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; archivoId: string }> }
) {
  const { id, archivoId } = await params;
  const idInvalido = validarId(id, 'ID de cirugía') || validarId(archivoId, 'ID de archivo');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const supabase = getSupabaseAdmin();

  // Lectura en paralelo con el permiso; si se deniega se descarta sin exponerla.
  const archivoP = Promise.resolve(
    supabase
      .from('cirugia_archivos')
      .select('id, nombre_original, mime_type, size, tipo_documento, uploaded_by, created_at, storage_path')
      .eq('id', archivoId)
      .eq('cirugia_id', id)
      .is('deleted_at', null)
      .maybeSingle()
  );
  const permisoDescargar = await verificarPermisoArchivo(auth.user.id, 'descargar');
  if (!permisoDescargar.permitido) {
    void archivoP.catch(() => undefined);
    return NextResponse.json({ error: 'No tienes permiso para descargar archivos' }, { status: 403 });
  }

  const { data: archivo, error } = await archivoP;

  if (error || !archivo) {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
  }

  // URL de corta duración (antes 3600 s = 1 h); el front la abre de inmediato.
  const url = await generarUrlFirmada(archivo.storage_path, URL_FIRMADA_TTL_S);
  if (!url.ok) {
    return NextResponse.json({ error: url.error }, { status: 500 });
  }

  // No exponer storage_path (estructura interna del bucket)
  const { storage_path: _sp, ...archivoPublico } = archivo;
  return NextResponse.json({ archivo: archivoPublico, signedUrl: url.url });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; archivoId: string }> }
) {
  const { id, archivoId } = await params;
  const idInvalido = validarId(id, 'ID de cirugía') || validarId(archivoId, 'ID de archivo');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const permisoEliminar = await verificarPermisoArchivo(auth.user.id, 'eliminar');
  if (!permisoEliminar.permitido) {
    return NextResponse.json({ error: 'No tienes permiso para eliminar archivos' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  const { data: archivo, error: findError } = await supabase
    .from('cirugia_archivos')
    .select('id, cirugia_id, nombre_original, tipo_documento, storage_path')
    .eq('id', archivoId)
    .eq('cirugia_id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (findError || !archivo) {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from('cirugia_archivos')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.user.id,
    })
    .eq('id', archivoId)
    .is('deleted_at', null);

  if (updateError) {
    handleSupabaseError(updateError, 'cirugias.archivos.eliminar');
    return NextResponse.json({ error: 'Error al eliminar el archivo' }, { status: 500 });
  }

  // Borrado del binario e historial son independientes: en paralelo (antes en serie).
  const [borrado] = await Promise.allSettled([
    // Borrar el binario del bucket (el soft-delete conserva el registro en BD)
    eliminarArchivoDeStorage(archivo.storage_path),
    // AUD-002/003: historial de archivo eliminado (borrado lógico)
    supabase.from('cirugia_historial').insert({
      cirugia_id: id,
      usuario_id: auth.user.id,
      accion: 'ARCHIVO_ELIMINADO',
      detalle: {
        archivo_id: archivo.id,
        nombre_original: archivo.nombre_original,
        tipo_documento: archivo.tipo_documento,
        storage_path: archivo.storage_path,
      },
    }),
  ]);
  if (borrado.status === 'rejected') {
    // El registro ya está eliminado lógicamente; el huérfano se purga manualmente
    console.error('[archivos.eliminar] No se pudo borrar del storage:', archivo.storage_path);
  }

  return NextResponse.json({ success: true });
}
