import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { generarUrlFirmada, eliminarArchivoDeStorage } from '@/lib/storage-cirugia';
import { verificarPermisoArchivo } from '@/lib/permisos-archivo';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; archivoId: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const permisoDescargar = await verificarPermisoArchivo(auth.user.id, 'descargar');
  if (!permisoDescargar.permitido) {
    return NextResponse.json({ error: 'No tienes permiso para descargar archivos' }, { status: 403 });
  }

  const { id, archivoId } = await params;
  const supabase = getSupabaseAdmin();

  const { data: archivo, error } = await supabase
    .from('cirugia_archivos')
    .select('id, nombre_original, mime_type, size, tipo_documento, uploaded_by, created_at, storage_path')
    .eq('id', archivoId)
    .eq('cirugia_id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !archivo) {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
  }

  const url = await generarUrlFirmada(archivo.storage_path, 3600);
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
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const permisoEliminar = await verificarPermisoArchivo(auth.user.id, 'eliminar');
  if (!permisoEliminar.permitido) {
    return NextResponse.json({ error: 'No tienes permiso para eliminar archivos' }, { status: 403 });
  }

  const { id, archivoId } = await params;
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
    .eq('id', archivoId);

  if (updateError) {
    return NextResponse.json({ error: 'Error al eliminar el archivo' }, { status: 500 });
  }

  // Borrar el binario del bucket (el soft-delete conserva el registro en BD)
  try {
    await eliminarArchivoDeStorage(archivo.storage_path);
  } catch {
    // El registro ya está eliminado lógicamente; el huérfano se purga manualmente
    console.error('[archivos.eliminar] No se pudo borrar del storage:', archivo.storage_path);
  }

  // AUD-002/003: historial de archivo eliminado (borrado lógico)
  await supabase.from('cirugia_historial').insert({
    cirugia_id: id,
    usuario_id: auth.user.id,
    accion: 'ARCHIVO_ELIMINADO',
    detalle: {
      archivo_id: archivo.id,
      nombre_original: archivo.nombre_original,
      tipo_documento: archivo.tipo_documento,
      storage_path: archivo.storage_path,
    },
  });

  return NextResponse.json({ success: true });
}
