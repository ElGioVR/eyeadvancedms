import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('cobros')
    .select(`
      *,
      pacientes:paciente_id (nombre_completo),
      doctores:doctor_id (nombre_completo),
      aseguranzas:aseguranza_id (nombre)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data.map((c) => ({
    id: c.id,
    paciente: (c.pacientes as any)?.nombre_completo || '',
    doctor: (c.doctores as any)?.nombre_completo || '',
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
  }));

  return NextResponse.json(result);
}

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
