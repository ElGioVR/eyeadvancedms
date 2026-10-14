import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { invalidarPerfil, requireAuth } from '@/lib/supabase/server';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { ruta } from '@/lib/api/ruta';

/**
 * Foto de perfil propia. Se sube desde el servidor con la llave de servicio:
 * el navegador ya no escribe en Storage, así que no depende de las políticas RLS
 * de `storage.objects` (error «new row violates row-level security policy»).
 *
 *   POST   multipart/form-data { file } → sube y guarda `usuarios.avatar_url`
 *   DELETE                              → borra la foto y limpia `avatar_url`
 */

const BUCKET = 'avatars';
const MAX_BYTES = 500 * 1024;
const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

const rutaArchivo = (userId: string) => `avatars/${userId}/avatar.jpg`;

async function asegurarBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES });
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Imagen no válida' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 });
  if (!TIPOS.includes(file.type)) return NextResponse.json({ error: 'Formato no permitido. Usa JPEG, PNG o WebP' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'La imagen no puede superar 500KB' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  await asegurarBucket(supabase);
  const ruta = rutaArchivo(auth.user.id);
  const { error: errSubida } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (errSubida) {
    return NextResponse.json({ error: handleSupabaseError(errSubida as never, 'usuarios.avatar.subir').mensaje }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  // La ruta no cambia al reemplazar la foto: el parámetro evita la caché del navegador/CDN.
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
  const { error: errPerfil } = await supabase.from('usuarios').update({ avatar_url: avatarUrl }).eq('id', auth.user.id);
  if (errPerfil) {
    return NextResponse.json({ error: handleSupabaseError(errPerfil, 'usuarios.avatar.guardar').mensaje }, { status: 500 });
  }
  invalidarPerfil(auth.user.id);
  return NextResponse.json({ avatar_url: avatarUrl });
}

async function manejarDELETE() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  await supabase.storage.from(BUCKET).remove([rutaArchivo(auth.user.id)]);
  const { error } = await supabase.from('usuarios').update({ avatar_url: null }).eq('id', auth.user.id);
  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'usuarios.avatar.eliminar').mensaje }, { status: 500 });
  }
  invalidarPerfil(auth.user.id);
  return NextResponse.json({ avatar_url: null });
}

export const POST = ruta('usuarios/me/avatar#POST', manejarPOST);
export const DELETE = ruta('usuarios/me/avatar#DELETE', manejarDELETE);
