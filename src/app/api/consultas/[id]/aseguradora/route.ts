import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { validarId } from '@/lib/api/validar';

type Embed<T> = T | T[] | null | undefined;
function primero<T>(v: Embed<T>): T | null {
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const idError = validarId(id, 'ID de consulta');
  if (idError) return idError;
  const supabase = getSupabaseAdmin();

  // Consulta → paciente → aseguradora en un solo viaje (antes: 2 en serie)
  const { data: consulta } = await supabase
    .from('consultas')
    .select('paciente_id, pacientes:paciente_id (aseguranza_id, aseguradoras:aseguranza_id (id, nombre))')
    .eq('id', id)
    .maybeSingle();

  if (!consulta) {
    return NextResponse.json({ error: 'Consulta no encontrada' }, { status: 404 });
  }

  const paciente = primero(
    (consulta as { pacientes?: Embed<{ aseguranza_id: string | null; aseguradoras?: Embed<{ id: string; nombre: string }> }> }).pacientes,
  );

  if (!paciente?.aseguranza_id) {
    return NextResponse.json({ aseguradora: null, cobertura: null, servicios: [] });
  }

  const aseguradora = primero(paciente.aseguradoras);

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
