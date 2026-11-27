/**
 * ¿La fila de inventario es un lente intraocular?
 * Esquema actual: solo LIO, potencia en «sphere» y sin columna «tipo». Antes solo se aceptaba el
 * esquema legacy (tipo/tipo_lio/potencia_dioptrias), así que ningún lente dado de alta con el
 * formulario actual se descontaba al completar la cirugía.
 */
export function esItemLIO(item: { tipo?: string | null; tipo_lio?: string | null; potencia_dioptrias?: number | null; sphere?: number | null }): boolean {
  return (
    item.tipo === 'LENTE_INTRAOCULAR' ||
    item.tipo_lio != null ||
    item.potencia_dioptrias != null ||
    item.sphere != null ||
    item.tipo == null
  );
}
