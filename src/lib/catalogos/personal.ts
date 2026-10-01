/**
 * Tipos de personal clínico (doctores.tipo_personal).
 * El anestesiólogo solo ejerce la anestesia: únicamente aparece en el rol
 * «Anestesiólogo» de las cirugías y nunca en consultas ni como cirujano.
 */
export const TIPOS_PERSONAL = ['MEDICO', 'ENFERMERO', 'ANESTESIOLOGO'] as const;
export type TipoPersonal = (typeof TIPOS_PERSONAL)[number];

export const ETIQUETA_TIPO_PERSONAL: Record<TipoPersonal, string> = {
  MEDICO: 'Médico',
  ENFERMERO: 'Enfermería',
  ANESTESIOLOGO: 'Anestesiólogo',
};

export const ROL_ANESTESIOLOGO = 'anestesiologo';

type ConTipo = { tipo_personal?: string | null };

export const esAnestesiologo = (d: ConTipo | null | undefined) => d?.tipo_personal === 'ANESTESIOLOGO';
export const esEnfermeria = (d: ConTipo | null | undefined) => d?.tipo_personal === 'ENFERMERO';
/** Médico que puede atender consultas o ser cirujano/ayudante (ni enfermería ni anestesiólogo). */
export const esMedicoTratante = (d: ConTipo | null | undefined) => !esEnfermeria(d) && !esAnestesiologo(d);

/**
 * ¿Puede esta persona ocupar el rol de cirugía? (cat_roles_participante.clave)
 * - anestesiologo → solo anestesiólogos
 * - instrumentista / enfermero / circulante → enfermería o médicos (no anestesiólogos)
 * - cirujano / ayudante / otros → solo médicos tratantes
 */
export function puedeOcuparRol(persona: ConTipo | null | undefined, rolClave: string | null | undefined, rolesApoyo: readonly string[]): boolean {
  if (!persona || !rolClave) return false;
  if (rolClave === ROL_ANESTESIOLOGO) return esAnestesiologo(persona);
  if (esAnestesiologo(persona)) return false;
  if (rolesApoyo.includes(rolClave)) return true;
  return esMedicoTratante(persona);
}
