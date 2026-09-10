import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const updateSchema = z.object({
  id: z.string().uuid(),
  costo: z.number().min(0).max(99999999.99).optional(),
  descripcion: z.string().optional().nullable(),
  activo: z.boolean().optional(),
}).strict();

const createSchema = z.object({
  tipo_consulta: z.enum(['CONSULTA', 'ESTUDIO', 'REVISION', 'PROCEDIMIENTO']),
  tipo_visita: z.enum(['PRIMERA_VEZ', 'SUBSECUENTE']),
  costo: z.number().min(0).max(99999999.99),
  descripcion: z.string().optional().nullable(),
}).strict();

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('matriz_costos')
    .select('id, tipo_consulta, tipo_visita, costo, descripcion, activo')
    .order('tipo_consulta', { ascending: true });

  if (error) {
    console.error('matriz_costos GET error:', error.message, error.code, error.details);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = createSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0]?.message || 'Datos inválidos' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('matriz_costos')
    .insert(validation.data)
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate key')) {
      return NextResponse.json({ error: 'Ya existe un costo para esa combinación de tipo y visita' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = updateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0]?.message || 'Datos inválidos' }, { status: 400 });
  }

  const { id, ...updates } = validation.data;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('matriz_costos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('matriz_costos')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
