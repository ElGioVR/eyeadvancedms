import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  const supabase = getSupabaseAdmin();

  const { data: paciente, error: pacienteError } = await supabase
    .from('pacientes')
    .select('id, nombre_completo, sexo, fecha_nacimiento, edad, telefono, email, aseguranza_id, numero_poliza, numero_afiliacion, created_at')
    .eq('id', id)
    .single();

  if (pacienteError || !paciente) {
    return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
  }

  const [aseguranzaResult, ultimaConsultaResult, consultasCountResult, cirugiasCountResult] = await Promise.all([
    paciente.aseguranza_id
      ? supabase.from('aseguranzas').select('id, nombre').eq('id', paciente.aseguranza_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('consultas')
      .select('fecha, diagnostico')
      .eq('paciente_id', id)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('consultas').select('id', { count: 'exact', head: true }).eq('paciente_id', id),
    supabase.from('agenda_cirugias').select('id', { count: 'exact', head: true }).eq('paciente_id', id),
  ]);

  const resumen = {
    paciente: {
      id: paciente.id,
      nombre_completo: paciente.nombre_completo,
      sexo: paciente.sexo,
      fecha_nacimiento: paciente.fecha_nacimiento,
      edad: paciente.edad,
      telefono: paciente.telefono,
      email: paciente.email,
      aseguranza_id: paciente.aseguranza_id || null,
      numero_poliza: paciente.numero_poliza,
      numero_afiliacion: paciente.numero_afiliacion,
      created_at: paciente.created_at,
    },
    aseguranza: aseguranzaResult.data,
    ultima_consulta: ultimaConsultaResult.data || null,
    consultas_previas: consultasCountResult.count || 0,
    cirugias_previas: cirugiasCountResult.count || 0,
    // Expediente: placeholder mientras no exista tabla expedientes;
    // se representa con el identificador interno del paciente.
    expediente_id: `EXP-${String(paciente.created_at ? new Date(paciente.created_at).getFullYear() : 2026).slice(-2)}${paciente.id.slice(0, 6).toUpperCase()}`,
  };

  return NextResponse.json(resumen);
}
