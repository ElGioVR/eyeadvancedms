import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { errorTranslations } from '@/lib/supabase/errors';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const createSchema = z.object({
  aseguranza_id: z.string().uuid(),
  tipo: z.enum(['ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA']),
  nombre: z.string().min(1).max(500),
  costo: z.number().min(0).default(0),
  porcentaje_cobertura: z.number().min(0).max(100).default(0),
}).strict();

const updateSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1).max(500).optional(),
  costo: z.number().min(0).optional(),
  porcentaje_cobertura: z.number().min(0).max(100).optional(),
  activo: z.boolean().optional(),
}).strict();

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const aseguranzaId = searchParams.get('aseguranza_id');
  const tipo = searchParams.get('tipo');
  const search = searchParams.get('search');

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('aseguranza_servicios')
    .select('*, aseguranzas:aseguranza_id(nombre)')
    .eq('activo', true)
    .order('nombre');

  if (aseguranzaId) query = query.eq('aseguranza_id', aseguranzaId);
  if (tipo) query = query.eq('tipo', tipo);
  if (search) query = query.ilike('nombre', `%${search.replace(/[%_]/g, (c) => '\\' + c)}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = createSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
  }

  const data = validation.data;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from('aseguranza_servicios').insert({
    aseguranza_id: data.aseguranza_id,
    tipo: data.tipo,
    nombre: data.nombre.trim(),
    nombre_norm: normalize(data.nombre),
    costo: data.costo,
    porcentaje_cobertura: data.porcentaje_cobertura,
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Este servicio ya existe para esta aseguradora' }, { status: 409 });
    }
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = updateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
  }

  const { id, ...updates } = validation.data;
  const supabase = getSupabaseAdmin();

  const updateData: Record<string, unknown> = {};
  if (updates.nombre !== undefined) { updateData.nombre = updates.nombre.trim(); updateData.nombre_norm = normalize(updates.nombre); }
  if (updates.costo !== undefined) updateData.costo = updates.costo;
  if (updates.porcentaje_cobertura !== undefined) updateData.porcentaje_cobertura = updates.porcentaje_cobertura;
  if (updates.activo !== undefined) updateData.activo = updates.activo;
  updateData.updated_at = new Date().toISOString();

  const { error } = await supabase.from('aseguranza_servicios').update(updateData).eq('id', id);
  if (error) return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
