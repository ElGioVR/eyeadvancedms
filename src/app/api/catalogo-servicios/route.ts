import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';
import { leerQuery, uuid } from '@/lib/api/validar';

const querySchema = z.object({
  // IDs no UUID se ignoran (antes: aseguranza_id se descartaba en silencio y un
  // paciente_id inválido hacía fallar la lectura del paciente)
  paciente_id: uuid.optional().catch(undefined),
  aseguranza_id: uuid.optional().catch(undefined),
  // Tipo desconocido → sin filtro (como antes)
  tipo: z.enum(['ESTUDIO', 'PROCEDIMIENTO', 'CONSULTA']).optional().catch(undefined),
  q: z.string().max(100).optional(),
});

/** Máximo de servicios devueltos (catálogo de una aseguranza + genéricos). */
const MAX_SERVICIOS = 1000;

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const filtros = leerQuery(request, querySchema);
  if (filtros instanceof NextResponse) return filtros;
  const { paciente_id: pacienteId, tipo, q } = filtros;

  if (!pacienteId && !filtros.aseguranza_id) {
    return NextResponse.json({ error: 'paciente_id o aseguranza_id es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Solo UUID válidos: el valor se interpola en un filtro .or()
  let aseguranzaId = filtros.aseguranza_id ?? null;

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
    .order('nombre')
    .limit(MAX_SERVICIOS);

  if (aseguranzaId) {
    query = query.or(`aseguranza_id.eq.${aseguranzaId},aseguranza_id.is.null`);
  }

  if (tipo) {
    query = query.eq('tipo', tipo);
  }

  const termino = q?.trim();
  if (termino) {
    // Escapa comodines de ILIKE y la barra invertida
    query = query.ilike('nombre', `%${termino.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }

  const { data: servicios, error } = await query;

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'catalogo-servicios.listar').mensaje }, { status: 500 });
  }

  return NextResponse.json({
    aseguranza_id: aseguranzaId,
    servicios: servicios || [],
  });
}
