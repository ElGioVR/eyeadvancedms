import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const baseSchema = z.object({
  aseguranza_id: z.string().uuid(),
  porcentaje_cobertura: z.number().min(0).max(100),
  monto_maximo: z.number().min(0).max(99999999.99).optional().nullable(),
  aplica_estudios: z.boolean().optional(),
  aplica_procedimientos: z.boolean().optional(),
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
    .from('coberturas_aseguranza')
    .select(`
      *,
      aseguranzas:aseguranza_id (nombre)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  const result = (data || []).map((c) => ({
    ...c,
    aseguranza_nombre: (c.aseguranzas as any)?.nombre || '',
  }));

  return NextResponse.json(result);
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

  const { data: exists } = await supabase
    .from('coberturas_aseguranza')
    .select('id')
    .eq('aseguranza_id', validation.data.aseguranza_id)
    .maybeSingle();

  if (exists) {
    return NextResponse.json({ error: 'Ya existe una cobertura para esta aseguranza' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('coberturas_aseguranza')
    .insert(validation.data)
    .select()
    .single();

  if (error) {
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
    .from('coberturas_aseguranza')
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
    .from('coberturas_aseguranza')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
