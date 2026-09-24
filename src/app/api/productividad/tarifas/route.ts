import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const tarifaSchema = z.object({
  doctor_id: z.string().uuid(),
  tipo_concepto: z.enum(['ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA']),
  concepto_id: z.string().uuid().optional().nullable(),
  rol: z.enum(['PRINCIPAL', 'AYUDANTE', 'ANESTESIOLOGO', 'INTERPRETACION', 'REFERIDOR']).optional(),
  tipo_calculo: z.enum(['FIJO', 'PORCENTAJE']),
  valor: z.number().min(0),
  moneda: z.enum(['PESOS', 'DOLARES']).optional(),
  vigente_desde: z.string(),
  vigente_hasta: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const doctorId = searchParams.get('doctor_id') || undefined;
  const tipoConcepto = searchParams.get('tipo_concepto') || undefined;

  const supabase = getSupabaseAdmin();
  let query = supabase.from('tarifas_doctor').select(`*, doctores:doctor_id(nombre_completo, especialidad)`).order('vigente_desde', { ascending: false });
  if (doctorId) query = query.eq('doctor_id', doctorId);
  if (tipoConcepto) query = query.eq('tipo_concepto', tipoConcepto);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Error al obtener tarifas' }, { status: 500 });

  const result = (data || []).map((t) => ({
    ...t,
    doctor_nombre: (t.doctores as Record<string, unknown>)?.nombre_completo || '',
    doctores: undefined,
  }));

  return NextResponse.json(result);
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

  const validation = tarifaSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0]?.message || 'Datos inválidos' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('tarifas_doctor')
    .insert({
      doctor_id: validation.data.doctor_id,
      tipo_concepto: validation.data.tipo_concepto,
      concepto_id: validation.data.concepto_id || null,
      rol: validation.data.rol || 'PRINCIPAL',
      tipo_calculo: validation.data.tipo_calculo,
      valor: validation.data.valor,
      moneda: validation.data.moneda || 'PESOS',
      vigente_desde: validation.data.vigente_desde,
      vigente_hasta: validation.data.vigente_hasta || null,
      creado_por: auth.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Error al crear tarifa' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
