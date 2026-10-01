import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { hoyTijuana } from '@/lib/rangos';

// Estatus válidos de consultas (chk_estatus, migración 1800000000220).
const ESTATUS = [
  'BORRADOR',
  'PROCESADA',
  'PENDIENTE_ESTUDIO',
  'PENDIENTE_CIRUGIA',
  'APLAZADA',
  'REAGENDADA',
  'COMPLETADA',
  'CANCELADA',
] as const;

const MAX_FILAS = 10000;

/** Resta días a una fecha AAAA-MM-DD (aritmética en UTC, sin depender de la zona del servidor). */
function restarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);
}

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // Rol restringido (solo agenda propia): sin acceso a métricas, montos ni catálogo de precios
  if (auth.perfil?.rol === 'enfermero') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  // Fechas en la zona de la clínica (antes: UTC → "hoy" cambiaba a las 16-17 h locales)
  const hoy = hoyTijuana();
  const hace30 = restarDias(hoy, 30);
  const hace7 = restarDias(hoy, 7);

  const contar = (estatus: string | null) => {
    const q = supabase
      .from('consultas')
      .select('id', { count: 'exact', head: true })
      .gte('fecha', hace30);
    return estatus === null ? q.is('estatus', null) : q.eq('estatus', estatus);
  };

  // Todo en paralelo:
  //  - conteo por estatus con `head` (sin transferir filas; antes hasta 10 000 filas),
  //  - total del periodo (para detectar estatus no contemplados),
  //  - sólo consultas con procedimiento para el top 5,
  //  - agenda de la última semana.
  const [total30, sinEstatus, porEstatus, procs30, agendaOcupacion] = await Promise.all([
    supabase.from('consultas').select('id', { count: 'exact', head: true }).gte('fecha', hace30),
    contar(null),
    Promise.all(ESTATUS.map((e) => contar(e))),
    supabase
      .from('consultas')
      .select('procedimiento')
      .gte('fecha', hace30)
      .not('procedimiento', 'is', null)
      .neq('procedimiento', '')
      .limit(MAX_FILAS),
    supabase
      .from('agenda_cirugias')
      .select('doctor_id, doctores:doctor_id (alias)')
      .gte('fecha', hace7)
      .lte('fecha', hoy)
      .limit(5000),
  ]);

  let estatusCount: Record<string, number> = {};
  const conteoFallido = total30.error || sinEstatus.error || porEstatus.some((r) => r.error);
  if (!conteoFallido) {
    if ((sinEstatus.count ?? 0) > 0) estatusCount.BORRADOR = sinEstatus.count ?? 0;
    ESTATUS.forEach((e, i) => {
      const n = porEstatus[i].count ?? 0;
      if (n > 0) estatusCount[e] = (estatusCount[e] ?? 0) + n;
    });
  }
  const sumados = Object.values(estatusCount).reduce((a, b) => a + b, 0);

  // Respaldo: si algún conteo falló o existen estatus no contemplados, se
  // agrupa leyendo la columna (comportamiento anterior).
  if (conteoFallido || sumados !== (total30.count ?? 0)) {
    const { data } = await supabase
      .from('consultas')
      .select('estatus')
      .gte('fecha', hace30)
      .limit(MAX_FILAS);
    estatusCount = {};
    for (const c of data ?? []) {
      const est = c.estatus || 'BORRADOR';
      estatusCount[est] = (estatusCount[est] ?? 0) + 1;
    }
  }

  const procCount: Record<string, number> = {};
  for (const c of procs30.data ?? []) {
    const proc = typeof c.procedimiento === 'string' ? c.procedimiento.trim() : '';
    if (proc) procCount[proc] = (procCount[proc] ?? 0) + 1;
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
