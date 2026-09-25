import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { errorTranslations } from '@/lib/supabase/errors';
import { requireAuth } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const pacienteId = searchParams.get('paciente_id');
  const aseguranzaParam = searchParams.get('aseguranza_id');
  const tipo = searchParams.get('tipo');
  const q = searchParams.get('q');

  if (!pacienteId && !aseguranzaParam) {
    return NextResponse.json({ error: 'paciente_id o aseguranza_id es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  let aseguranzaId = aseguranzaParam;

  if (!aseguranzaId && pacienteId) {
    const { data: paciente } = await supabase
      .from('pacientes')
      .select('aseguranza_id')
      .eq('id', pacienteId)
      .maybeSingle();

    aseguranzaId = paciente?.aseguranza_id ?? null;
  }

  // Fetch services for patient's insurance + generic (NULL aseguranza_id) as fallback
  let query = supabase
    .from('aseguranza_servicios')
    .select('id, tipo, nombre, costo, porcentaje_cobertura')
    .eq('activo', true)
    .order('nombre');

  if (aseguranzaId) {
    query = query.or(`aseguranza_id.eq.${aseguranzaId},aseguranza_id.is.null`);
  }

  if (tipo && ['ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA'].includes(tipo)) {
    query = query.eq('tipo', tipo);
  }

  if (q && q.trim().length > 0) {
    query = query.ilike('nombre', `%${q.trim().replace(/[%_]/g, '\\$&')}%`);
  }

  const { data: servicios, error } = await query;

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  return NextResponse.json({
    aseguranza_id: aseguranzaId,
    servicios: servicios || [],
  });
}
