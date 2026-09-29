import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { idDeQuery, monto, respuestaErrorDb, textoLargo } from '@/lib/api/configuracion';
import { z } from 'zod';

const TABLA = 'catalogo_procedimientos';
const CONTEXTO = 'configuracion/catalogo-procedimientos';

const baseSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  descripcion: textoLargo.optional().nullable(),
  costo: monto,
  por_ojo: z.boolean().optional(),
  activo: z.boolean().optional(),
}).strict();

const createSchema = baseSchema;

const updateSchema = z.object({
  id: z.string().uuid(),
}).merge(baseSchema.partial()).strict();

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLA)
    .select('id, nombre, descripcion, costo, por_ojo, activo')
    .order('nombre', { ascending: true })
    .limit(2000);

  if (error) return respuestaErrorDb(error, CONTEXTO);

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const body = await leerJSON(request, createSchema);
  if (body instanceof NextResponse) return body;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLA)
    .insert(body)
    .select()
    .single();

  if (error) return respuestaErrorDb(error, CONTEXTO);

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const body = await leerJSON(request, updateSchema);
  if (body instanceof NextResponse) return body;

  const { id, ...updates } = body;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(TABLA)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return respuestaErrorDb(error, CONTEXTO, { noEncontrado: 'Procedimiento no encontrado' });

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const id = idDeQuery(request, 'ID requerido');
  if (id instanceof NextResponse) return id;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from(TABLA)
    .delete()
    .eq('id', id);

  if (error) {
    return respuestaErrorDb(error, CONTEXTO, { referencia: 'No se puede eliminar: el procedimiento está en uso' });
  }

  return NextResponse.json({ success: true });
}
