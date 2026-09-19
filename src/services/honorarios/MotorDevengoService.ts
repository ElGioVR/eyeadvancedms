import { getSupabaseAdmin } from '@/lib/supabase/admin';

type OrigenTipo = 'CONSULTA' | 'ESTUDIO' | 'PROCEDIMIENTO' | 'CITA' | 'OPERACION';
type RolDoctor = 'PRINCIPAL' | 'AYUDANTE' | 'ANESTESIOLOGO' | 'INTERPRETACION' | 'REFERIDOR';
type TipoConcepto = 'ESTUDIO' | 'PROCEDIMIENTO' | 'CONSULTA';

interface EventoDevengoInput {
  origen_tipo: OrigenTipo;
  origen_id: string;
  doctor_id: string;
  rol: RolDoctor;
  paciente_id: string | null;
  fecha_servicio: string;
  monto_base: number;
  tarifa_snapshot: Record<string, unknown>;
  moneda?: string;
}

interface ConfigHonorarios {
  aseguranza_afecta_honorarios: boolean;
  base_calculo_honorario: 'COBRO_TOTAL' | 'PARTE_PACIENTE';
  tipo_cambio_default: number;
  devengo_automatico: boolean;
}

export class MotorDevengoService {
  private supabase = getSupabaseAdmin();

  private async getConfig(): Promise<ConfigHonorarios> {
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
      ...(data?.valor as Partial<ConfigHonorarios> || {}),
    };
  }

  async generarDesdeConsulta(consultaId: string): Promise<{ eventos_creados: number }> {
    const config = await this.getConfig();

    const { data: consulta, error: e1 } = await this.supabase
      .from('consultas')
      .select('id, paciente_id, doctor_id, fecha, tipo_consulta, tipo_visita, costo_total, monto_pagado, estatus_pago')
      .eq('id', consultaId)
      .single();

    if (e1 || !consulta) throw new Error(`Consulta ${consultaId} no encontrada`);

    // Read insurance and coverage from consultas (replaces cobros reference)
    let cobroMonto: number | null = null;
    let cobroAseguranzaId: string | null = null;

    if (config.aseguranza_afecta_honorarios) {
      cobroMonto = consulta.costo_total || 0;
      // Resolve aseguranza_id from patient
      const { data: paciente } = await this.supabase
        .from('pacientes')
        .select('aseguranza_id')
        .eq('id', consulta.paciente_id)
        .maybeSingle();
      cobroAseguranzaId = paciente?.aseguranza_id ?? null;
    }

    let porcentajeCobertura = 100;
    if (config.aseguranza_afecta_honorarios && cobroAseguranzaId) {
      const { data: cobertura } = await this.supabase
        .from('coberturas_aseguranza')
        .select('porcentaje_cobertura')
        .eq('aseguranza_id', cobroAseguranzaId)
        .eq('activo', true)
        .maybeSingle();

      if (cobertura) {
        porcentajeCobertura = cobertura.porcentaje_cobertura || 100;
      }
    }

    const { data: conceptos } = await this.supabase
      .from('consulta_conceptos')
      .select('id, tipo_concepto, concepto_id, doctor_id, precio_aplicado, texto_original')
      .eq('consulta_id', consultaId);

    let eventosCreados = 0;

    for (const concepto of conceptos || []) {
      const doctorId = concepto.doctor_id || consulta.doctor_id;
      if (!doctorId) continue;

      const tarifa = await this.resolverTarifa(
        doctorId,
        concepto.tipo_concepto as TipoConcepto,
        concepto.concepto_id,
        'PRINCIPAL',
        consulta.fecha
      );

      let montoBase: number = concepto.precio_aplicado || (tarifa && typeof tarifa === 'object' && 'valor' in tarifa
        ? Number((tarifa as Record<string, unknown>).valor) || 0
        : 0);

      if (config.aseguranza_afecta_honorarios && cobroAseguranzaId && cobroMonto !== null) {
        if (config.base_calculo_honorario === 'PARTE_PACIENTE') {
          const partePaciente = cobroMonto * (1 - porcentajeCobertura / 100);
          const factor = cobroMonto > 0 ? partePaciente / cobroMonto : 1;
          montoBase = montoBase * factor;
        }
      }

      const resultado = await this.crearEvento({
        origen_tipo: concepto.tipo_concepto as OrigenTipo,
        origen_id: concepto.id,
        doctor_id: doctorId,
        rol: 'PRINCIPAL',
        paciente_id: consulta.paciente_id,
        fecha_servicio: consulta.fecha,
        monto_base: montoBase,
        tarifa_snapshot: tarifa ? { ...tarifa } : {},
      });

      if (resultado) eventosCreados++;
    }

    return { eventos_creados: eventosCreados };
  }

  async generarDesdeCirugia(cirugiaId: string): Promise<{ eventos_creados: number }> {
    const { data: cirugia, error: e1 } = await this.supabase
      .from('agenda_cirugias')
      .select('id, paciente_id, doctor_id, fecha, procedimiento')
      .eq('id', cirugiaId)
      .single();

    if (e1 || !cirugia) throw new Error(`Cirugía ${cirugiaId} no encontrada`);

    const { data: participantes } = await this.supabase
      .from('agenda_cirugia_doctores')
      .select('doctor_id, rol, porcentaje_participacion')
      .eq('cirugia_id', cirugiaId);

    const doctores = participantes && participantes.length > 0
      ? participantes
      : cirugia.doctor_id
        ? [{ doctor_id: cirugia.doctor_id, rol: 'CIRUJANO_PRINCIPAL', porcentaje_participacion: 100 }]
        : [];

    let eventosCreados = 0;

    for (const doc of doctores) {
      const tarifa = await this.resolverTarifa(
        doc.doctor_id,
        'PROCEDIMIENTO',
        null,
        doc.rol as RolDoctor,
        cirugia.fecha
      );

      const monto: number = tarifa && typeof tarifa === 'object' && 'valor' in tarifa
        ? Number((tarifa as Record<string, unknown>).valor) || 0
        : 0;

      const resultado = await this.crearEvento({
        origen_tipo: 'OPERACION',
        origen_id: cirugiaId,
        doctor_id: doc.doctor_id,
        rol: doc.rol as RolDoctor,
        paciente_id: cirugia.paciente_id,
        fecha_servicio: cirugia.fecha,
        monto_base: monto,
        tarifa_snapshot: tarifa ? { ...tarifa } : {},
      });

      if (resultado) eventosCreados++;
    }

    return { eventos_creados: eventosCreados };
  }

  private async crearEvento(input: EventoDevengoInput): Promise<boolean> {
    const montoDevengado = this.calcularMontoDevengado(input);
    const periodoId = await this.resolverPeriodo(input.fecha_servicio);

    const { error } = await this.supabase
      .from('eventos_honorario')
      .insert({
        origen_tipo: input.origen_tipo,
        origen_id: input.origen_id,
        doctor_id: input.doctor_id,
        rol: input.rol,
        paciente_id: input.paciente_id,
        fecha_servicio: input.fecha_servicio,
        monto_base: input.monto_base,
        tarifa_snapshot: input.tarifa_snapshot,
        monto_devengado: montoDevengado,
        moneda: input.moneda || 'PESOS',
        estado: 'DEVENGADO',
        periodo_id: periodoId,
      });

    if (error) {
      if (error.code === '23505') return false;
      throw new Error(`Error al crear evento de honorario: ${error.message}`);
    }

    return true;
  }

  private async resolverPeriodo(fecha: string): Promise<string | null> {
    const { data } = await this.supabase
      .from('periodos_pago')
      .select('id')
      .lte('fecha_desde', fecha)
      .gte('fecha_hasta', fecha)
      .in('estado', ['ABIERTO', 'EN_REVISION'])
      .maybeSingle();
    return data?.id ?? null;
  }

  private calcularMontoDevengado(input: EventoDevengoInput): number {
    const tarifa = input.tarifa_snapshot as Record<string, unknown>;
    const tipoCalculo = tarifa?.tipo_calculo as string | undefined;
    const valor = (tarifa?.valor as number) || 0;

    if (tipoCalculo === 'PORCENTAJE') {
      return (input.monto_base * valor) / 100;
    }

    return input.monto_base;
  }

  private async resolverTarifa(
    doctorId: string,
    tipoConcepto: TipoConcepto,
    conceptoId: string | null,
    rol: RolDoctor,
    fechaServicio: string
  ): Promise<Record<string, unknown> | null> {
    const { data: tarifaEspecifica } = await this.supabase
      .from('tarifas_doctor')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('tipo_concepto', tipoConcepto)
      .eq('concepto_id', conceptoId)
      .eq('rol', rol)
      .lte('vigente_desde', fechaServicio)
      .or(`vigente_hasta.is.null,vigente_hasta.gte.${fechaServicio}`)
      .order('vigente_desde', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tarifaEspecifica) return tarifaEspecifica;

    const { data: tarifaDefault } = await this.supabase
      .from('tarifas_doctor')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('tipo_concepto', tipoConcepto)
      .is('concepto_id', null)
      .eq('rol', rol)
      .lte('vigente_desde', fechaServicio)
      .or(`vigente_hasta.is.null,vigente_hasta.gte.${fechaServicio}`)
      .order('vigente_desde', { ascending: false })
      .limit(1)
      .maybeSingle();

    return tarifaDefault || null;
  }
}
