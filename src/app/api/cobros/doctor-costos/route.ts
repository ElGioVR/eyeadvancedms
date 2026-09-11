import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const doctorCostoSchema = z.object({
  consulta_id: z.string().uuid(),
  costos: z.array(z.object({
    doctor_id: z.string().uuid(),
    tipo_costo: z.enum(['CONSULTA', 'ESTUDIO', 'PROCEDIMIENTO']),
    monto: z.number().min(0),
    descripcion: z.string().optional(),
  })),
}).strict();

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const consultaId = searchParams.get('consulta_id');

  if (!consultaId) {
    return NextResponse.json({ error: 'Falta el consulta_id' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('consulta_doctor_costo')
    .select(`
      *,
      doctores:doctor_id (nombre_completo, especialidad)
    `)
    .eq('consulta_id', consultaId)
    .order('created_at');

  if (error) {
    return NextResponse.json({ error: 'Error al obtener costos' }, { status: 500 });
  }

  const result = data.map((dc) => ({
    id: dc.id,
    doctor_id: dc.doctor_id,
    doctor_nombre: (dc.doctores as any)?.nombre_completo || '',
    tipo_costo: dc.tipo_costo,
    monto: dc.monto,
    descripcion: dc.descripcion,
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = doctorCostoSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const { consulta_id, costos } = validation.data;
  const supabase = getSupabaseAdmin();

  // Verify consultation exists
  const { data: consulta } = await supabase
    .from('consultas')
    .select('id')
    .eq('id', consulta_id)
    .maybeSingle();

  if (!consulta) {
    return NextResponse.json({ error: 'La consulta no existe' }, { status: 404 });
  }

  // Delete existing costos for this consultation
  await supabase
    .from('consulta_doctor_costo')
    .delete()
    .eq('consulta_id', consulta_id);

  // Insert new costos
  if (costos.length > 0) {
    const rows = costos.map((c) => ({
      consulta_id,
      doctor_id: c.doctor_id,
      tipo_costo: c.tipo_costo,
      monto: c.monto,
      descripcion: c.descripcion || null,
    }));

    const { error: insertError } = await supabase
      .from('consulta_doctor_costo')
      .insert(rows);

    if (insertError) {
      return NextResponse.json({ error: 'Error al guardar costos' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
