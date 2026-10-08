import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { hoyTijuana } from '@/lib/rangos';

// Dashboard operativo: sólo información de valor del momento.
// Los costos/ingresos viven en el módulo de Productividad.

export interface DashboardStats {
  totalPacientes: number;
  consultasHoy: number;
  consultasSemana: number;
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

export interface DoctorDashboard {
  id: string;
  nombre: string;
  especialidad: string;
  iniciales: string;
}

export interface DashboardData {
  stats: DashboardStats;
  citas: Cita[];
  lentesBajoStock: LenteBajoStock[];
  doctores: DoctorDashboard[];
}

/**
 * Datos del dashboard. Con `doctorId` las citas de hoy y los contadores de
 * consultas se limitan a ese doctor; pacientes y bajo stock siguen siendo de la clínica.
 */
export async function getDashboardData(
  opts: { doctorId?: string | null } = {},
): Promise<DashboardData> {
  const supabase = getSupabaseAdmin();
  const filtroDoctor: Record<string, string> = opts.doctorId ? { doctor_id: opts.doctorId } : {};

  // "Hoy" y la semana (lunes–domingo) en la zona de la clínica (America/Tijuana),
  // con aritmética de fechas en UTC para no depender de la zona del servidor.
  const today = hoyTijuana();
  const base = new Date(`${today}T00:00:00Z`);
  const dayOfWeek = base.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(base.getTime() + mondayOffset * 86_400_000);
  const weekStart = monday.toISOString().slice(0, 10);
  const weekEnd = new Date(monday.getTime() + 6 * 86_400_000).toISOString().slice(0, 10);

  const [
    pacientesResult,
    consultasHoyResult,
    consultasSemanaResult,
    lentesBajoStockResult,
    doctoresResult,
  ] = await Promise.all([
    supabase
      .from('pacientes')
      .select('id', { count: 'exact', head: true }),

    supabase
      .from('consultas')
      .select(
        `id, hora_inicio, tipo_visita, diagnostico,
        paciente:paciente_id (nombre_completo),
        doctor:doctor_id (alias)`,
        { count: 'exact' },
      )
      .match({ fecha: today, ...filtroDoctor })
      .order('hora_inicio')
      .limit(300),

    supabase
      .from('consultas')
      .select('id', { count: 'exact', head: true })
      .gte('fecha', weekStart)
      .lte('fecha', weekEnd)
      .match(filtroDoctor),

    // Bajo stock: sólo LIOs (tipo = 'LENTE_INTRAOCULAR'). Cascada de esquemas:
    // legacy (marca/modelo) → nuevo (manufacturer/model) → nuevo sin filtro tipo.
    supabase
      .from('inventario_items')
      .select('id, marca, modelo, grado_esferico, color, stock, stock_minimo')
      .eq('tipo', 'LENTE_INTRAOCULAR')
      .gt('stock', 0)
      .order('stock', { ascending: true })
      .limit(50),

    supabase
      .from('doctores')
      .select('id, alias, especialidad')
      .eq('activo', true)
      .order('alias')
      .limit(200),
  ]);

  let lentesRaw: Record<string, unknown>[] = [];
  if (!lentesBajoStockResult.error) {
    lentesRaw = (lentesBajoStockResult.data as Record<string, unknown>[]) ?? [];
  } else {
    // Esquema nuevo (manufacturer/model): con filtro tipo; si la columna no
    // existe, último intento sin filtro (los items del inventario son LIOs).
    const intentoNuevo = async (conTipo: boolean) => {
      const q = supabase
        .from('inventario_items')
        .select('id, manufacturer, model, product_name, sphere, stock, stock_minimo');
      const filtered = conTipo ? q.eq('tipo', 'LENTE_INTRAOCULAR') : q;
      return filtered.gt('stock', 0).order('stock', { ascending: true }).limit(50);
    };
    let nueva = await intentoNuevo(true);
    if (nueva.error && /column|does not exist/i.test(nueva.error.message)) {
      nueva = await intentoNuevo(false);
    }
    if (!nueva.error) {
      lentesRaw = (nueva.data as unknown as Record<string, unknown>[]) ?? [];
    }
  }

  const totalPacientes = pacientesResult.count ?? 0;

  const citas: Cita[] = (consultasHoyResult.data ?? []).map((c) => {
    const paciente = Array.isArray(c.paciente) ? c.paciente[0] : c.paciente;
    const doctor = Array.isArray(c.doctor) ? c.doctor[0] : c.doctor;
    return {
      id: c.id,
      hora: c.hora_inicio?.slice(0, 5) ?? '',
      paciente: paciente?.nombre_completo ?? '',
      doctor: doctor?.alias ?? '',
      diagnostico: c.diagnostico ?? '',
      tipo: c.tipo_visita === 'PRIMERA_VEZ' ? 'Primera Vez' : 'Seguimiento',
    };
  });

  const lentesBajoStock: LenteBajoStock[] = lentesRaw
    .filter((l) => {
      const stock = Number(l.stock) || 0;
      const minimo = Number(l.stock_minimo ?? 5) || 5;
      return stock > 0 && stock < minimo;
    })
    .slice(0, 10)
    .map((l) => {
      const esNueva = l.manufacturer !== undefined || l.product_name !== undefined;
      const nombre = esNueva
        ? `${l.manufacturer || l.product_name || ''} ${l.model || l.product_name || ''}`.trim()
        : `${l.marca || ''} ${l.modelo || ''}`.trim();
      const detalle = esNueva
        ? l.sphere != null ? `Esf. ${l.sphere}` : 'Sin detalle'
        : [l.grado_esferico ? `Esf. ${l.grado_esferico}` : null, l.color].filter(Boolean).join(' · ') || 'Sin detalle';
      return {
        id: l.id as string,
        nombre: nombre || 'Ítem de inventario',
        detalle,
        stock: Number(l.stock),
      };
    });

  const doctores: DoctorDashboard[] = (doctoresResult.data ?? []).map((d) => ({
    id: d.id,
    nombre: d.alias,
    especialidad: d.especialidad ?? '',
    iniciales: (d.alias || '')
      .split(' ')
      .map((n: string) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
  }));

  return {
    stats: {
      totalPacientes,
      consultasHoy: consultasHoyResult.count ?? consultasHoyResult.data?.length ?? 0,
      consultasSemana: consultasSemanaResult.count ?? 0,
      lentesBajoStock: lentesBajoStock.length,
    },
    citas,
    lentesBajoStock,
    doctores,
  };
}
