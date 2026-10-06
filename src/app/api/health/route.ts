import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ruta } from '@/lib/api/ruta';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * Salud del servicio para el monitor externo (UptimeRobot / Better Stack).
 * Público y sin datos: solo dice si la app responde y si llega a la BD.
 * 200 = todo bien · 503 = la BD no responde (o tarda > 5 s).
 */
async function manejarGET() {
  const inicio = performance.now();
  const supabase = getSupabaseAdmin();
  let bdOk = false;
  try {
    const limite = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
    // RPC salud() (migración de performance); si aún no existe, una lectura mínima.
    const r = await Promise.race([supabase.rpc('salud'), limite]);
    if (!r.error) bdOk = true;
    else {
      const r2 = await Promise.race([supabase.from('usuarios').select('id', { head: true }).limit(1), limite]);
      bdOk = !r2.error;
    }
  } catch {
    bdOk = false;
  }
  const ms = Math.round(performance.now() - inicio);
  if (!bdOk) log.warn('health', 'bd no disponible', { ms });
  return NextResponse.json(
    { ok: bdOk, bd: bdOk ? 'ok' : 'error', ms, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
    { status: bdOk ? 200 : 503 },
  );
}

export const GET = ruta('health#GET', manejarGET);
