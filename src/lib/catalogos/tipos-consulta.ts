/**
 * Tipo de consulta en la agenda (Modificaciones agenda, punto II):
 * Primera consulta · Subsecuente · Estudios · Procedimientos.
 *
 * Se traduce a los dos campos que ya usan costos (matriz_costos) y honorarios:
 * tipo_consulta (CONSULTA | ESTUDIO | PROCEDIMIENTO) y tipo_visita
 * (PRIMERA_VEZ | SUBSECUENTE). No requiere cambios de esquema.
 */
export type TipoConsultaAgenda = 'PRIMERA' | 'SUBSECUENTE' | 'ESTUDIOS' | 'PROCEDIMIENTOS';

export interface OpcionTipoConsulta {
  value: TipoConsultaAgenda;
  label: string;
  /** Valor que el formulario envía como tipo_consulta (el servidor lo mapea). */
  tipo: 'Consulta' | 'Estudio' | 'Procedimiento';
  /** Valor que el formulario envía como tipo_visita. */
  tipoVisita: 'Primera Vez' | 'Visita de Retorno';
}

export const TIPOS_CONSULTA_AGENDA: OpcionTipoConsulta[] = [
  { value: 'PRIMERA', label: 'Primera consulta', tipo: 'Consulta', tipoVisita: 'Primera Vez' },
  { value: 'SUBSECUENTE', label: 'Subsecuente', tipo: 'Consulta', tipoVisita: 'Visita de Retorno' },
  { value: 'ESTUDIOS', label: 'Estudios', tipo: 'Estudio', tipoVisita: 'Primera Vez' },
  { value: 'PROCEDIMIENTOS', label: 'Procedimientos', tipo: 'Procedimiento', tipoVisita: 'Primera Vez' },
];

export function opcionTipoConsulta(value: string | null | undefined): OpcionTipoConsulta {
  return TIPOS_CONSULTA_AGENDA.find((t) => t.value === value) ?? TIPOS_CONSULTA_AGENDA[0];
}

/** Etiqueta legible a partir de lo guardado en BD (tipo_consulta + tipo_visita). */
export function etiquetaTipoConsulta(tipoConsulta: string | null | undefined, tipoVisita: string | null | undefined): string {
  const t = (tipoConsulta || '').toUpperCase();
  if (t.includes('ESTUDIO')) return 'Estudios';
  if (t.includes('PROCEDIMIENTO')) return 'Procedimientos';
  return (tipoVisita || '').toUpperCase() === 'SUBSECUENTE' ? 'Subsecuente' : 'Primera consulta';
}

/** Valores tal como se guardan en BD (lo que espera PATCH /api/consultas/[id]). */
export function valoresBdTipoConsulta(value: TipoConsultaAgenda): { tipo_consulta: 'CONSULTA' | 'ESTUDIO' | 'PROCEDIMIENTO'; tipo_visita: 'PRIMERA_VEZ' | 'SUBSECUENTE' } {
  if (value === 'ESTUDIOS') return { tipo_consulta: 'ESTUDIO', tipo_visita: 'PRIMERA_VEZ' };
  if (value === 'PROCEDIMIENTOS') return { tipo_consulta: 'PROCEDIMIENTO', tipo_visita: 'PRIMERA_VEZ' };
  return { tipo_consulta: 'CONSULTA', tipo_visita: value === 'SUBSECUENTE' ? 'SUBSECUENTE' : 'PRIMERA_VEZ' };
}

/** Inverso: tipo de la agenda a partir de lo guardado (históricos REVISION → consulta). */
export function tipoAgendaDesdeBd(tipoConsulta: string | null | undefined, tipoVisita: string | null | undefined): TipoConsultaAgenda {
  const etiqueta = etiquetaTipoConsulta(tipoConsulta, tipoVisita);
  return TIPOS_CONSULTA_AGENDA.find((t) => t.label === etiqueta)!.value;
}
