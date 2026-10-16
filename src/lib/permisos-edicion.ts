/**
 * Reglas de edición de citas (compartidas por cliente y servidor).
 * - Un estado cerrado (completada/cancelada) no se edita por enfermería.
 * - La comparación ignora mayúsculas: cirugías en minúsculas, consultas en mayúsculas.
 */
const ESTADOS_CERRADOS = new Set(['completada', 'completado', 'cancelada', 'cancelado']);

export function estadoCerrado(estado: string | null | undefined): boolean {
  return ESTADOS_CERRADOS.has(String(estado ?? '').toLowerCase());
}

/**
 * ¿Se puede editar la cirugía? (documento «Agenda de cirugía», 16 oct 2026: «necesitamos poder
 * editar si hubiera algún error» aun después de concluida).
 * - Cancelada: no (se reagenda o se crea otra).
 * - Completada: sí, salvo enfermería; los lentes ya usados quedan fijos.
 * - Resto: sí.
 */
export function puedeEditarCirugia(estado: string | null | undefined, rol: string | null | undefined): boolean {
  const e = String(estado ?? '').toLowerCase();
  if (e === 'cancelada' || e === 'cancelado') return false;
  if (e === 'completada' || e === 'completado') return !!rol && rol !== 'enfermero';
  return true;
}

/** Cirugía cancelada (bloquea cambios de equipo y procedimientos en el servidor). */
export function cirugiaCancelada(estado: string | null | undefined): boolean {
  const e = String(estado ?? '').toLowerCase();
  return e === 'cancelada' || e === 'cancelado';
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
