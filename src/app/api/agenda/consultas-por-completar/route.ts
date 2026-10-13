import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { puedeGestionarAgenda } from '@/lib/permisos-agenda';
import { errorInterno } from '@/lib/api/validar';
import { ruta } from '@/lib/api/ruta';
import { faltantesConsulta } from '@/lib/por-completar';

/*
 * Consultas (y estudios/procedimientos) activas con datos faltantes: sin hora de ingreso,
 * sin doctor o sin aseguradora. Complementa la lista de cirugías por completar de la bandeja.
 */

export const dynamic = 'force-dynamic';

const LIMITE = 500;

interface FilaConsulta {
  id: string;
  folio: string | null;
  fecha: string;
  hora_inicio: string | null;
  tipo_consulta: string | null;
  tipo_visita: string | null;
  estatus: string | null;
  doctor_id: string | null;
  aseguranza_id: string | null;
  pacientes: { nombre_completo: string | null } | Array<{ nombre_completo: string | null }> | null;
}

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  if (!auth.perfil?.activo || !puedeGestionarAgenda(auth.perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('consultas')
    .select('id, folio, fecha, hora_inicio, tipo_consulta, tipo_visita, estatus, doctor_id, aseguranza_id, pacientes:paciente_id (nombre_completo)')
    .in('estatus', ['BORRADOR', 'AGENDADA', 'REAGENDADA', 'APLAZADA'])
    .or('hora_inicio.is.null,doctor_id.is.null,aseguranza_id.is.null')
    .order('fecha', { ascending: false })
    .limit(LIMITE);
  if (error) return errorInterno(error, 'agenda.consultas-por-completar');

  const filas = ((data ?? []) as unknown as FilaConsulta[]).map((c) => {
    const p = Array.isArray(c.pacientes) ? c.pacientes[0] : c.pacientes;
    return {
      id: c.id,
      folio: c.folio,
      fecha: c.fecha,
      hora: c.hora_inicio,
      tipo_consulta: c.tipo_consulta,
      tipo_visita: c.tipo_visita,
      estatus: c.estatus,
      paciente: p?.nombre_completo ?? null,
      faltan: faltantesConsulta(c),
    };
  }).filter((c) => c.faltan.length > 0);
  return NextResponse.json({ data: filas });
}

export const GET = ruta('agenda/consultas-por-completar#GET', manejarGET);
