export type Sexo = 'H' | 'M';

export interface Paciente {
  id: number;
  nombre: string;
  iniciales: string;
  color: string;
  edad: number;
  sexo: Sexo;
  aseguradora: string;
  sx: string;
  tipografia: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  telefonoFijo?: string;
  ultimaVisita?: string;
  consultas?: number;
}

export interface Doctor {
  id: number;
  nombre: string;
  especialidad: string;
  cedula: string;
  aseguradoras: string[];
  color: string;
  iniciales: string;
  consultas: number;
}

export interface Consulta {
  id: string;
  paciente: string;
  iniciales: string;
  color: string;
  doctor: string;
  fecha: string;
  tipo: string;
  diagnostico: string;
  estado: 'COMPLETADA' | 'EN CURSO' | 'PENDIENTE';
  cobro: string;
  horaFin: string;
  tipoVisita: string;
  aseguradora: string;
  metodoPago: string;
  estudios: string;
  procedimientos: string;
  notas: string;
}

export interface Cobro {
  id: string;
  paciente: string;
  doctor: string;
  fecha: string;
  concepto: string;
  aseguradora: string;
  metodo: string;
  monto: string;
  coaseguro: string;
  total: string;
  estado: 'PAGADO' | 'PENDIENTE' | 'CANCELADO';
  folio: string;
}

export interface Lente {
  id: string;
  nombre: string;
  modelo: string;
  categoria: string;
  esferico: string;
  cilindrico: string;
  eje: string;
  material: string;
  proveedor: string;
  caducidad: string;
  costo: string;
  stock: number;
  minimo: number;
  estado: 'Disponible' | 'Bajo' | 'Sin Stock';
  color: string;
}

export interface Aseguranza {
  id: number;
  nombre: string;
  color: string;
  pacientes: number;
  contacto: string;
  telefono: string;
}

export interface Proveedor {
  id: number;
  nombre: string;
  productos: string;
  contacto: string;
  telefono: string;
  email: string;
  website: string;
  color: string;
  iniciales: string;
}

export interface CategoriaLente {
  id: number;
  nombre: string;
  descripcion: string;
  stock: number;
  estado: string;
}

export interface StatItem {
  label: string;
  value: string;
  trend?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor?: string;
}

export interface Colaborador {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  rolColor: string;
  estado: string;
  ultimoAcceso: string;
  iniciales: string;
  avatarColor: string;
}

export interface ConfiguracionDoctor {
  id: number;
  nombre: string;
  especialidad: string;
  cedula: string;
  email: string;
  telefono: string;
  consultas: number;
  color: string;
  iniciales: string;
  estado: string;
  aseguranzas: string[];
}

export interface ConfiguracionAseguranza {
  id: number;
  nombre: string;
  pacientes: number;
  color: string;
  contacto: string;
  telefono: string;
  email: string;
  estado: string;
}

export interface ConfiguracionProveedor {
  id: number;
  nombre: string;
  especialidad: string;
  contactos: number;
  email: string;
  telefono: string;
  web: string;
  color: string;
  estado: string;
}

export interface ConfiguracionCategoriaLente {
  id: number;
  nombre: string;
  descripcion: string;
  stock: number;
  color: string;
  estado: string;
}

export interface SystemStat {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  status: string;
}

export interface RecentLog {
  timestamp: string;
  user: string;
  accion: string;
  tipo: string;
}

export interface BackupEntry {
  fecha: string;
  tipo: string;
  size: string;
  estado: string;
}

export interface PerfilActividad {
  accion: string;
  tiempo: string;
}

export type AgendaCirugiaEstado = 'agendada' | 'aplazada' | 'completada' | 'cancelada';

export interface AgendaCirugia {
  id: string;
  paciente_id: string | null;
  nombre_paciente: string;
  expediente: string | null;
  fecha: string | null;
  hora: string | null;
  jornada: string | null;
  diagnostico: string | null;
  procedimiento: string | null;
  ojo: string | null;
  lio: string | null;
  marca_lio: string | null;
  tiempo_estimado: string | null;
  tiempo_estancia: string | null;
  doctor_id: string | null;
  doctor_nombre: string | null;
  estado: AgendaCirugiaEstado;
  procedencia: string | null;
  motivo_aplazamiento: string | null;
  notas: string | null;
  notificado: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgendaCirugiaImportRow {
  nombre_paciente: string;
  expediente: string | null;
  fecha: string | null;
  hora: string | null;
  jornada: string | null;
  diagnostico: string | null;
  procedimiento: string | null;
  ojo: string | null;
  lio: string | null;
  marca_lio: string | null;
  tiempo_estimado: string | null;
  tiempo_estancia: string | null;
  cirujano_texto: string | null;
  doctor_id: string | null;
  doctor_nombre: string | null;
  notas: string | null;
  procedencia: string | null;
  motivo_aplazamiento: string | null;
  estado: AgendaCirugiaEstado;
  errores: string[];
}
