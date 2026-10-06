'use client';

import { cn } from '@/lib/utils';

export interface PacienteAPI {
  id: string;
  nombre: string;
  nombre_completo?: string;
  edad: number | null;
  sexo: string | null;
  aseguradora: string | null;
  aseguranza_id: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  numero_expediente?: string | null;
  /** true = viene de /api/search (sin edad/sexo/aseguranza); se completa al seleccionarlo. */
  parcial?: boolean;
  subtitulo?: string;
}

export interface BusquedaPacienteResult {
  tipo: string;
  id: string;
  titulo: string;
  subtitulo: string;
}

export interface DoctorAPI {
  id: string;
  alias?: string | null;
  nombre: string;
  especialidad?: string | null;
  /** Personal unificado (mig. 390) */
  tipo_personal?: string | null;
  cobra_honorarios?: boolean;
  honorario_consulta: number;
  honorario_estudio: number;
  honorario_procedimiento: number;
}

export interface MatrizCosto {
  id: string;
  tipo_consulta: string;
  tipo_visita: string;
  costo: number;
  descripcion: string | null;
  activo: boolean;
}

export interface CatalogoEstudio {
  id: string;
  nombre: string;
  descripcion: string | null;
  costo: number;
  bilateral: boolean;
  activo: boolean;
}

export interface CatalogoProcedimiento {
  id: string;
  nombre: string;
  descripcion: string | null;
  costo: number;
  por_ojo: boolean;
  activo: boolean;
}

export interface CatalogoConsulta {
  id: string;
  nombre: string;
  descripcion: string | null;
  costo: number;
  activo: boolean;
}

export interface AseguranzaAPI {
  id: string;
  nombre: string;
  porcentaje_cobertura: number | null;
}

export interface EstudioSeleccionado {
  id: string;
  mismoDoctor: boolean;
  doctorId?: string;
  /** Médico que indica el estudio; vacío = doctor de la consulta. */
  indicadoPorId?: string;
}

export interface ProcedimientoSeleccionado {
  id: string;
  motivo?: string;
  mismoDoctor: boolean;
  doctorId?: string;
  /** Médico que indica el procedimiento; vacío = doctor de la consulta. */
  indicadoPorId?: string;
}

export const consultTypeOptions = ['Primera Consulta', 'Consulta de Urgencia', 'Revisión Pre-Operatoria', 'Control Post-Operatorio'];

export const visitTypeOptions = ['Primera Vez', 'Visita de Retorno'];

export const paymentMethodOptions = ['Efectivo', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Transferencia'];

export const TIPO_CONSULTA_MAP: Record<string, string> = {
  // Tipos de la agenda (punto II): Primera / Subsecuente → Consulta; Estudios; Procedimientos
  'Consulta': 'CONSULTA',
  'Estudio': 'ESTUDIO',
  'Procedimiento': 'PROCEDIMIENTO',
  'Primera Consulta': 'CONSULTA',
  'Consulta de Urgencia': 'CONSULTA',
  'Revisión Pre-Operatoria': 'REVISION',
  'Control Post-Operatorio': 'REVISION',
};

export const TIPO_VISITA_MAP: Record<string, string> = {
  'Primera Vez': 'PRIMERA_VEZ',
  'Visita de Retorno': 'SUBSECUENTE',
};

export const DRAFT_STORAGE_KEY = 'draft:nueva-consulta';

export type ServicioPaciente = {
  id: string;
  tipo: string;
  nombre: string;
  costo: number;
  porcentaje_cobertura?: number | null;
};

export interface PacienteDetalleAPI {
  id: string;
  nombre_completo: string;
  edad?: number | null;
  sexo?: string | null;
  aseguradora?: string | null;
  aseguranza_id?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}

/** GET /api/pacientes/[id] → forma que usa el selector (sexo H/M). */
export function normalizarPacienteDetalle(p: PacienteDetalleAPI): PacienteAPI {
  const sexo = p.sexo === 'MASCULINO' ? 'H' : p.sexo === 'FEMENINO' ? 'M' : (p.sexo ?? null);
  return {
    id: p.id,
    nombre: p.nombre_completo,
    nombre_completo: p.nombre_completo,
    edad: p.edad ?? null,
    sexo,
    aseguradora: p.aseguradora ?? null,
    aseguranza_id: p.aseguranza_id ?? null,
    telefono: p.telefono ?? null,
    email: p.email ?? null,
    direccion: p.direccion ?? null,
  };
}

export function validarNuevoPaciente(p: { nombre_completo: string; fecha_nacimiento: string; telefono: string; email: string; direccion: string; numero_expediente?: string }): string | null {
  const nombre = p.nombre_completo.trim();
  if (!nombre) return 'El nombre es requerido';
  if (nombre.length > 255) return 'El nombre admite máximo 255 caracteres';
  // Opcional: si se captura, debe ser una fecha válida.
  if (p.fecha_nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(p.fecha_nacimiento)) return 'La fecha de nacimiento no es válida';
  if (p.telefono.trim().length > 20) return 'El teléfono admite máximo 20 caracteres';
  const email = p.email.trim();
  if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return 'Email inválido';
  if (p.direccion.trim().length > 1000) return 'La dirección admite máximo 1000 caracteres';
  if ((p.numero_expediente ?? '').trim().length > 50) return 'El número de expediente admite máximo 50 caracteres';
  return null;
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function getAvatarColor(id: string): string {
  const colors = ['bg-primary-500', 'bg-purple-500', 'bg-emerald-500', 'bg-rose-500', 'bg-sky-500', 'bg-amber-500'];
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(mins)) return time;
  const total = Math.min((hours * 60) + mins + minutes, (23 * 60) + 59);
  const nextHours = Math.floor(total / 60);
  const nextMins = total % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMins).padStart(2, '0')}`;
}

export function timeToMinutes(time: string): number | null {
  const [hours, mins] = time.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(mins)) return null;
  return (hours * 60) + mins;
}

export function PreviewField({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-line dark:bg-surface', full && 'col-span-2')}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</span>
      <p className={cn('mt-1 text-sm font-medium text-fg', full && 'break-words')}>{value}</p>
    </div>
  );
}
