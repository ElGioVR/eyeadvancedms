import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/server';

let cachedRate: { rate: number; timestamp: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_TTL) {
    return NextResponse.json({ rate: cachedRate.rate, source: 'cache', updated_at: new Date(cachedRate.timestamp).toISOString() });
  }

  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error('Error fetching rate');
    const data = await res.json();
    const rate = data.rates?.MXN;
    if (!rate) throw new Error('MXN rate not found');

    cachedRate = { rate, timestamp: Date.now() };
    return NextResponse.json({ rate, source: 'live', updated_at: new Date().toISOString() });
  } catch {
    if (cachedRate) {
      return NextResponse.json({ rate: cachedRate.rate, source: 'stale-cache', updated_at: new Date(cachedRate.timestamp).toISOString() });
    }
    return NextResponse.json({ rate: 20.5, source: 'estimado', warning: 'Rate from fallback, may not reflect current market', updated_at: new Date().toISOString() });
  }
}
