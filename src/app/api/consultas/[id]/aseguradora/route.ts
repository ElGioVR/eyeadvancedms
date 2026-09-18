import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: consulta } = await supabase
    .from('consultas')
    .select('paciente_id')
    .eq('id', id)
    .maybeSingle();

  if (!consulta) {
    return NextResponse.json({ error: 'Consulta no encontrada' }, { status: 404 });
  }

  const { data: paciente } = await supabase
    .from('pacientes')
    .select('aseguranza_id, aseguradoras:aseguranza_id (id, nombre)')
    .eq('id', consulta.paciente_id)
    .maybeSingle();

  if (!paciente?.aseguranza_id) {
    return NextResponse.json({ aseguradora: null, cobertura: null, servicios: [] });
  }

  const aseguradora = Array.isArray(paciente.aseguradoras) ? paciente.aseguradoras[0] : paciente.aseguradoras;

  const { data: cobertura } = await supabase
    .from('coberturas_aseguranza')
    .select('porcentaje_cobertura, copago_fijo, monto_maximo, aplica_estudios, aplica_procedimientos')
    .eq('aseguranza_id', paciente.aseguranza_id)
    .eq('activo', true)
    .maybeSingle();

  return NextResponse.json({
    aseguradora: aseguradora ? { id: aseguradora.id, nombre: aseguradora.nombre } : null,
    cobertura: cobertura || null,
    servicios: [],
  });
}
