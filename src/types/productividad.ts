export type EstadoLiquidacion = 'BORRADOR' | 'PENDIENTE_APROBACION' | 'APROBADA' | 'PAGADA' | 'RECHAZADA';
export type EstadoPeriodo = 'ABIERTO' | 'EN_REVISION' | 'CERRADO' | 'PAGADO';
export type EstadoPago = 'PENDIENTE_CONFIG' | 'POR_PAGAR' | 'PAGADO' | 'PENDIENTE' | 'CANCELADO';
export type TipoPeriodoPago = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL' | 'TRIMESTRAL';

export interface HonorarioLigaFila {
  id: string;
  fuente: string;
  doctor_id: string;
  doctor_nombre: string;
  fecha: string;
  monto: number;
  estado_pago: EstadoPago;
  estado_db: string;
  origen: string | null;
  metricas_ligados: {
    estudios_ligados: number;
    procedimientos_ligados: number;
    cirugias_ligadas: number;
  };
  periodo_inicio: string;
  periodo_fin: string;
}

export interface HonorariosResumen {
  por_pagar: number;
  pagado: number;
  sin_monto: number;
  cancelado: number;
  total_filtrado: number;
  total_eventos: number;
}

export interface HonorariosListado {
  items: HonorarioLigaFila[];
  total: number;
  page: number;
  pageSize: number;
  resumen: HonorariosResumen;
  periodo_tipo: TipoPeriodoPago;
  rango: { desde: string; hasta: string };
  agrupado?: HonorarioAgrupadoFila[];
}

export interface HonorarioAgrupadoFila {
  label: string;
  eventos: number;
  monto: number;
  pagado: number;
  por_pagar: number;
}

export type TipoAgrupacionLiga = 'dia' | 'doctor' | 'fuente';

export interface PagoHonorarioFila {
  id: string;
  fecha_pago: string | null;
  fecha_servicio: string;
  doctor_id: string;
  doctor_nombre: string;
  fuente: string;
  monto: number;
  pagado_por_nombre: string | null;
  estado: string;
}
export type TipoCalculoTarifa = 'FIJO' | 'PORCENTAJE';
export type RolDoctor = 'PRINCIPAL' | 'AYUDANTE' | 'ANESTESIOLOGO' | 'INTERPRETACION' | 'REFERIDOR';
export type TipoConcepto = 'ESTUDIO' | 'PROCEDIMIENTO' | 'CONSULTA';

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

export interface AjusteLiquidacion {
  id: string;
  liquidacion_id: string;
  concepto: string;
  monto: number;
  tipo: 'DESCUENTO' | 'BONIFICACION';
  justificacion: string | null;
  creado_por: string;
  created_at: string;
}

export interface SyncResult {
  consultas_verificadas: number;
  cirugias_verificadas: number;
  eventos_creados: number;
  eventos_existentes: number;
  errores: string[];
  duracion_ms: number;
}

export interface SyncLog {
  id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  consultas_verificadas: number;
  cirugias_verificadas: number;
  eventos_creados: number;
  eventos_existentes: number;
  errores: number;
  duracion_ms: number;
  ejecutado_por: string;
  created_at: string;
}

export interface PagoHonorario {
  id: string;
  liquidacion_id: string;
  doctor_id: string;
  monto: number;
  metodo: string;
  referencia: string | null;
  fecha_pago: string;
  estado: 'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO';
  creado_por: string;
  created_at: string;
}
