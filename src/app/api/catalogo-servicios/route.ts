import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const pacienteId = searchParams.get('paciente_id');

  if (!pacienteId) {
    return NextResponse.json({ error: 'paciente_id es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Resolve patient's insurance
  const { data: paciente } = await supabase
    .from('pacientes')
    .select('aseguranza_id')
    .eq('id', pacienteId)
    .maybeSingle();

  const aseguranzaId = paciente?.aseguranza_id;

  // Fetch services for patient's insurance + generic (NULL aseguranza_id) as fallback
  let query = supabase
    .from('aseguranza_servicios')
    .select('id, tipo, nombre, costo, porcentaje_cobertura')
    .eq('activo', true)
    .order('nombre');

  if (aseguranzaId) {
    query = query.or(`aseguranza_id.eq.${aseguranzaId},aseguranza_id.is.null`);
  }

  const { data: servicios, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    aseguranza_id: aseguranzaId,
    servicios: servicios || [],
  });
}
