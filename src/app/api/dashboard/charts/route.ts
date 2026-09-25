import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();

  const [consultasEstatus, topProcedimientos, agendaOcupacion] = await Promise.all([
    supabase
      .from('consultas')
      .select('estatus')
      .gte('fecha', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),

    supabase
      .from('consultas')
      .select('procedimiento')
      .not('procedimiento', 'is', null)
      .neq('procedimiento', '')
      .gte('fecha', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),

    supabase
      .from('agenda_cirugias')
      .select('fecha, doctor_id, doctores:doctor_id (alias)')
      .gte('fecha', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
      .lte('fecha', new Date().toISOString().slice(0, 10)),
  ]);

  const estatusCount: Record<string, number> = {};
  for (const c of consultasEstatus.data ?? []) {
    const est = c.estatus || 'BORRADOR';
    estatusCount[est] = (estatusCount[est] ?? 0) + 1;
  }

  const procCount: Record<string, number> = {};
  for (const c of topProcedimientos.data ?? []) {
    const proc = c.procedimiento || 'Otro';
    procCount[proc] = (procCount[proc] ?? 0) + 1;
  }
  const topProcs = Object.entries(procCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nombre, cantidad]) => ({ nombre, cantidad }));

  const agendaPorDoctor: Record<string, { nombre: string; cantidad: number }> = {};
  for (const a of agendaOcupacion.data ?? []) {
    const doctor = Array.isArray(a.doctores) ? a.doctores[0] : a.doctores;
    const nombre = doctor?.alias || 'Sin asignar';
    if (!agendaPorDoctor[a.doctor_id]) agendaPorDoctor[a.doctor_id] = { nombre, cantidad: 0 };
    agendaPorDoctor[a.doctor_id].cantidad++;
  }

  return NextResponse.json({
    consultasPorEstatus: estatusCount,
    topProcedimientos: topProcs,
    agendaOcupacion: Object.values(agendaPorDoctor).sort((a, b) => b.cantidad - a.cantidad),
  });
}
