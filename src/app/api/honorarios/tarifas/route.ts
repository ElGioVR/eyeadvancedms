import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const tarifaSchema = z.object({
  doctor_id: z.string().uuid(),
  tipo_concepto: z.enum(['ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA']),
  concepto_id: z.string().uuid().optional().nullable(),
  rol: z.enum(['PRINCIPAL', 'AYUDANTE', 'ANESTESIOLOGO', 'INTERPRETACION', 'REFERIDOR']).optional(),
  tipo_calculo: z.enum(['FIJO', 'PORCENTAJE', 'POR_HORA']),
  valor: z.number().min(0),
  moneda: z.enum(['PESOS', 'DOLARES']).optional(),
  vigente_desde: z.string(),
  vigente_hasta: z.string().optional().nullable(),
}).strict();

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const doctorId = searchParams.get('doctor_id');
  const tipoConcepto = searchParams.get('tipo_concepto');
  const soloVigentes = searchParams.get('vigentes') === 'true';

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('tarifas_doctor')
    .select(`
      *,
      doctores:doctor_id (nombre_completo, especialidad)
    `)
    .order('vigente_desde', { ascending: false });

  if (doctorId) query = query.eq('doctor_id', doctorId);
  if (tipoConcepto) query = query.eq('tipo_concepto', tipoConcepto);
  if (soloVigentes) query = query.is('vigente_hasta', null);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Error al obtener tarifas' }, { status: 500 });
  }

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
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = tarifaSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0]?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;
  const supabase = getSupabaseAdmin();

  const { data: tarifa, error } = await supabase
    .from('tarifas_doctor')
    .insert({
      doctor_id: data.doctor_id,
      tipo_concepto: data.tipo_concepto,
      concepto_id: data.concepto_id || null,
      rol: data.rol || 'PRINCIPAL',
      tipo_calculo: data.tipo_calculo,
      valor: data.valor,
      moneda: data.moneda || 'PESOS',
      vigente_desde: data.vigente_desde,
      vigente_hasta: data.vigente_hasta || null,
      creado_por: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Error al crear tarifa' }, { status: 500 });
  }

  return NextResponse.json(tarifa, { status: 201 });
}
