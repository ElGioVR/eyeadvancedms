import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Presencia del personal clínico activo (doctores.activo + su usuario).
 * La app registra actividad en `usuarios.sesion_vista_at` (latido máximo cada 60 s
 * en cada petición autenticada) y el inicio de la sesión en `sesion_activa_desde`.
 */

/** Sin actividad más de este tiempo → desconectado. El dashboard refresca cada 30 s–2 min. */
export const UMBRAL_EN_LINEA_MS = 5 * 60_000;

export type EstadoPresencia = 'en_linea' | 'desconectado' | 'sin_cuenta';

export interface PersonalPresencia {
  id: string;
  nombre: string;
  iniciales: string;
  tipoPersonal: string;
  especialidad: string;
  estado: EstadoPresencia;
  /** Inicio de la sesión actual (solo si está en línea). */
  conectadoDesde: string | null;
  /** Última actividad registrada. */
  ultimaActividad: string | null;
  dispositivo: string | null;
}

function iniciales(nombre: string): string {
  return nombre.split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

export async function getPersonalPresencia(): Promise<PersonalPresencia[] | null> {
  const supabase = getSupabaseAdmin();
  const { data: docs, error } = await supabase
    .from('doctores')
    .select('id, alias, especialidad, tipo_personal, usuario_id')
    .eq('activo', true)
    .order('alias')
    .limit(300);
  if (error || !docs) return null;

  const ids = docs.map((d) => d.usuario_id).filter((x): x is string => !!x);
  // Sin la migración de sesión (42703) la lista sale igual, pero sin estado de conexión.
  const { data: usuarios } = ids.length
    ? await supabase
        .from('usuarios')
        .select('id, sesion_activa_id, sesion_activa_desde, sesion_vista_at, sesion_dispositivo')
        .in('id', ids)
    : { data: [] as Array<Record<string, string | null>> };
  const porId = new Map((usuarios ?? []).map((u) => [u.id as string, u]));

  const ahora = Date.now();
  const lista: PersonalPresencia[] = docs.map((d) => {
    const u = d.usuario_id ? porId.get(d.usuario_id) : undefined;
    const vista = (u?.sesion_vista_at as string | null | undefined) ?? null;
    const enLinea =
      !!u?.sesion_activa_id && !!vista && ahora - Date.parse(vista) <= UMBRAL_EN_LINEA_MS;
    const nombre = d.alias || 'Sin nombre';
    return {
      id: d.id,
      nombre,
      iniciales: iniciales(nombre),
      tipoPersonal: d.tipo_personal ?? 'MEDICO',
      especialidad: d.especialidad ?? '',
      estado: !d.usuario_id ? 'sin_cuenta' : enLinea ? 'en_linea' : 'desconectado',
      conectadoDesde: enLinea ? ((u?.sesion_activa_desde as string | null) ?? null) : null,
      ultimaActividad: vista,
      dispositivo: u?.sesion_dispositivo ?? null,
    };
  });

  // En línea primero (más tiempo conectado arriba), luego desconectados por última conexión, sin cuenta al final.
  const rango = (p: PersonalPresencia) => (p.estado === 'en_linea' ? 0 : p.estado === 'desconectado' ? 1 : 2);
  lista.sort((a, b) => {
    if (rango(a) !== rango(b)) return rango(a) - rango(b);
    if (a.estado === 'en_linea') return (a.conectadoDesde ?? '').localeCompare(b.conectadoDesde ?? '');
    if (a.estado === 'desconectado') return (b.ultimaActividad ?? '').localeCompare(a.ultimaActividad ?? '');
    return a.nombre.localeCompare(b.nombre);
  });
  return lista;
}
