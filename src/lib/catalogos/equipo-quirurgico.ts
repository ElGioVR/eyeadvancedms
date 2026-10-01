/**
 * Equipo quirúrgico homologado (punto I.2): una sola lista de filas
 * Rol · Persona · Horario. Los roles médicos (cirujano, ayudante,
 * anestesiólogo…) y los de apoyo (instrumentista, enfermero, circulante) se
 * eligen del personal unificado (`doctores`, tipo MEDICO | ENFERMERO).
 * Puro: sin React ni Supabase.
 */
import { aMinutos, deMinutos } from '@/lib/agenda-slots';

export const ROLES_APOYO = ['instrumentista', 'enfermero', 'circulante'] as const;
export type RolApoyo = (typeof ROLES_APOYO)[number];

/** Filas precargadas en cada cirugía nueva (solo el cirujano es obligatorio). */
export const ROLES_POR_DEFECTO = ['cirujano', 'anestesiologo', 'instrumentista', 'enfermero', 'circulante'] as const;

export const ETIQUETAS_ROL: Record<string, string> = {
  cirujano: 'Cirujano',
  ayudante: 'Ayudante',
  anestesiologo: 'Anestesiólogo',
  instrumentista: 'Instrumentista',
  enfermero: 'Enfermero(a)',
  circulante: 'Circulante',
};

export function esRolApoyo(clave: string | null | undefined): clave is RolApoyo {
  return !!clave && (ROLES_APOYO as readonly string[]).includes(clave);
}

export interface MiembroEquipo {
  id: string;
  rol: string;
  personaId: string;
  horaInicio: string;
  horaFin: string;
  /** false = sigue la hora/duración de la cirugía automáticamente. */
  horarioEditado: boolean;
}

export function horarioCirugia(hora: string | null | undefined, duracionMin: number | '' | null | undefined): { inicio: string; fin: string } {
  if (!hora) return { inicio: '', fin: '' };
  const ini = hora.slice(0, 5);
  const dur = Number(duracionMin) > 0 ? Number(duracionMin) : 60;
  return { inicio: ini, fin: deMinutos(aMinutos(ini) + dur) };
}

export function equipoPorDefecto(
  hora: string | null | undefined,
  duracionMin: number | '' | null | undefined,
  nuevoId: () => string
): MiembroEquipo[] {
  const h = horarioCirugia(hora, duracionMin);
  return ROLES_POR_DEFECTO.map((rol) => ({ id: nuevoId(), rol, personaId: '', horaInicio: h.inicio, horaFin: h.fin, horarioEditado: false }));
}

/** Aplica la hora/duración de la cirugía a las filas cuyo horario no se tocó. */
export function sincronizarHorario(equipo: MiembroEquipo[], hora: string, duracionMin: number | ''): MiembroEquipo[] {
  const h = horarioCirugia(hora, duracionMin);
  let cambio = false;
  const out = equipo.map((m) => {
    if (m.horarioEditado || (m.horaInicio === h.inicio && m.horaFin === h.fin)) return m;
    cambio = true;
    return { ...m, horaInicio: h.inicio, horaFin: h.fin };
  });
  return cambio ? out : equipo;
}

export function seTraslapan(aIni: string, aFin: string, bIni: string, bFin: string): boolean {
  return aMinutos(aIni) < aMinutos(bFin) && aMinutos(aFin) > aMinutos(bIni);
}

/**
 * Validación del equipo (cliente y servidor usan la misma regla):
 * - cirujano obligatorio;
 * - toda fila con persona necesita horario válido (fin > inicio);
 * - la misma persona no puede estar en dos filas con horarios empalmados.
 * Las filas sin persona se ignoran (roles por defecto no obligatorios).
 */
export function validarEquipo(equipo: Pick<MiembroEquipo, 'rol' | 'personaId' | 'horaInicio' | 'horaFin'>[]): string | null {
  const llenos = equipo.filter((m) => m.personaId);
  if (!llenos.some((m) => m.rol === 'cirujano')) return 'Debe asignar al menos un cirujano';
  for (const m of llenos) {
    const rol = ETIQUETAS_ROL[m.rol] || m.rol;
    if (!m.horaInicio || !m.horaFin) return `Indica el horario de ${rol}`;
    if (aMinutos(m.horaFin) <= aMinutos(m.horaInicio)) return `El horario de ${rol} debe terminar después de iniciar`;
  }
  for (let i = 0; i < llenos.length; i++) {
    for (let j = i + 1; j < llenos.length; j++) {
      const a = llenos[i];
      const b = llenos[j];
      // Personal unificado (mig. 390): médicos y enfermería comparten ids de `doctores`.
      if (a.personaId === b.personaId && seTraslapan(a.horaInicio, a.horaFin, b.horaInicio, b.horaFin)) {
        return `La misma persona está como ${ETIQUETAS_ROL[a.rol] || a.rol} y ${ETIQUETAS_ROL[b.rol] || b.rol} en horarios que se empalman`;
      }
    }
  }
  return null;
}
