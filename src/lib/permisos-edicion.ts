/**
 * Reglas de edición de citas (compartidas por cliente y servidor).
 * - Un estado cerrado (completada/cancelada) no se edita por enfermería.
 * - La comparación ignora mayúsculas: cirugías en minúsculas, consultas en mayúsculas.
 */
const ESTADOS_CERRADOS = new Set(['completada', 'completado', 'cancelada', 'cancelado']);

export function estadoCerrado(estado: string | null | undefined): boolean {
  return ESTADOS_CERRADOS.has(String(estado ?? '').toLowerCase());
}

/** Campos de dinero: nunca se envían a enfermería. */
const CLAVES_MONTO = new Set([
  'costo', 'costo_total', 'monto', 'monto_pagado', 'precio', 'precio_aplicado', 'precio_base', 'tarifa',
  'saldo', 'metodo_pago', 'estatus_pago', 'fecha_pago', 'honorario', 'honorario_consulta', 'honorario_estudio',
  'honorario_procedimiento', 'productividad', 'pagos', 'cobro',
]);

/** Quita recursivamente los campos de dinero de una respuesta. */
export function quitarMontos<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map((v) => quitarMontos(v)) as T;
  if (valor && typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CLAVES_MONTO.has(clave)) continue;
      salida[clave] = quitarMontos(v);
    }
    return salida as T;
  }
  return valor;
}
