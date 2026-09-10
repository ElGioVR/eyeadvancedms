import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface DashboardStats {
  totalPacientes: number;
  consultasHoy: number;
  cobrosDelDia: number;
  lentesBajoStock: number;
}

export interface Cita {
  id: string;
  hora: string;
  paciente: string;
  doctor: string;
  diagnostico: string;
  tipo: string;
}

export interface LenteBajoStock {
  id: string;
  nombre: string;
  detalle: string;
  stock: number;
}

export interface IngresoDia {
  dia: string;
  monto: number;
}

export interface DoctorDashboard {
  id: string;
  nombre: string;
  especialidad: string;
  iniciales: string;
  consultas: number;
}

export interface AseguranzaDashboard {
  id: string;
  nombre: string;
  pacientes: number;
}

export interface DashboardData {
  stats: DashboardStats;
  citas: Cita[];
  lentesBajoStock: LenteBajoStock[];
  ingresosSemana: IngresoDia[];
  totalIngresosSemana: number;
  doctores: DoctorDashboard[];
  aseguranzas: AseguranzaDashboard[];
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = getSupabaseAdmin();

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const weekStart = monday.toISOString().slice(0, 10);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekEnd = sunday.toISOString().slice(0, 10);

  const [
    pacientesResult,
    consultasHoyResult,
    cobrosHoyResult,
    lentesBajoStockResult,
    consultasSemanaResult,
    doctoresResult,
    cobrosSemanaResult,
    aseguranzasResult,
  ] = await Promise.all([
    supabase
      .from('pacientes')
      .select('id', { count: 'exact', head: true }),

    supabase
      .from('consultas')
      .select(`
        id, folio, hora_inicio, tipo_consulta, tipo_visita, diagnostico,
        paciente:paciente_id (nombre_completo),
        doctor:doctor_id (id, nombre_completo)
      `)
      .eq('fecha', today)
      .order('hora_inicio'),

    supabase
      .from('cobros')
      .select('monto')
      .eq('fecha_pago', today)
      .eq('pagado', true),

    supabase
      .from('lentes')
      .select('id, marca, modelo, grado_esferico, color, stock')
      .lte('stock', 5)
      .order('stock', { ascending: true })
      .limit(10),

    supabase
      .from('consultas')
      .select('id')
      .gte('fecha', weekStart)
      .lte('fecha', weekEnd),

    supabase
      .from('doctores')
      .select('id, nombre_completo, especialidad')
      .eq('activo', true),

    supabase
      .from('cobros')
      .select('monto, pagado, fecha_pago')
      .gte('fecha_pago', weekStart)
      .lte('fecha_pago', weekEnd)
      .eq('pagado', true),

    supabase
      .from('cobros')
      .select('aseguranza_id, paciente_id')
      .not('aseguranza_id', 'is', null),
  ]);

  const totalPacientes = pacientesResult.count ?? 0;

  const citas: Cita[] = (consultasHoyResult.data ?? []).map((c) => {
    const paciente = Array.isArray(c.paciente) ? c.paciente[0] : c.paciente;
    const doctor = Array.isArray(c.doctor) ? c.doctor[0] : c.doctor;
    return {
      id: c.id,
      hora: c.hora_inicio?.slice(0, 5) ?? '',
      paciente: paciente?.nombre_completo ?? '',
      doctor: doctor?.nombre_completo ?? '',
      diagnostico: c.diagnostico ?? '',
      tipo: c.tipo_visita === 'PRIMERA_VEZ' ? 'Primera Vez' : 'Seguimiento',
    };
  });

  const cobrosDelDia = (cobrosHoyResult.data ?? []).reduce((sum, c) => sum + (Number(c.monto) || 0), 0);

  const lentesBajoStock: LenteBajoStock[] = (lentesBajoStockResult.data ?? [])
    .filter((l) => l.stock <= 5)
    .map((l) => ({
      id: l.id,
      nombre: `${l.marca} ${l.modelo}`,
      detalle: [l.grado_esferico ? `Esf. ${l.grado_esferico}` : null, l.color].filter(Boolean).join(' · ') || 'Sin detalle',
      stock: l.stock,
    }));

  const ingresosPorDia: Record<string, number> = {};
  const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  for (const d of diasSemana) ingresosPorDia[d] = 0;

  for (const c of cobrosSemanaResult.data ?? []) {
    if (!c.fecha_pago) continue;
    const fecha = new Date(c.fecha_pago);
    const diff = fecha.getTime() - monday.getTime();
    const idx = Math.floor(diff / 86400000);
    if (idx >= 0 && idx < 7) {
      ingresosPorDia[diasSemana[idx]] += Number(c.monto) || 0;
    }
  }

  const ingresosSemana = diasSemana.slice(0, 6).map((dia) => ({
    dia,
    monto: Math.round(ingresosPorDia[dia]),
  }));

  const totalIngresosSemana = ingresosSemana.reduce((sum, i) => sum + i.monto, 0);

  const doctorIds = (doctoresResult.data ?? []).map((d) => d.id);
  let consultasPorDoctor: Record<string, number> = {};
  const aseguranzaMap: Record<string, { nombre: string; pacientes: Set<string> }> = {};
  for (const c of aseguranzasResult.data ?? []) {
    const aid = c.aseguranza_id;
    if (!aid) continue;
    if (!aseguranzaMap[aid]) aseguranzaMap[aid] = { nombre: '', pacientes: new Set() };
    aseguranzaMap[aid].pacientes.add(c.paciente_id);
  }
  const aseguranzaIds = Object.keys(aseguranzaMap);

  const [consultasAllResult, asegResult] = await Promise.all([
    doctorIds.length > 0
      ? supabase
          .from('consultas')
          .select('doctor_id')
          .in('doctor_id', doctorIds)
      : Promise.resolve({ data: [] as any[] }),
    aseguranzaIds.length > 0
      ? supabase
          .from('aseguranzas')
          .select('id, nombre')
          .in('id', aseguranzaIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  for (const c of consultasAllResult.data ?? []) {
    consultasPorDoctor[c.doctor_id] = (consultasPorDoctor[c.doctor_id] ?? 0) + 1;
  }

  const aseguranzasNombres: Record<string, string> = {};
  for (const a of asegResult.data ?? []) {
    aseguranzasNombres[a.id] = a.nombre;
  }

  const doctores: DoctorDashboard[] = (doctoresResult.data ?? []).map((d) => ({
    id: d.id,
    nombre: d.nombre_completo,
    especialidad: d.especialidad ?? '',
    iniciales: d.nombre_completo
      .split(' ')
      .map((n: string) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
    consultas: consultasPorDoctor[d.id] ?? 0,
  }));

  const aseguranzas: AseguranzaDashboard[] = aseguranzaIds
    .map((id) => ({
      id,
      nombre: aseguranzasNombres[id] ?? 'Desconocida',
      pacientes: aseguranzaMap[id].pacientes.size,
    }))
    .sort((a, b) => b.pacientes - a.pacientes);

  return {
    stats: {
      totalPacientes,
      consultasHoy: consultasHoyResult.data?.length ?? 0,
      cobrosDelDia,
      lentesBajoStock: lentesBajoStock.length,
    },
    citas,
    lentesBajoStock,
    ingresosSemana,
    totalIngresosSemana,
    doctores,
    aseguranzas,
  };
}
