import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const cobroCreateSchema = z.object({
  consulta_id: z.string().uuid(),
  paciente_id: z.string().uuid(),
  aseguranza_id: z.string().uuid().optional().nullable(),
  metodo_pago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NO_APLICA']).optional(),
  monto: z.union([z.string(), z.number()]).pipe(
    z.preprocess((val) => {
      if (typeof val === 'string') {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? undefined : parsed;
      }
      return val;
    }, z.number().min(0).max(99999999.99))
  ),
  moneda: z.enum(['PESOS', 'DOLARES']).optional(),
  pagado: z.boolean().optional(),
  folio: z.string().max(50).optional().nullable(),
  notas: z.string().optional().nullable(),
}).strict();

const errorTranslations: Record<string, string> = {
  'new row violates row-level security policy': 'No tienes permisos para realizar esta acción',
};

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('cobros')
    .select(`
      *,
      pacientes:paciente_id (nombre_completo),
      consultas:consulta_id (doctor_id, diagnostico),
      aseguranzas:aseguranza_id (nombre)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  // Resolve doctor names from consulta → doctor
  const doctorIds = [...new Set(
    (data || [])
      .map((c) => (c.consultas as any)?.doctor_id)
      .filter(Boolean)
  )];
  const doctorMap = new Map<string, string>();
  if (doctorIds.length > 0) {
    const { data: doctores } = await supabase
      .from('doctores')
      .select('id, nombre_completo')
      .in('id', doctorIds);
    (doctores || []).forEach((d) => doctorMap.set(d.id, d.nombre_completo));
  }

  const result = data.map((c) => {
    const consulta = c.consultas as any;
    const doctorId = consulta?.doctor_id;
    return {
      id: c.id,
      paciente: (c.pacientes as any)?.nombre_completo || '',
      doctor: doctorId ? doctorMap.get(doctorId) || '' : '',
      diagnostico: consulta?.diagnostico || '',
      fecha: c.fecha_pago || c.created_at,
      monto: c.monto,
      metodo_pago: c.metodo_pago,
      moneda: c.moneda,
      pagado: c.pagado,
      folio: c.folio,
      notas: c.notas,
      aseguradora: (c.aseguranzas as any)?.nombre || '',
      consulta_id: c.consulta_id,
      paciente_id: c.paciente_id,
      created_at: c.created_at,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = cobroCreateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

  // IDOR-12: Verify referenced entities exist and relational consistency
  const checks = await Promise.all([
    supabase.from('consultas').select('id, paciente_id').eq('id', data.consulta_id).maybeSingle(),
    supabase.from('pacientes').select('id').eq('id', data.paciente_id).maybeSingle(),
    data.aseguranza_id
      ? supabase.from('aseguranzas').select('id, activo').eq('id', data.aseguranza_id).maybeSingle()
      : Promise.resolve({ data: true }),
  ]);

  const [consultaCheck, pacienteCheck, aseguranzaCheck] = checks;

  if (!consultaCheck.data) {
    return NextResponse.json({ error: 'La consulta referenciada no existe' }, { status: 404 });
  }
  if (!pacienteCheck.data) {
    return NextResponse.json({ error: 'El paciente referenciado no existe' }, { status: 404 });
  }
  if (data.aseguranza_id && !aseguranzaCheck.data) {
    return NextResponse.json({ error: 'La aseguranza referenciada no existe' }, { status: 404 });
  }
  if (data.aseguranza_id && aseguranzaCheck.data && typeof aseguranzaCheck.data === 'object' && !aseguranzaCheck.data.activo) {
    return NextResponse.json({ error: 'La aseguranza seleccionada no está activa' }, { status: 400 });
  }

  // Relational consistency: paciente_id must match the patient of the referenced consulta
  if (consultaCheck.data.paciente_id !== data.paciente_id) {
    return NextResponse.json(
      { error: 'El paciente no corresponde a la consulta referenciada' },
      { status: 409 }
    );
  }

  const insertData = {
    consulta_id: data.consulta_id,
    paciente_id: data.paciente_id,
    aseguranza_id: data.aseguranza_id ?? null,
    metodo_pago: data.metodo_pago ?? 'NO_APLICA',
    monto: data.monto,
    moneda: data.moneda ?? 'PESOS',
    pagado: data.pagado ?? false,
    folio: data.folio ?? null,
    notas: data.notas ?? null,
  };

  const { data: cobro, error } = await supabase
    .from('cobros')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json(cobro, { status: 201 });
}
