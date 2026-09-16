import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const periodoSchema = z.object({
  codigo: z.string().min(1).max(20),
  fecha_desde: z.string(),
  fecha_hasta: z.string(),
  notas: z.string().optional(),
}).strict();

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('periodos_pago')
    .select('*')
    .order('fecha_desde', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Error al obtener períodos' }, { status: 500 });
  }

  return NextResponse.json(data);
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

  const validation = periodoSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0]?.message || 'Datos inválidos' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('periodos_pago')
    .insert(validation.data)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un período con ese código' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al crear período' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
