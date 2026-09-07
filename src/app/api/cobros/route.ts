import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

export async function GET() {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const { data, error } = await supabase
    .from('cobros')
    .insert({
      consulta_id: body.consulta_id,
      paciente_id: body.paciente_id,
      aseguranza_id: body.aseguranza_id,
      metodo_pago: body.metodo_pago || 'NO_APLICA',
      monto: body.monto,
      moneda: body.moneda || 'PESOS',
      pagado: body.pagado || false,
      folio: body.folio,
      notas: body.notas,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
