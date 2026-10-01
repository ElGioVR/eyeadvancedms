/**
 * Especialidades (Modificaciones agenda, punto II): una sola lista para
 * Configuración → Doctores, consultas y agenda. La fuente de verdad es la
 * tabla cat_especialidades (migración 1800000000330); esta lista es la
 * semilla y el respaldo si el catálogo no carga.
 */
export interface Especialidad {
  id?: string;
  clave: string;
  nombre: string;
}

export const ESPECIALIDADES_BASE: Especialidad[] = [
  { clave: 'oftalmologia', nombre: 'Oftalmología' },
  { clave: 'oftalmologia_pediatrica', nombre: 'Oftalmología Pediátrica' },
  { clave: 'glaucoma', nombre: 'Glaucoma' },
  { clave: 'retina', nombre: 'Retina' },
  { clave: 'catarata_refractiva', nombre: 'Catarata y Cirugía Refractiva' },
  { clave: 'cornea', nombre: 'Córnea y Superficie Ocular' },
  { clave: 'estrabismo', nombre: 'Estrabismo' },
  { clave: 'optometria', nombre: 'Optometría' },
  { clave: 'neuroftalmologia', nombre: 'Neuroftalmología' },
  { clave: 'oculoplastica', nombre: 'Oculoplástica' },
];

const quitarAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Busca la especialidad por nombre ignorando acentos/mayúsculas
 * (p. ej. el valor antiguo "Cornea y Superficie Ocular" de doctores).
 */
export function buscarEspecialidad<T extends Especialidad>(lista: T[], nombre: string | null | undefined): T | undefined {
  if (!nombre) return undefined;
  const n = quitarAcentos(nombre);
  return lista.find((e) => quitarAcentos(e.nombre) === n || e.clave === n);
}
