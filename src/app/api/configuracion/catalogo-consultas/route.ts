import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { idDeQuery, monto, respuestaErrorDb, textoLargo } from '@/lib/api/configuracion';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';
import { existeNombre } from '@/lib/api/catalogo-nombres';

const TABLA = 'catalogo_consultas';
const CONTEXTO = 'configuracion/catalogo-consultas';

const baseSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  descripcion: textoLargo.optional().nullable(),
  costo: monto,
  activo: z.boolean().optional(),
}).strict();

const updateSchema = z.object({
  id: z.string().uuid(),
}).merge(baseSchema.partial()).strict();

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLA)
    .select('id, nombre, descripcion, costo, activo')
    .order('nombre', { ascending: true })
    .limit(2000);

  if (error) return respuestaErrorDb(error, CONTEXTO);
  return NextResponse.json(data);
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const body = await leerJSON(request, baseSchema);
  if (body instanceof NextResponse) return body;

  if (await existeNombre(TABLA, body.nombre)) {
    return NextResponse.json({ error: 'Ya existe una consulta con ese nombre' }, { status: 409 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from(TABLA).insert(body).select().single();
  if (error) return respuestaErrorDb(error, CONTEXTO, { duplicado: 'Ya existe una consulta con ese nombre' });

  return NextResponse.json(data, { status: 201 });
}

async function manejarPUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const body = await leerJSON(request, updateSchema);
  if (body instanceof NextResponse) return body;

  const { id, ...updates } = body;
  if (updates.nombre && (await existeNombre(TABLA, updates.nombre, { excluirId: id }))) {
    return NextResponse.json({ error: 'Ya existe una consulta con ese nombre' }, { status: 409 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLA)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return respuestaErrorDb(error, CONTEXTO, { noEncontrado: 'Consulta no encontrada', duplicado: 'Ya existe una consulta con ese nombre' });
  return NextResponse.json(data);
}

async function manejarDELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const id = idDeQuery(request, 'ID requerido');
  if (id instanceof NextResponse) return id;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from(TABLA).delete().eq('id', id);
  if (error) return respuestaErrorDb(error, CONTEXTO, { referencia: 'No se puede eliminar: la consulta está en uso' });

  return NextResponse.json({ success: true });
}

export const GET = ruta('configuracion/catalogo-consultas#GET', manejarGET);
export const POST = ruta('configuracion/catalogo-consultas#POST', manejarPOST);
export const PUT = ruta('configuracion/catalogo-consultas#PUT', manejarPUT);
export const DELETE = ruta('configuracion/catalogo-consultas#DELETE', manejarDELETE);
