import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON, uuid } from '@/lib/api/validar';
import { respuestaErrorDb } from '@/lib/api/configuracion';
import { ruta } from '@/lib/api/ruta';
import { faltanTablasInsumos } from '@/lib/insumos';

const nombre = z.string().trim().min(2, 'Escribe el nombre').max(80);
const crearSchema = z.object({ nombre }).strict();
const editarSchema = z.object({ id: uuid, nombre: nombre.optional(), activa: z.boolean().optional() }).strict();

/** Alta y edición de ubicaciones (Consultorio, CINTAR…). Solo admin y recepción. No se borran: se desactivan. */
async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const err = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (err) return err;
  const body = await leerJSON(request, crearSchema);
  if (body instanceof NextResponse) return body;

  const supabase = getSupabaseAdmin();
  const { data: ult } = await supabase.from('insumo_ubicaciones').select('orden').order('orden', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from('insumo_ubicaciones').insert({ nombre: body.nombre, orden: (ult?.orden ?? 0) + 1 }).select('id, nombre, activa, orden').single();
  if (faltanTablasInsumos(error)) return NextResponse.json({ error: 'Falta instalar el inventario de insumos.' }, { status: 503 });
  if (error) return respuestaErrorDb(error, 'inventario.insumos.ubicaciones', { duplicado: 'Ya existe una ubicación con ese nombre' });
  return NextResponse.json({ ubicacion: data }, { status: 201 });
}

async function manejarPATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const err = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (err) return err;
  const body = await leerJSON(request, editarSchema);
  if (body instanceof NextResponse) return body;
  const { id, ...cambios } = body;
  if (Object.keys(cambios).length === 0) return NextResponse.json({ ok: true });

  const { error } = await getSupabaseAdmin().from('insumo_ubicaciones').update(cambios).eq('id', id);
  if (error) return respuestaErrorDb(error, 'inventario.insumos.ubicaciones', { duplicado: 'Ya existe una ubicación con ese nombre' });
  return NextResponse.json({ ok: true });
}

export const POST = ruta('inventario/insumos/ubicaciones#POST', manejarPOST);
export const PATCH = ruta('inventario/insumos/ubicaciones#PATCH', manejarPATCH);
