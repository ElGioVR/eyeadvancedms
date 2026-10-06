import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { eliminarArchivoDeStorage, MAX_TAMANO_ARCHIVO, subirArchivoACirugia } from '@/lib/storage-cirugia';
import { verificarPermisoArchivo } from '@/lib/permisos-archivo';
import { validarId } from '@/lib/api/validar';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { ruta } from '@/lib/api/ruta';

/** Margen del multipart (boundary + tipo_documento) sobre el tamaño máximo del archivo. */
const MARGEN_MULTIPART = 64 * 1024;

async function manejarGET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const supabase = getSupabaseAdmin();

  // Lectura en paralelo con el permiso; si se deniega, el resultado se descarta.
  // No se exponen storage_path / nombre_storage (estructura interna del bucket).
  const listadoP = Promise.resolve(
    supabase
      .from('cirugia_archivos')
      .select('id, cirugia_id, nombre_original, mime_type, size, tipo_documento, uploaded_by, created_at')
      .eq('cirugia_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
  );
  const permisoListar = await verificarPermisoArchivo(auth.user.id, 'ver');
  if (!permisoListar.permitido) {
    void listadoP.catch(() => undefined);
    return NextResponse.json({ error: 'No tienes permiso para ver archivos' }, { status: 403 });
  }

  const { data, error } = await listadoP;

  if (error) {
    handleSupabaseError(error, 'cirugias.archivos.listar');
    return NextResponse.json({ error: 'Error al listar archivos' }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

async function manejarPOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const supabase = getSupabaseAdmin();

  // Verificar que la cirugía existe (solo lectura, en paralelo con el permiso)
  const cirugiaP = Promise.resolve(
    supabase
      .from('agenda_cirugias')
      .select('id, codigo')
      .eq('id', id)
      .maybeSingle()
  );
  const permisoSubir = await verificarPermisoArchivo(auth.user.id, 'subir');
  if (!permisoSubir.permitido) {
    void cirugiaP.catch(() => undefined);
    return NextResponse.json({ error: 'No tienes permiso para subir archivos' }, { status: 403 });
  }

  const { data: cirugia, error: cirugiaError } = await cirugiaP;

  if (cirugiaError || !cirugia) {
    return NextResponse.json({ error: 'Cirugía no encontrada' }, { status: 404 });
  }

  // Rechazo temprano por tamaño/tipo declarado, antes de leer el multipart a memoria.
  const largo = Number(request.headers.get('content-length') || 0);
  if (largo > MAX_TAMANO_ARCHIVO + MARGEN_MULTIPART) {
    return NextResponse.json(
      { error: `El archivo excede el tamaño máximo permitido (${Math.round(MAX_TAMANO_ARCHIVO / 1024 / 1024)} MB)` },
      { status: 413 }
    );
  }
  if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400 });
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
  if (/[\u0000-\u001f\u007f<>]/.test(tipoDocumento)) {
    return NextResponse.json({ error: 'El tipo de documento contiene caracteres no permitidos' }, { status: 400 });
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
    .select('id, cirugia_id, nombre_original, mime_type, size, tipo_documento, uploaded_by, created_at')
    .single();

  if (insertError) {
    handleSupabaseError(insertError, 'cirugias.archivos.insertar');
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

export const GET = ruta('cirugias/[id]/archivos#GET', manejarGET);
export const POST = ruta('cirugias/[id]/archivos#POST', manejarPOST);
