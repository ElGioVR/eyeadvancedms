import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type AccionArchivo = 'ver' | 'subir' | 'descargar' | 'eliminar';

/**
 * Matriz por rol para archivos de cirugía (PER-002).
 * Los valores "Según permiso" se interpretan como denegados por defecto,
 * pudiendo concederse mediante filas en `permisos_archivo`.
 */
const PERMISOS_POR_ROL: Record<string, Record<AccionArchivo, boolean>> = {
  admin: {
    ver: true,
    subir: true,
    descargar: true,
    eliminar: true,
  },
  doctor: {
    ver: true,
    subir: true,
    descargar: true,
    eliminar: false,
  },
  recepcionista: {
    ver: false,
    subir: true,
    descargar: false,
    eliminar: false,
  },
};

/**
 * Determina si un usuario puede realizar una acción sobre archivos de cirugía.
 * Primero consulta overrides en `permisos_archivo`; si no existe, aplica la
 * matriz por rol.
 */
export async function verificarPermisoArchivo(
  usuarioId: string,
  accion: AccionArchivo
): Promise<{ permitido: boolean; rol: string }> {
  const supabase = getSupabaseAdmin();

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', usuarioId)
    .maybeSingle();

  const rol = usuario?.rol || '';

  const { data: override } = await supabase
    .from('permisos_archivo')
    .select('permitido')
    .eq('usuario_id', usuarioId)
    .eq('accion', accion)
    .maybeSingle();

  if (override) {
    return { permitido: override.permitido, rol };
  }

  return { permitido: PERMISOS_POR_ROL[rol]?.[accion] ?? false, rol };
}
