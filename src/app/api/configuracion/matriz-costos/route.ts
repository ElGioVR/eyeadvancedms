import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { idDeQuery, monto, respuestaErrorDb, textoLargo } from '@/lib/api/configuracion';
import { z } from 'zod';

const updateSchema = z.object({
  id: z.string().uuid(),
  costo: monto.optional(),
  descripcion: textoLargo.optional().nullable(),
  activo: z.boolean().optional(),
}).strict();

const createSchema = z.object({
  tipo_consulta: z.enum(['CONSULTA', 'ESTUDIO', 'REVISION', 'PROCEDIMIENTO']),
  tipo_visita: z.enum(['PRIMERA_VEZ', 'SUBSECUENTE']),
  costo: monto,
  descripcion: textoLargo.optional().nullable(),
}).strict();

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('matriz_costos')
    .select('id, tipo_consulta, tipo_visita, costo, descripcion, activo')
    .order('tipo_consulta', { ascending: true })
    .limit(500);

  if (error) return respuestaErrorDb(error, 'configuracion.matriz-costos');

  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const validado = await leerJSON(request, createSchema);
  if (validado instanceof NextResponse) return validado;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('matriz_costos')
    .insert(validado)
    .select()
    .single();

  if (error) {
    return respuestaErrorDb(error, 'configuracion/matriz-costos', {
      duplicado: 'Ya existe un costo para esa combinación de tipo y visita',
    });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const validado = await leerJSON(request, updateSchema);
  if (validado instanceof NextResponse) return validado;

  const { id, ...updates } = validado;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('matriz_costos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return respuestaErrorDb(error, 'configuracion/matriz-costos', { noEncontrado: 'Costo no encontrado' });

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
    .from('matriz_costos')
    .delete()
    .eq('id', id);

  if (error) {
    return respuestaErrorDb(error, 'configuracion/matriz-costos', { referencia: 'No se puede eliminar: el costo está en uso' });
  }

  return NextResponse.json({ success: true });
}
