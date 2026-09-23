import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { eliminarArchivoDeStorage, subirArchivoACirugia } from '@/lib/storage-cirugia';
import { verificarPermisoArchivo } from '@/lib/permisos-archivo';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const permisoListar = await verificarPermisoArchivo(auth.user.id, 'ver');
  if (!permisoListar.permitido) {
    return NextResponse.json({ error: 'No tienes permiso para ver archivos' }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('cirugia_archivos')
    .select('id, cirugia_id, nombre_original, nombre_storage, mime_type, size, storage_path, tipo_documento, uploaded_by, created_at')
    .eq('cirugia_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Error al listar archivos' }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const permisoSubir = await verificarPermisoArchivo(auth.user.id, 'subir');
  if (!permisoSubir.permitido) {
    return NextResponse.json({ error: 'No tienes permiso para subir archivos' }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // Verificar que la cirugía existe
  const { data: cirugia, error: cirugiaError } = await supabase
    .from('agenda_cirugias')
    .select('id, codigo')
    .eq('id', id)
    .maybeSingle();

  if (cirugiaError || !cirugia) {
    return NextResponse.json({ error: 'Cirugía no encontrada' }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400 });
  }

  const archivo = formData.get('archivo');
  const tipoDocumento = formData.get('tipo_documento');

  if (!archivo || !(archivo instanceof File)) {
    return NextResponse.json({ error: 'El archivo es obligatorio' }, { status: 400 });
  }

  if (!tipoDocumento || typeof tipoDocumento !== 'string' || tipoDocumento.trim().length === 0) {
    return NextResponse.json({ error: 'El tipo de documento es obligatorio' }, { status: 400 });
  }

  if (tipoDocumento.trim().length > 100) {
    return NextResponse.json({ error: 'El tipo de documento es demasiado largo' }, { status: 400 });
  }

  const upload = await subirArchivoACirugia(id, archivo, auth.user.id);
  if (!upload.ok) {
    return NextResponse.json({ error: upload.error }, { status: 400 });
  }

  const { datos } = upload;

  const { data: archivoRow, error: insertError } = await supabase
    .from('cirugia_archivos')
    .insert({
      cirugia_id: id,
      nombre_original: datos.nombreOriginal,
      nombre_storage: datos.nombreStorage,
      mime_type: datos.mimeType,
      size: datos.size,
      storage_path: datos.storagePath,
      tipo_documento: tipoDocumento.trim(),
      uploaded_by: auth.user.id,
    })
    .select()
    .single();

  if (insertError) {
    // Evitar huérfano en Storage
    await eliminarArchivoDeStorage(datos.storagePath).catch(() => {});
    return NextResponse.json({ error: 'Error al guardar metadata del archivo' }, { status: 500 });
  }

  // AUD-001: historial de archivo agregado
  await supabase.from('cirugia_historial').insert({
    cirugia_id: id,
    usuario_id: auth.user.id,
    accion: 'ARCHIVO_AGREGADO',
    detalle: {
      archivo_id: archivoRow.id,
      nombre_original: datos.nombreOriginal,
      tipo_documento: tipoDocumento.trim(),
      codigo: cirugia.codigo,
    },
  });

  return NextResponse.json(archivoRow, { status: 201 });
}
