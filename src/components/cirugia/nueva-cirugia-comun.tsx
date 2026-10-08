'use client';

import { OJOS_CIRUGIA } from '@/lib/catalogos/cirugia';
import { type MiembroEquipo } from '@/lib/catalogos/equipo-quirurgico';

// Custom Skeleton for Cirugía Form - matches actual form layout
export function CirugiaFormSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* PageHeader skeleton */}
      <div className="h-5 w-20 bg-surface-2 rounded" />
      <div className="flex items-center justify-between">
        <div className="h-6 w-48 bg-surface-2 rounded" />
        <div className="h-4 w-32 bg-surface-2 rounded" />
      </div>
      
      {/* Section 1: Paciente */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-5 w-32 bg-surface-2 rounded mb-4" />
        <div className="h-8 w-full bg-surface-2 rounded mb-3" />
        <div className="h-8 w-full bg-surface-2 rounded mb-3" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
        </div>
      </div>
      
      {/* Section 2: Expediente */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-5 w-40 bg-surface-2 rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
        </div>
      </div>
      
      {/* Section 3: Datos de cirugía */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-5 w-36 bg-surface-2 rounded mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
        </div>
      </div>
      
      {/* Section 4: Equipo */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-5 w-32 bg-surface-2 rounded mb-4" />
        <div className="space-y-3">
          <div className="flex items-center gap-3 h-10 bg-surface-2 rounded px-3" />
          <div className="flex items-center gap-3 h-10 bg-surface-2 rounded px-3" />
        </div>
      </div>
      
      {/* Section 5: Recursos / Inventario */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-5 w-32 bg-surface-2 rounded mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
          <div className="h-8 bg-surface-2 rounded" />
        </div>
      </div>
      
      {/* Section 6: Archivos / Notas */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-5 w-24 bg-surface-2 rounded mb-4" />
        <div className="h-32 bg-surface-2 rounded" />
        <div className="mt-3 h-8 bg-surface-2 rounded" />
      </div>
      
      {/* Actions skeleton */}
      <div className="flex items-center justify-end gap-3 pt-4">
        <div className="h-10 w-24 bg-surface-2 rounded" />
        <div className="h-10 w-24 bg-surface-2 rounded" />
      </div>
    </div>
  );
}

export interface Paciente {
  id: string;
  nombre_completo: string;
  telefono?: string | null;
  email?: string | null;
  aseguranza_id?: string | null;
  ojo_operado?: OjoOperado;
  cirugias_previas?: number;
}

export type OjoOperado = 'sin_cirugias' | 'OD' | 'OI' | 'ambos' | 'desconocido';

export type FiltroOjo = 'todos' | 'primer' | 'segundo';

export interface HistorialOjo {
  total: number;
  od: boolean;
  oi: boolean;
  desconocido: boolean;
}

export const ETIQUETA_OJO: Record<OjoOperado, { texto: string; clase: string }> = {
  sin_cirugias: { texto: 'Sin cirugías previas', clase: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-fg-2' },
  OD: { texto: 'OD ya operado', clase: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  OI: { texto: 'OS ya operado', clase: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  ambos: { texto: 'Ambos ojos operados', clase: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  desconocido: { texto: 'Ojo sin especificar', clase: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
};

export const FILTROS_OJO: Array<{ id: FiltroOjo; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'primer', label: 'Primer ojo' },
  { id: 'segundo', label: 'Segundo ojo' },
];

export function etiquetaOjo(p: Paciente): { texto: string; clase: string } | null {
  if (!p.ojo_operado) return null;
  if (p.ojo_operado === 'sin_cirugias') {
    return { texto: 'Primer ojo', clase: ETIQUETA_OJO.sin_cirugias.clase };
  }
  if (p.ojo_operado === 'ambos') {
    return { texto: '⚠ Ambos ojos', clase: ETIQUETA_OJO.ambos.clase };
  }
  return { texto: ETIQUETA_OJO[p.ojo_operado].texto, clase: ETIQUETA_OJO[p.ojo_operado].clase };
}

export interface Aseguranza {
  id: string;
  nombre: string;
}

export interface Servicio {
  id: string;
  nombre: string;
  tipo: string;
  costo: number;
  /** Bandera de catálogo (mig. requiere_lio): activa el bloque de LIO. */
  requiere_lio?: boolean;
}

export interface Doctor {
  id: string;
  nombre: string;
  especialidad?: string | null;
  /** Personal unificado (mig. 390): MEDICO | ENFERMERO */
  tipo_personal?: string | null;
}

export interface Rol {
  id: string;
  clave: string;
  nombre: string;
}

export interface Recurso {
  id: string;
  nombre: string;
  ubicacion?: string | null;
}

export interface PacienteResumen {
  paciente: Paciente & {
    sexo?: string | null;
    fecha_nacimiento?: string | null;
    edad?: number | null;
    numero_poliza?: string | null;
    numero_afiliacion?: string | null;
  };
  aseguranza: Aseguranza | null;
  ultima_consulta: { fecha: string; diagnostico: string | null } | null;
  consultas_previas: number;
  cirugias_previas: number;
  expediente_id: string;
}

/** Payload de un médico del equipo hacia POST /api/cirugias. */
export interface Participante {
  medico_id: string;
  rol_id: string;
  hora_inicio: string;
  hora_fin: string;
}

export interface ArchivoLocal {
  id: string;
  file: File;
  tipo_documento: string;
  /** true si eligió «Otro» y captura el tipo a mano. */
  otro?: boolean;
}

// OD / OS / OU (el valor 'OI' se conserva en BD; ver lib/catalogos/cirugia).
export const OJOS = OJOS_CIRUGIA;

export const EXTENSIONES_PERMITIDAS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

/** Catálogos: casi estáticos → sin revalidar en cada foco de ventana. */
export const OPCIONES_CATALOGO = { revalidateOnFocus: false, dedupingInterval: 60_000 } as const;

export function comoLista<T>(v: T[] | undefined | null): T[] {
  return Array.isArray(v) ? v : [];
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

/** Lo que se autoguarda de «Nueva cirugía» (los archivos adjuntos no se pueden guardar). */
export interface BorradorCirugia {
  paciente: Paciente | null;
  origenId: string;
  servicioId: string;
  ojo: string;
  fecha: string;
  hora: string;
  duracionMin: number | '';
  recursoId: string;
  participantes: MiembroEquipo[];
  notas: string;
  diagnostico: string;
  diagnosticoEditado: boolean;
  anestesia: string;
  procedencia: string;
  especialidad: string;
  especialidadEditada: boolean;
  procedimientosAdicionales: string[];
  lioTorico: boolean;
  fabricanteLio: string;
  modeloLioId: string;
  lioManual: boolean;
  lioManualMarca: string;
  lioManualModelo: string;
  lioManualPotencia: string;
}

export const CLAVE_BORRADOR_CIRUGIA = 'draft:nueva-cirugia';
