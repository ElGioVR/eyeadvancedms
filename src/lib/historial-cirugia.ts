import { ETIQUETA_MEDIO, type MedioConfirmacion } from '@/lib/confirmacion-cita';

const ETIQUETAS: Record<string, string> = {
  CIRUGIA_CREADA: 'Cirugía creada',
  LIO_ASIGNADO: 'LIO asignado',
  PARTICIPANTE_ASIGNADO: 'Participante asignado',
  ARCHIVO_AGREGADO: 'Archivo agregado',
  ARCHIVO_ELIMINADO: 'Archivo eliminado',
  ESTADO_CAMBIADO: 'Cambio de estado',
  LENTES_RESUELTOS: 'Lentes resueltos',
  NOTAS_EDITADAS: 'Notas editadas',
  CONFIRMACION_CITA: 'Confirmación de la cita',
};

const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');

/** Título y líneas de detalle legibles de un movimiento de `cirugia_historial`. */
export function describirEventoCirugia(accion: string, detalle: unknown): { titulo: string; lineas: string[] } {
  const d = (detalle && typeof detalle === 'object' ? detalle : {}) as Record<string, unknown>;
  const lineas: string[] = [];
  if (accion === 'NOTAS_EDITADAS') {
    lineas.push(`Antes: ${txt(d.anterior) || '(vacía)'}`, `Ahora: ${txt(d.nueva) || '(vacía)'}`);
  } else if (accion === 'CONFIRMACION_CITA') {
    const conf = d.confirmacion;
    const medio = typeof d.medio === 'string' ? (ETIQUETA_MEDIO[d.medio as MedioConfirmacion] ?? d.medio) : '';
    if (conf === 'confirmada') lineas.push(`Cita confirmada${medio ? ` por ${medio}` : ''}`);
    else if (conf === 'enviada') lineas.push('Mensaje de confirmación enviado');
    else lineas.push('Se quitó la confirmación');
  } else if (accion === 'ESTADO_CAMBIADO') {
    lineas.push(`${txt(d.de) || '—'} → ${txt(d.a) || '—'}`);
    if (txt(d.motivo)) lineas.push(`Motivo: ${txt(d.motivo)}`);
  }
  return { titulo: ETIQUETAS[accion] || accion, lineas };
}
