import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/server';
import { ruta } from '@/lib/api/ruta';

// Caché por instancia + deduplicación de peticiones simultáneas.
let cachedRate: { rate: number; timestamp: number } | null = null;
let enCurso: Promise<number> | null = null;
/** Tras un fallo no se reintenta la API externa hasta esta marca (evita esperar el timeout en cada request). */
let reintentarDesde = 0;
const ESPERA_TRAS_FALLO = 5 * 60 * 1000;
const CACHE_TTL = 60 * 60 * 1000; // 1 hora
const TIMEOUT_MS = 3000;
const RATE_RESPALDO = 20.5;

async function obtenerTipoCambio(): Promise<number> {
  const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Error fetching rate');
  const data = (await res.json()) as { rates?: Record<string, unknown> };
  const rate = Number(data?.rates?.MXN);
  // Validación de cordura: descarta respuestas corruptas
  if (!Number.isFinite(rate) || rate <= 1 || rate >= 100) throw new Error('MXN rate not found');
  return rate;
}

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_TTL) {
    return NextResponse.json({ rate: cachedRate.rate, source: 'cache', updated_at: new Date(cachedRate.timestamp).toISOString() });
  }

  try {
    if (Date.now() < reintentarDesde) throw new Error('backoff');
    if (!enCurso) {
      enCurso = obtenerTipoCambio().finally(() => {
        enCurso = null;
      });
    }
    const rate = await enCurso;

    cachedRate = { rate, timestamp: Date.now() };
    return NextResponse.json({ rate, source: 'live', updated_at: new Date().toISOString() });
  } catch (err) {
    if (!(err instanceof Error && err.message === 'backoff')) {
      reintentarDesde = Date.now() + ESPERA_TRAS_FALLO;
      console.error('[fx.usd-mxn]', err instanceof Error ? err.message : err);
    }
    if (cachedRate) {
      return NextResponse.json({ rate: cachedRate.rate, source: 'stale-cache', updated_at: new Date(cachedRate.timestamp).toISOString() });
    }
    return NextResponse.json({ rate: RATE_RESPALDO, source: 'estimado', warning: 'Rate from fallback, may not reflect current market', updated_at: new Date().toISOString() });
  }
}

export const GET = ruta('fx/usd-mxn#GET', manejarGET);
