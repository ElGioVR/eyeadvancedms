import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { roundMoney, getTipoCambio, parseMoneda } from '@/lib/money';
import type {
  MovimientoFiltros,
  ReporteDoctor,
  ReporteDoctorFila,
  ReporteDoctorTotales,
  ReporteGlobal,
  ReporteGlobalFila,
  HistoricoDoctor,
  PuntoHistorico,
  ConfigHonorarios,
  DEFAULT_CONFIG_HONORARIOS,
} from '@/types/honorarios';

type ConfigType = typeof DEFAULT_CONFIG_HONORARIOS;

export class HonorariosService {
  private supabase = getSupabaseAdmin();

  async getConfig(): Promise<ConfigType> {
    const { data } = await this.supabase
      .from('configuracion_sistema')
      .select('valor')
      .eq('clave', 'honorarios')
      .maybeSingle();

    return {
      aseguranza_afecta_honorarios: false,
      base_calculo_honorario: 'COBRO_TOTAL',
      tipo_cambio_default: 17.50,
      devengo_automatico: true,
      ...(data?.valor as Partial<ConfigType> || {}),
    };
  }

  async revertirPorCobro(cobroId: string, usuarioId?: string): Promise<{ revertidos: number }> {
    const { data: eventos } = await this.supabase
      .from('eventos_honorario')
      .select('id')
      .eq('cobro_id', cobroId)
      .not('estado', 'eq', 'REVERSADO');

    let revertidos = 0;
    for (const evento of eventos || []) {
      await this.supabase
        .from('eventos_honorario')
        .update({ estado: 'REVERSADO' })
        .eq('id', evento.id);

      if (usuarioId) {
        await this.supabase.from('bitacora_honorarios').insert({
          tabla: 'eventos_honorario',
          registro_id: evento.id,
          accion: 'REVERSION_COBRO',
          valor_nuevo: { estado: 'REVERSADO', cobro_id: cobroId },
          usuario_id: usuarioId,
        });
      }
      revertidos++;
    }

    return { revertidos };
  }

  async reporteDoctor(doctorId: string, filtros: MovimientoFiltros): Promise<ReporteDoctor> {
    const config = await this.getConfig();

    let query = this.supabase
      .from('eventos_honorario')
      .select(`
        id, origen_tipo, origen_id, doctor_id, rol, paciente_id,
        fecha_servicio, monto_base, tarifa_snapshot, monto_devengado,
        moneda, estado, cobro_id, notas, created_at,
        doctores:doctor_id (nombre_completo),
        pacientes:paciente_id (nombre_completo)
      `)
      .eq('doctor_id', doctorId)
      .order('fecha_servicio', { ascending: false });

    if (filtros.fecha_desde) query = query.gte('fecha_servicio', filtros.fecha_desde);
    if (filtros.fecha_hasta) query = query.lte('fecha_servicio', filtros.fecha_hasta);
    if (filtros.tipo_concepto) query = query.eq('origen_tipo', filtros.tipo_concepto);

    const { data: eventos } = await query;

    const tipoCambio = config.tipo_cambio_default;

    const cobroIds = [...new Set((eventos || []).map((e) => e.cobro_id).filter(Boolean))] as string[];
    let cobrosMap = new Map<string, { folio: string | null; metodo_pago: string | null; monto: number; pagado: boolean; aseguranza: string | null }>();

    if (cobroIds.length > 0) {
      const { data: cobros } = await this.supabase
        .from('cobros')
        .select('id, folio, metodo_pago, monto, pagado, aseguranzas:aseguranza_id (nombre)')
        .in('id', cobroIds);

      for (const c of cobros || []) {
        cobrosMap.set(c.id, {
          folio: c.folio,
          metodo_pago: c.metodo_pago,
          monto: c.monto,
          pagado: c.pagado,
          aseguranza: (c.aseguranzas as unknown as Record<string, unknown>)?.nombre as string || null,
        });
      }
    }

    // For new consultas (no cobros), resolve from consultas table
    const consultaIds = [...new Set((eventos || [])
      .filter(e => !e.cobro_id && e.origen_tipo === 'CONSULTA')
      .map(e => e.origen_id))];
    let consultasMap = new Map<string, { costo_total: number; estatus_pago: string; metodo_pago: string | null }>();

    if (consultaIds.length > 0) {
      const { data: consultas } = await this.supabase
        .from('consultas')
        .select('id, costo_total, estatus_pago, metodo_pago')
        .in('id', consultaIds);

      for (const c of consultas || []) {
        consultasMap.set(c.id, {
          costo_total: c.costo_total || 0,
          estatus_pago: c.estatus_pago || 'PENDIENTE_PAGO',
          metodo_pago: c.metodo_pago,
        });
      }
    }

    const detalles: ReporteDoctorFila[] = [];
    const totales: ReporteDoctorTotales = {
      num_consultas: 0,
      total_cobrado: 0,
      total_honorarios: 0,
      pagado: 0,
      pendiente: 0,
      por_moneda: {},
      por_metodo_pago: {},
    };

    for (const ev of eventos || []) {
      if (ev.estado === 'REVERSADO') continue;

      const cobro = ev.cobro_id ? cobrosMap.get(ev.cobro_id) : null;
      const doctorNombre = (ev.doctores as unknown as Record<string, unknown>)?.nombre_completo as string || '';
      const pacienteNombre = (ev.pacientes as unknown as Record<string, unknown>)?.nombre_completo as string || '';

      // Resolve from cobros (legacy) or consultas (new)
      let montoCobrado = cobro?.monto ?? 0;
      let metodoPago = cobro?.metodo_pago || null;
      let aseguranza = cobro?.aseguranza || null;
      let estadoPago = cobro?.pagado ? 'PAGADO' : (cobro ? 'PENDIENTE' : 'SIN_COBRO');

      if (!cobro && !ev.cobro_id && ev.origen_tipo === 'CONSULTA') {
        const consulta = consultasMap.get(ev.origen_id);
        if (consulta) {
          montoCobrado = consulta.costo_total;
          metodoPago = consulta.metodo_pago;
          estadoPago = consulta.estatus_pago === 'PAGADO' ? 'PAGADO' : 'PENDIENTE';
        }
      }
      const montoBase = ev.monto_base ?? 0;
      const tarifaSnapshot = (ev.tarifa_snapshot as Record<string, unknown>) || {};
      const tarifaValor = (tarifaSnapshot.valor as number) || 0;
      const honorarioDevengado = ev.monto_devengado ?? 0;

      const montoCobradoPesos = parseMoneda(montoCobrado, ev.moneda === 'DOLARES' ? 'DOLARES' : 'PESOS', 'PESOS', tipoCambio);
      const honorarioPesos = parseMoneda(honorarioDevengado, ev.moneda === 'DOLARES' ? 'DOLARES' : 'PESOS', 'PESOS', tipoCambio);

      detalles.push({
        fecha: ev.fecha_servicio,
        hora: null,
        folio: cobro?.folio || null,
        paciente: pacienteNombre,
        tipo_concepto: ev.origen_tipo,
        tipo_visita: null,
        diagnostico: null,
        procedimiento: null,
        aseguranza,
        metodo_pago: metodoPago,
        moneda: ev.moneda,
        monto_cobrado: montoCobradoPesos,
        base_calculo: montoBase,
        tarifa_aplicada: tarifaValor,
        honorario_doctor: honorarioPesos,
        estado_pago: estadoPago,
      });

      totales.num_consultas++;
      totales.total_cobrado = roundMoney(totales.total_cobrado + montoCobradoPesos);
      totales.total_honorarios = roundMoney(totales.total_honorarios + honorarioPesos);

      if (estadoPago === 'PAGADO') {
        totales.pagado = roundMoney(totales.pagado + honorarioPesos);
      } else {
        totales.pendiente = roundMoney(totales.pendiente + honorarioPesos);
      }

      const monedaKey = ev.moneda || 'PESOS';
      if (!totales.por_moneda[monedaKey]) totales.por_moneda[monedaKey] = { cobrado: 0, honorarios: 0 };
      totales.por_moneda[monedaKey].cobrado = roundMoney(totales.por_moneda[monedaKey].cobrado + montoCobradoPesos);
      totales.por_moneda[monedaKey].honorarios = roundMoney(totales.por_moneda[monedaKey].honorarios + honorarioPesos);

      const metodoKey = metodoPago || 'SIN_METODO';
      totales.por_metodo_pago[metodoKey] = roundMoney((totales.por_metodo_pago[metodoKey] || 0) + montoCobradoPesos);
    }

    const doctorNombre = eventos && eventos.length > 0
      ? (eventos[0].doctores as unknown as Record<string, unknown>)?.nombre_completo as string || ''
      : '';

    return {
      doctor_id: doctorId,
      doctor_nombre: doctorNombre,
      filtros,
      detalles,
      totales,
    };
  }

  async reporteGlobal(filtros: MovimientoFiltros): Promise<ReporteGlobal> {
    let query = this.supabase
      .from('eventos_honorario')
      .select(`
        doctor_id, monto_devengado, monto_base, moneda, estado, fecha_servicio, cobro_id,
        doctores:doctor_id (nombre_completo, especialidad)
      `)
      .order('fecha_servicio', { ascending: false });

    if (filtros.fecha_desde) query = query.gte('fecha_servicio', filtros.fecha_desde);
    if (filtros.fecha_hasta) query = query.lte('fecha_servicio', filtros.fecha_hasta);
    if (filtros.doctor_id) query = query.eq('doctor_id', filtros.doctor_id);

    const { data: eventos } = await query;

    const config = await this.getConfig();
    const tipoCambio = config.tipo_cambio_default;

    const cobroIds = [...new Set((eventos || []).map((e) => e.cobro_id).filter(Boolean))] as string[];
    let cobrosMap = new Map<string, { monto: number; pagado: boolean }>();

    if (cobroIds.length > 0) {
      const { data: cobros } = await this.supabase
        .from('cobros')
        .select('id, monto, pagado')
        .in('id', cobroIds);

      for (const c of cobros || []) {
        cobrosMap.set(c.id, { monto: c.monto, pagado: c.pagado });
      }
    }

    const agrupados = new Map<string, {
      doctor_nombre: string;
      especialidad: string;
      consultas: number;
      cobrado: number;
      honorarios: number;
      pagado: number;
      pendiente: number;
    }>();

    let totalCobradoGeneral = 0;
    let totalHonorariosGeneral = 0;
    let totalPagadoGeneral = 0;
    let totalPendienteGeneral = 0;

    for (const ev of eventos || []) {
      if (ev.estado === 'REVERSADO') continue;

      const cobro = ev.cobro_id ? cobrosMap.get(ev.cobro_id) : null;
      const doctorInfo = ev.doctores as unknown as Record<string, unknown>;
      const docNombre = doctorInfo?.nombre_completo as string || '';
      const docEspecialidad = doctorInfo?.especialidad as string || '';

      const montoCobrado = cobro?.monto ?? 0;
      const honorarioDevengado = ev.monto_devengado ?? 0;

      const montoCobradoPesos = parseMoneda(montoCobrado, ev.moneda === 'DOLARES' ? 'DOLARES' : 'PESOS', 'PESOS', tipoCambio);
      const honorarioPesos = parseMoneda(honorarioDevengado, ev.moneda === 'DOLARES' ? 'DOLARES' : 'PESOS', 'PESOS', tipoCambio);

      const actual = agrupados.get(ev.doctor_id) || {
        doctor_nombre: docNombre,
        especialidad: docEspecialidad,
        consultas: 0,
        cobrado: 0,
        honorarios: 0,
        pagado: 0,
        pendiente: 0,
      };

      actual.consultas++;
      actual.cobrado = roundMoney(actual.cobrado + montoCobradoPesos);
      actual.honorarios = roundMoney(actual.honorarios + honorarioPesos);

      if (cobro?.pagado) {
        actual.pagado = roundMoney(actual.pagado + honorarioPesos);
      } else {
        actual.pendiente = roundMoney(actual.pendiente + honorarioPesos);
      }

      agrupados.set(ev.doctor_id, actual);

      totalCobradoGeneral = roundMoney(totalCobradoGeneral + montoCobradoPesos);
      totalHonorariosGeneral = roundMoney(totalHonorariosGeneral + honorarioPesos);
      if (cobro?.pagado) {
        totalPagadoGeneral = roundMoney(totalPagadoGeneral + honorarioPesos);
      } else {
        totalPendienteGeneral = roundMoney(totalPendienteGeneral + honorarioPesos);
      }
    }

    const doctores: ReporteGlobalFila[] = [...agrupados.entries()]
      .map(([id, d]) => ({
        doctor_id: id,
        doctor_nombre: d.doctor_nombre,
        especialidad: d.especialidad,
        num_consultas: d.consultas,
        total_cobrado: d.cobrado,
        total_honorarios: d.honorarios,
        pagado: d.pagado,
        pendiente: d.pendiente,
        porcentaje_participacion: totalHonorariosGeneral > 0
          ? roundMoney((d.honorarios / totalHonorariosGeneral) * 100)
          : 0,
      }))
      .sort((a, b) => b.total_honorarios - a.total_honorarios);

    return {
      filtros,
      doctores,
      totales: {
        total_cobrado: totalCobradoGeneral,
        total_honorarios: totalHonorariosGeneral,
        pagado: totalPagadoGeneral,
        pendiente: totalPendienteGeneral,
        num_doctores: doctores.length,
      },
    };
  }

  async historicoDoctor(
    doctorId: string,
    granularidad: 'dia' | 'semana' | 'mes' | 'year' = 'mes',
    meses: number = 24
  ): Promise<HistoricoDoctor> {
    const fechaInicio = new Date();
    fechaInicio.setMonth(fechaInicio.getMonth() - meses);
    const fechaStr = fechaInicio.toISOString().split('T')[0];

    const { data: eventos } = await this.supabase
      .from('eventos_honorario')
      .select('fecha_servicio, monto_devengado, estado')
      .eq('doctor_id', doctorId)
      .gte('fecha_servicio', fechaStr)
      .not('estado', 'eq', 'REVERSADO')
      .order('fecha_servicio', { ascending: true });

    const { data: doctor } = await this.supabase
      .from('doctores')
      .select('nombre_completo')
      .eq('id', doctorId)
      .maybeSingle();

    const agrupados = new Map<string, { honorarios: number; servicios: number }>();

    for (const ev of eventos || []) {
      const fecha = new Date(ev.fecha_servicio);
      let key: string;
      let label: string;

      switch (granularidad) {
        case 'dia':
          key = ev.fecha_servicio;
          label = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
          break;
        case 'semana': {
          const weekStart = new Date(fecha);
          weekStart.setDate(fecha.getDate() - fecha.getDay() + 1);
          key = weekStart.toISOString().split('T')[0];
          label = `Sem ${weekStart.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`;
          break;
        }
        case 'year':
          key = ev.fecha_servicio.substring(0, 4);
          label = key;
          break;
        case 'mes':
        default:
          key = ev.fecha_servicio.substring(0, 7);
          label = fecha.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
          break;
      }

      const actual = agrupados.get(key) || { honorarios: 0, servicios: 0 };
      actual.honorarios = roundMoney(actual.honorarios + (ev.monto_devengado || 0));
      actual.servicios++;
      agrupados.set(key, actual);
    }

    const serie: PuntoHistorico[] = [...agrupados.entries()]
      .map(([fecha, datos]) => ({
        fecha,
        label: datos.servicios.toString(),
        honorarios: datos.honorarios,
        servicios: datos.servicios,
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const ahora = new Date();
    const mitad = Math.floor(serie.length / 2);
    const periodoActual = serie.slice(mitad);
    const periodoAnterior = serie.slice(0, mitad);

    const sumHonorarios = (arr: PuntoHistorico[]) => arr.reduce((s, p) => s + p.honorarios, 0);
    const sumServicios = (arr: PuntoHistorico[]) => arr.reduce((s, p) => s + p.servicios, 0);

    const actualH = sumHonorarios(periodoActual);
    const anteriorH = sumHonorarios(periodoAnterior);
    const variacionAbs = actualH - anteriorH;
    const variacionPct = anteriorH > 0 ? roundMoney((variacionAbs / anteriorH) * 100) : 0;

    return {
      doctor_id: doctorId,
      doctor_nombre: doctor?.nombre_completo || '',
      granularidad,
      serie: serie.map((p) => ({ ...p, label: p.fecha })),
      comparativa: {
        periodo_actual: { honorarios: actualH, servicios: sumServicios(periodoActual) },
        periodo_anterior: { honorarios: anteriorH, servicios: sumServicios(periodoAnterior) },
        variacion_absoluta: roundMoney(variacionAbs),
        variacion_porcentual: variacionPct,
      },
    };
  }
}
