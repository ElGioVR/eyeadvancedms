/** Confirmación de citas: medios y reglas compartidas por API y pantallas. */
export const MEDIOS_CONFIRMACION = ['whatsapp', 'telefono', 'correo', 'presencial'] as const;
export type MedioConfirmacion = (typeof MEDIOS_CONFIRMACION)[number];

export const ETIQUETA_MEDIO: Record<MedioConfirmacion, string> = {
  whatsapp: 'WhatsApp',
  telefono: 'Teléfono',
  correo: 'Correo',
  presencial: 'Presencial',
};

/** Una cita se puede confirmar mientras siga abierta (no completada ni cancelada). */
export function puedeConfirmarse(estado: string | null | undefined): boolean {
  return estado === 'agendada' || estado === 'reagendada';
}

export function estaConfirmada(c: { estado?: string | null; confirmacion?: string | null }): boolean {
  return c.confirmacion === 'confirmada' && puedeConfirmarse(c.estado);
}
