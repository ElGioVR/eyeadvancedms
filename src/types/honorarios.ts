export type TipoConcepto = 'ESTUDIO' | 'PROCEDIMIENTO' | 'CONSULTA';
export type RolDoctor = 'PRINCIPAL' | 'AYUDANTE' | 'ANESTESIOLOGO' | 'INTERPRETACION' | 'REFERIDOR';
export type TipoCalculoTarifa = 'FIJO' | 'PORCENTAJE' | 'POR_HORA';
export type EstadoEventoHonorario = 'PENDIENTE' | 'DEVENGADO' | 'REVERSADO' | 'LIQUIDADO';
export type EstadoPeriodo = 'ABIERTO' | 'EN_REVISION' | 'CERRADO' | 'PAGADO';
export type EstadoLiquidacion = 'BORRADOR' | 'PENDIENTE_APROBACION' | 'APROBADA' | 'PAGADA' | 'RECHAZADA';
export type OrigenEvento = 'CONSULTA' | 'ESTUDIO' | 'PROCEDIMIENTO' | 'CITA' | 'OPERACION';

export interface MovimientoFiltros {
  fecha_desde?: string;
  fecha_hasta?: string;
  doctor_id?: string;
  moneda?: string;
  estado?: string;
  tipo_concepto?: TipoConcepto;
}

export interface EventoHonorario {
  id: string;
  origen_tipo: OrigenEvento;
  origen_id: string;
  doctor_id: string;
  doctor_nombre?: string;
  rol: RolDoctor;
  paciente_id: string | null;
  paciente_nombre?: string;
  fecha_servicio: string;
  monto_base: number;
  tarifa_snapshot: Record<string, unknown> | null;
  monto_devengado: number;
  moneda: string;
  estado: EstadoEventoHonorario;
  periodo_id: string | null;
  cobro_id: string | null;
  cobro_folio?: string;
  notas: string | null;
  created_at: string;
}

export interface TarifaDoctor {
  id: string;
  doctor_id: string;
  tipo_concepto: TipoConcepto;
  concepto_id: string | null;
  rol: RolDoctor;
  tipo_calculo: TipoCalculoTarifa;
  valor: number;
  moneda: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  creado_por: string | null;
  created_at: string;
}

export interface PeriodoPago {
  id: string;
  codigo: string;
  fecha_desde: string;
  fecha_hasta: string;
  estado: EstadoPeriodo;
  cerrado_por: string | null;
  cerrado_at: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiquidacionDoctor {
  id: string;
  periodo_id: string;
  doctor_id: string;
  doctor_nombre?: string;
  total_devengado: number;
  total_ajustes: number;
  total_retenciones: number;
  neto_pagar: number;
  moneda: string;
  estado: EstadoLiquidacion;
  aprobado_por: string | null;
  aprobado_at: string | null;
  pagado_at: string | null;
  referencia_pago: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReporteDoctorFila {
  fecha: string;
  hora: string | null;
  folio: string | null;
  paciente: string;
  tipo_concepto: string;
  tipo_visita: string | null;
  diagnostico: string | null;
  procedimiento: string | null;
  aseguranza: string | null;
  servicio_nombre: string | null;
  precio_servicio: number;
  porcentaje_cobertura: number | null;
  metodo_pago: string | null;
  moneda: string;
  monto_cobrado: number;
  base_calculo: number;
  tarifa_aplicada: number;
  honorario_doctor: number;
  estado_pago: string;
}

export interface ReporteDoctorTotales {
  num_consultas: number;
  total_cobrado: number;
  total_honorarios: number;
  pagado: number;
  pendiente: number;
  por_moneda: Record<string, { cobrado: number; honorarios: number }>;
  por_metodo_pago: Record<string, number>;
}

export interface ReporteDoctor {
  doctor_id: string;
  doctor_nombre: string;
  filtros: MovimientoFiltros;
  detalles: ReporteDoctorFila[];
  totales: ReporteDoctorTotales;
}

export interface ReporteGlobalFila {
  doctor_id: string;
  doctor_nombre: string;
  especialidad: string;
  num_consultas: number;
  total_cobrado: number;
  total_honorarios: number;
  pagado: number;
  pendiente: number;
  porcentaje_participacion: number;
}

export interface ReporteGlobal {
  filtros: MovimientoFiltros;
  doctores: ReporteGlobalFila[];
  totales: {
    total_cobrado: number;
    total_honorarios: number;
    pagado: number;
    pendiente: number;
    num_doctores: number;
  };
}

export interface PuntoHistorico {
  fecha: string;
  label: string;
  honorarios: number;
  servicios: number;
}

export interface HistoricoDoctor {
  doctor_id: string;
  doctor_nombre: string;
  granularidad: 'dia' | 'semana' | 'mes' | 'year';
  serie: PuntoHistorico[];
  comparativa: {
    periodo_actual: { honorarios: number; servicios: number };
    periodo_anterior: { honorarios: number; servicios: number };
    variacion_absoluta: number;
    variacion_porcentual: number;
  };
}

export interface ConfigHonorarios {
  aseguranza_afecta_honorarios: boolean;
  base_calculo_honorario: 'COBRO_TOTAL' | 'PARTE_PACIENTE';
  tipo_cambio_default: number;
  devengo_automatico: boolean;
}

export const DEFAULT_CONFIG_HONORARIOS: ConfigHonorarios = {
  aseguranza_afecta_honorarios: false,
  base_calculo_honorario: 'COBRO_TOTAL',
  tipo_cambio_default: 17.50,
  devengo_automatico: true,
};
