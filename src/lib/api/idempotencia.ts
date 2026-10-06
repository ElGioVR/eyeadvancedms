import 'server-only';

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { log } from '@/lib/log';
import { uuid } from '@/lib/api/validar';

/**
 * Idempotencia para altas (POST): si el cliente manda `Idempotency-Key`,
 * un doble clic, un reintento tras timeout o dos pestañas NO crean registros
 * duplicados; la segunda petición recibe la misma respuesta que la primera.
 *
 * - Sin header (o sin la migración aplicada) → se ejecuta normal.
 * - Solo se guardan respuestas exitosas (2xx). Si la primera falla (4xx/5xx)
 *   la clave se libera y el usuario puede corregir y reintentar.
 * - Las claves duran 24 h (limpieza por pg_cron).
 */
type Handler<A extends unknown[]> = (request: Request, ...resto: A) => Promise<Response> | Response;

interface FilaIdem {
  clave: string | null;
  usuario_id: string | null;
  ruta: string | null;
  estado: 'EN_CURSO' | 'COMPLETADA' | null;
  status_http: number | null;
  respuesta: unknown;
  created_at: string | null;
}

/** Una petición EN_CURSO más vieja que esto se considera abandonada. */
const EN_CURSO_MAX_MS = 2 * 60_000;
let rpcNoDisponibleHasta = 0;

export function idempotente<A extends unknown[]>(nombre: string, handler: Handler<A>): Handler<A> {
  return async (request: Request, ...resto: A) => {
    const clave = request.headers.get('idempotency-key');
    if (!clave || !uuid.safeParse(clave).success || Date.now() < rpcNoDisponibleHasta) {
      return handler(request, ...resto);
    }
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc('reservar_idempotencia', {
      p_clave: clave,
      p_usuario: auth.user.id,
      p_ruta: nombre,
    });
    if (error) {
      // Migración sin aplicar → sin idempotencia (comportamiento anterior).
      rpcNoDisponibleHasta = Date.now() + 5 * 60_000;
      if (error.code !== 'PGRST202' && error.code !== '42883') log.warn(nombre, 'idempotencia no disponible', { codigo: error.code });
      return handler(request, ...resto);
    }

    const previa = (Array.isArray(data) ? data[0] : data) as FilaIdem | null;
    if (previa && previa.clave) {
      if (previa.usuario_id !== auth.user.id || previa.ruta !== nombre) {
        return NextResponse.json({ error: 'Clave de envío inválida. Recarga la página.', code: 'IDEMPOTENCIA_INVALIDA' }, { status: 422 });
      }
      if (previa.estado === 'COMPLETADA' && previa.status_http) {
        return NextResponse.json(previa.respuesta ?? null, {
          status: previa.status_http,
          headers: { 'Idempotent-Replayed': 'true' },
        });
      }
      const edad = previa.created_at ? Date.now() - Date.parse(previa.created_at) : 0;
      if (edad < EN_CURSO_MAX_MS) {
        return NextResponse.json(
          { error: 'Tu solicitud anterior aún se está guardando. Espera unos segundos.', code: 'IDEMPOTENCIA_EN_CURSO' },
          { status: 409 },
        );
      }
      // Abandonada (la función murió a medio camino): se toma de nuevo.
      await supabase.from('solicitudes_idempotentes').update({ created_at: new Date().toISOString() }).eq('clave', clave);
    }

    let res: Response;
    try {
      res = await handler(request, ...resto);
    } catch (err) {
      await liberar(clave);
      throw err;
    }

    if (res.ok) {
      try {
        const cuerpo = await res.clone().json().catch(() => null);
        await supabase
          .from('solicitudes_idempotentes')
          .update({ estado: 'COMPLETADA', status_http: res.status, respuesta: cuerpo })
          .eq('clave', clave);
      } catch (err) {
        log.warn(nombre, 'no se guardó la respuesta idempotente', { error: String(err).slice(0, 120) });
      }
    } else {
      await liberar(clave);
    }
    return res;
  };
}

async function liberar(clave: string) {
  try {
    await getSupabaseAdmin().from('solicitudes_idempotentes').delete().eq('clave', clave).eq('estado', 'EN_CURSO');
  } catch {
    // Si no se libera, caduca sola a los 2 min (EN_CURSO_MAX_MS).
  }
}
