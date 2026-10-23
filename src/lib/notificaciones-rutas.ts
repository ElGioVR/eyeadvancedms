/**
 * A qué pantalla lleva cada notificación (campanita de la app y notificación
 * push del celular usan la misma regla).
 */
export function urlDeNotificacion(entidadTipo: string | null | undefined, entidadId: string | null | undefined): string {
  switch (entidadTipo) {
    case 'consulta':
      return entidadId ? `/consultas/${entidadId}` : '/agenda';
    case 'agenda_cirugia':
    case 'cirugia':
      return entidadId ? `/cirugias/${entidadId}` : '/agenda';
    case 'inventario_item':
    case 'lente':
      return '/inventario';
    case 'honorarios':
      return '/mis-honorarios';
    default:
      return '/dashboard';
  }
}
