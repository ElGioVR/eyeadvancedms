import type { ResumenFila } from './resumen';

export interface MetricasKpis {
  monto: number;
  eventos: number;
  pagado: number;
  por_pagar: number;
  sin_monto: number;
  cancelado: number;
  ticket_promedio: number;
}

export interface MetricaDoctorFila {
  doctor_id: string;
  doctor_nombre: string;
  eventos: number;
  monto: number;
  pagado: number;
  por_pagar: number;
}

export interface MetricaValorFila {
  label: string;
  monto: number;
  eventos: number;
}

export interface MetricaSerieFila {
  fecha: string;
  monto: number;
  eventos: number;
}

export interface MetricasPayload {
  kpis: MetricasKpis;
  por_doctor: MetricaDoctorFila[];
  por_fuente: MetricaValorFila[];
  por_estado: MetricaValorFila[];
  serie_diaria: MetricaSerieFila[];
}

const ORDEN_ESTADOS = ['PAGADO', 'POR_PAGAR', 'PENDIENTE_CONFIG', 'CANCELADO'] as const;

export function agregarMetricas(
  filas: ResumenFila[],
  nombres: Map<string, string>
): MetricasPayload {
  const kpis: MetricasKpis = {
    monto: 0,
    eventos: 0,
    pagado: 0,
    por_pagar: 0,
    sin_monto: 0,
    cancelado: 0,
    ticket_promedio: 0,
  };
  const doctores = new Map<string, MetricaDoctorFila>();
  const fuentes = new Map<string, MetricaValorFila>();
  const estados = new Map<string, MetricaValorFila>();
  const serie = new Map<string, MetricaSerieFila>();

  for (const f of filas) {
    const monto = Number(f.monto) || 0;
    kpis.monto += monto;
    kpis.eventos += 1;
    if (f.estado_pago === 'PAGADO') kpis.pagado += monto;
    else if (f.estado_pago === 'POR_PAGAR') kpis.por_pagar += monto;
    else if (f.estado_pago === 'PENDIENTE_CONFIG') kpis.sin_monto += 1;
    else if (f.estado_pago === 'CANCELADO') kpis.cancelado += 1;

    const doc =
      doctores.get(f.doctor_id) ||
      ({
        doctor_id: f.doctor_id,
        doctor_nombre: nombres.get(f.doctor_id) || '—',
        eventos: 0,
        monto: 0,
        pagado: 0,
        por_pagar: 0,
      } satisfies MetricaDoctorFila);
    doc.eventos += 1;
    doc.monto += monto;
    if (f.estado_pago === 'PAGADO') doc.pagado += monto;
    else if (f.estado_pago === 'POR_PAGAR') doc.por_pagar += monto;
    doctores.set(f.doctor_id, doc);

    const fuente = f.fuente || 'OTRO';
    const ff = fuentes.get(fuente) || { label: fuente, monto: 0, eventos: 0 };
    ff.monto += monto;
    ff.eventos += 1;
    fuentes.set(fuente, ff);

    const est = estados.get(f.estado_pago) || { label: f.estado_pago, monto: 0, eventos: 0 };
    est.monto += monto;
    est.eventos += 1;
    estados.set(f.estado_pago, est);

    if (f.fecha) {
      const s = serie.get(f.fecha) || { fecha: f.fecha, monto: 0, eventos: 0 };
      s.monto += monto;
      s.eventos += 1;
      serie.set(f.fecha, s);
    }
  }

  kpis.ticket_promedio = kpis.eventos ? kpis.monto / kpis.eventos : 0;

  return {
    kpis,
    por_doctor: [...doctores.values()].sort((a, b) => b.monto - a.monto),
    por_fuente: [...fuentes.values()].sort((a, b) => b.monto - a.monto),
    por_estado: ORDEN_ESTADOS.map((e) => estados.get(e)).filter(
      (v): v is MetricaValorFila => Boolean(v)
    ),
    serie_diaria: [...serie.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}
