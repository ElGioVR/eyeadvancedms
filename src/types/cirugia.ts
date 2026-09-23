export type CodigoOjo = 'OD' | 'OI' | 'OU';

export interface CatOjo {
  codigo: CodigoOjo;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface CatRolParticipante {
  id: string;
  clave: string;
  nombre: string;
  descripcion?: string | null;
  orden: number;
  activo: boolean;
  created_at: string;
}

export interface CatRecurso {
  id: string;
  nombre: string;
  tipo: 'QUIROFANO' | 'SALA' | 'EQUIPO';
  ubicacion?: string | null;
  activo: boolean;
  created_at: string;
}

export interface CirugiaParticipante {
  id: string;
  cirugia_id: string;
  medico_id: string;
  rol_id: string;
  created_at: string;
}

export type CirugiaProductividadEstado = 'PENDIENTE' | 'CALCULADO' | 'PAGADO' | 'ANULADO';

export interface CirugiaProductividad {
  id: string;
  cirugia_id: string;
  participante_id: string;
  origen_id: string | null;
  servicio_id: string | null;
  rol_id: string | null;
  estado: CirugiaProductividadEstado;
  monto: number | null;
  regla_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CirugiaArchivo {
  id: string;
  cirugia_id: string;
  nombre_original: string;
  nombre_storage: string;
  mime_type: string;
  size: number;
  storage_path: string;
  tipo_documento: string | null;
  uploaded_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
}

export type CirugiaHistorialAccion =
  | 'CIRUGIA_CREADA'
  | 'LIO_ASIGNADO'
  | 'PARTICIPANTE_ASIGNADO'
  | 'ARCHIVO_AGREGADO'
  | 'ARCHIVO_ELIMINADO'
  | 'ESTADO_CAMBIADO';

export interface CirugiaHistorial {
  id: string;
  cirugia_id: string;
  usuario_id: string | null;
  accion: CirugiaHistorialAccion;
  detalle: Record<string, unknown>;
  created_at: string;
}

export interface CirugiaParticipanteInput {
  medico_id: string;
  rol_id: string;
}

export interface CirugiaCreateInput {
  paciente_id: string;
  origen_id: string;
  servicio_id: string;
  fecha: string;
  hora: string;
  duracion_min: number;
  recurso_id?: string | null;
  ojo: CodigoOjo;
  inventario_item_id?: string | null;
  consulta_id?: string | null;
  participantes: CirugiaParticipanteInput[];
  notas?: string | null;
}
