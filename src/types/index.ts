export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface DashboardStats {
  totalPacientes: number;
  consultasHoy: number;
  cobrosHoy: number;
  lentesBajoStock: number;
}

export interface ConsultaConRelaciones {
  id: string;
  fecha: Date;
  hora_inicio: string;
  tipo_consulta: string;
  diagnostico: string;
  paciente: {
    id: string;
    nombre_completo: string;
    telefono: string;
  };
  doctor: {
    id: string;
    nombre_completo: string;
  };
  cobro?: {
    monto: number;
    metodo_pago: string;
  };
}

export interface LenteConRelaciones {
  id: string;
  marca: string;
  modelo: string;
  codigo_barras: string;
  grado_esferico: number;
  grado_cilindrico: number;
  eje: number;
  stock: number;
  stock_minimo: number;
  precio_venta: number;
  estado: string;
  categoria: {
    nombre: string;
  };
  proveedor?: {
    nombre: string;
  };
}

export interface ReporteIngresos {
  mes: string;
  total: number;
  cantidad: number;
}

export interface ReporteDiagnosticos {
  diagnostico: string;
  cantidad: number;
  porcentaje: number;
}

export interface ReporteDoctores {
  doctor: string;
  consultas: number;
}
