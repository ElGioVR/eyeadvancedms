import { getSupabaseAdmin } from '@/lib/supabase/admin';

interface FiltrosMetricas {
  doctor_id?: string;
  especialidad?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  tipo_concepto?: string;
  aseguranza_id?: string;
  moneda?: string;
}

interface KPIsDoctor {
  doctor_id: string;
  doctor_nombre: string;
  servicios_ejecutados: number;
  ingreso_generado: number;
  honorario_devengado: number;
  ticket_promedio: number;
  ocupacion_agenda_pct: number;
  no_shows: number;
  cancelaciones: number;
}

export class MetricasDoctorService {
  private supabase = getSupabaseAdmin();

  async dashboardPorDoctor(filtros: FiltrosMetricas): Promise<KPIsDoctor[]> {
    let query = this.supabase
      .from('eventos_honorario')
      .select(`
        doctor_id,
        monto_devengado,
        fecha_servicio,
        origen_tipo,
        estado,
        doctores:doctor_id (nombre_completo, especialidad),
        pacientes:paciente_id (aseguranza_id)
      `)
      .not('estado', 'eq', 'REVERSADO');

    if (filtros.fecha_desde) query = query.gte('fecha_servicio', filtros.fecha_desde);
    if (filtros.fecha_hasta) query = query.lte('fecha_servicio', filtros.fecha_hasta);
    if (filtros.doctor_id) query = query.eq('doctor_id', filtros.doctor_id);
    if (filtros.tipo_concepto) query = query.eq('origen_tipo', filtros.tipo_concepto);
    if (filtros.moneda) query = query.eq('moneda', filtros.moneda);

    const { data: eventos } = await query;

    if (!eventos || eventos.length === 0) return [];

    const agrupados = new Map<string, {
      doctor_nombre: string;
      servicios: number;
      ingreso: number;
      devengado: number;
    }>();

    for (const ev of eventos) {
      const id = ev.doctor_id;
      const actual = agrupados.get(id) || {
        doctor_nombre: ((ev.doctores as unknown as Record<string, unknown>)?.nombre_completo as string) || '',
        servicios: 0,
        ingreso: 0,
        devengado: 0,
      };
      actual.servicios++;
      actual.ingreso += ev.monto_devengado || 0;
      actual.devengado += ev.monto_devengado || 0;
      agrupados.set(id, actual);
    }

    const resultado: KPIsDoctor[] = [];

    for (const [id, datos] of agrupados) {
      const { count: consultasTotales } = await this.supabase
        .from('consultas')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', id)
        .gte('fecha', filtros.fecha_desde || '2000-01-01')
        .lte('fecha', filtros.fecha_hasta || '2099-12-31');

      const { count: noShows } = await this.supabase
        .from('agenda_cirugias')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', id)
        .eq('estado', 'cancelada')
        .gte('fecha', filtros.fecha_desde || '2000-01-01')
        .lte('fecha', filtros.fecha_hasta || '2099-12-31');

      resultado.push({
        doctor_id: id,
        doctor_nombre: datos.doctor_nombre,
        servicios_ejecutados: datos.servicios,
        ingreso_generado: datos.ingreso,
        honorario_devengado: datos.devengado,
        ticket_promedio: datos.servicios > 0 ? Math.round(datos.ingreso / datos.servicios * 100) / 100 : 0,
        ocupacion_agenda_pct: 0,
        no_shows: noShows || 0,
        cancelaciones: noShows || 0,
      });
    }

    return resultado.sort((a, b) => b.honorario_devengado - a.honorario_devengado);
  }

  async rankingDoctores(filtros: FiltrosMetricas): Promise<Array<{
    doctor_id: string;
    doctor_nombre: string;
    total_servicios: number;
    total_ingreso: number;
    ranking: number;
  }>> {
    const dashboard = await this.dashboardPorDoctor(filtros);

    return dashboard.map((d, i) => ({
      doctor_id: d.doctor_id,
      doctor_nombre: d.doctor_nombre,
      total_servicios: d.servicios_ejecutados,
      total_ingreso: d.honorario_devengado,
      ranking: i + 1,
    }));
  }

  async desglosePorConcepto(filtros: FiltrosMetricas): Promise<Array<{
    origen_tipo: string;
    cantidad: number;
    total_devengado: number;
  }>> {
    let query = this.supabase
      .from('eventos_honorario')
      .select('origen_tipo, monto_devengado')
      .not('estado', 'eq', 'REVERSADO');

    if (filtros.doctor_id) query = query.eq('doctor_id', filtros.doctor_id);
    if (filtros.fecha_desde) query = query.gte('fecha_servicio', filtros.fecha_desde);
    if (filtros.fecha_hasta) query = query.lte('fecha_servicio', filtros.fecha_hasta);

    const { data: eventos } = await query;

    if (!eventos) return [];

    const agrupados = new Map<string, { cantidad: number; total: number }>();

    for (const ev of eventos) {
      const actual = agrupados.get(ev.origen_tipo) || { cantidad: 0, total: 0 };
      actual.cantidad++;
      actual.total += ev.monto_devengado || 0;
      agrupados.set(ev.origen_tipo, actual);
    }

    return [...agrupados.entries()]
      .map(([tipo, datos]) => ({
        origen_tipo: tipo,
        cantidad: datos.cantidad,
        total_devengado: datos.total,
      }))
      .sort((a, b) => b.total_devengado - a.total_devengado);
  }

  async historicoDoctor(doctorId: string, meses: number = 24): Promise<Array<{
    mes: string;
    servicios: number;
    devengado: number;
  }>> {
    const fechaInicio = new Date();
    fechaInicio.setMonth(fechaInicio.getMonth() - meses);
    const fechaStr = fechaInicio.toISOString().split('T')[0];

    const { data: eventos } = await this.supabase
      .from('eventos_honorario')
      .select('fecha_servicio, monto_devengado')
      .eq('doctor_id', doctorId)
      .gte('fecha_servicio', fechaStr)
      .not('estado', 'eq', 'REVERSADO')
      .order('fecha_servicio', { ascending: true });

    if (!eventos) return [];

    const agrupados = new Map<string, { servicios: number; devengado: number }>();

    for (const ev of eventos) {
      const mes = ev.fecha_servicio.substring(0, 7);
      const actual = agrupados.get(mes) || { servicios: 0, devengado: 0 };
      actual.servicios++;
      actual.devengado += ev.monto_devengado || 0;
      agrupados.set(mes, actual);
    }

    return [...agrupados.entries()]
      .map(([mes, datos]) => ({
        mes,
        servicios: datos.servicios,
        devengado: datos.devengado,
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
  }

  async estadoCuentaDoctor(
    doctorId: string,
    filtros: FiltrosMetricas
  ): Promise<Array<{
    fecha: string;
    paciente_nombre: string;
    concepto: string;
    rol: string;
    tarifa_aplicada: number;
    monto: number;
    estado: string;
  }>> {
    let query = this.supabase
      .from('eventos_honorario')
      .select(`
        fecha_servicio,
        origen_tipo,
        rol,
        monto_devengado,
        monto_base,
        estado,
        tarifa_snapshot,
        pacientes:paciente_id (nombre_completo)
      `)
      .eq('doctor_id', doctorId)
      .order('fecha_servicio', { ascending: false });

    if (filtros.fecha_desde) query = query.gte('fecha_servicio', filtros.fecha_desde);
    if (filtros.fecha_hasta) query = query.lte('fecha_servicio', filtros.fecha_hasta);
    if (filtros.tipo_concepto) query = query.eq('origen_tipo', filtros.tipo_concepto);

    const { data: eventos } = await query;

    if (!eventos) return [];

    return eventos.map((ev) => ({
      fecha: ev.fecha_servicio,
      paciente_nombre: ((ev.pacientes as unknown as Record<string, unknown>)?.nombre_completo as string) || '',
      concepto: ev.origen_tipo,
      rol: ev.rol,
      tarifa_aplicada: ev.monto_base || 0,
      monto: ev.monto_devengado || 0,
      estado: ev.estado,
    }));
  }
}
