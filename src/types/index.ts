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
