const MXN_FORMATTER = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const USD_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

let tipoCambioCache: { rate: number; fetchedAt: number } | null = null;
const TC_CACHE_TTL_MS = 60 * 60 * 1000;
const TC_FALLBACK = 17.50;

export function formatCurrency(amount: number, currency: string = 'PESOS'): string {
  if (currency === 'DOLARES' || currency === 'USD') {
    return USD_FORMATTER.format(amount);
  }
  return MXN_FORMATTER.format(amount);
}

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export async function getTipoCambio(): Promise<number> {
  if (tipoCambioCache && Date.now() - tipoCambioCache.fetchedAt < TC_CACHE_TTL_MS) {
    return tipoCambioCache.rate;
  }

  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      next: { revalidate: 3600 },
    });
    const data = await res.json();
    if (data?.rates?.MXN && typeof data.rates.MXN === 'number') {
      tipoCambioCache = { rate: data.rates.MXN, fetchedAt: Date.now() };
      return data.rates.MXN;
    }
  } catch {
    // fallback
  }

  return tipoCambioCache?.rate ?? TC_FALLBACK;
}

export function dolaresAPesos(montoDolares: number, tipoCambio: number): number {
  return roundMoney(montoDolares * tipoCambio);
}

export function pesosADolares(montoPesos: number, tipoCambio: number): number {
  if (tipoCambio <= 0) return 0;
  return roundMoney(montoPesos / tipoCambio);
}

export function parseMoneda(monto: number, monedaOrigen: string, monedaDestino: string, tipoCambio: number): number {
  if (monedaOrigen === monedaDestino) return monto;
  if (monedaOrigen === 'DOLARES' && monedaDestino === 'PESOS') return dolaresAPesos(monto, tipoCambio);
  if (monedaOrigen === 'PESOS' && monedaDestino === 'DOLARES') return pesosADolares(monto, tipoCambio);
  return monto;
}
