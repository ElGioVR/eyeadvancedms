import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface ResumenFila {
  fuente: string;
  doctor_id: string;
  fecha: string;
  monto: number;
  estado_pago: 'PENDIENTE_CONFIG' | 'POR_PAGAR' | 'PAGADO';
  origen: string | null;
}

export interface ResumenQuery {
  desde: string;
  hasta: string;
  doctor_id?: string;
}

export async function listarResumenHonorarios(
  query: ResumenQuery
): Promise<ResumenFila[]> {
  const supabase = getSupabaseAdmin();
  const { desde, hasta, doctor_id } = query;

  const eventosQuery = supabase
    .from('eventos_honorario')
    .select('origen_tipo, origen_id, doctor_id, paciente_id, fecha_servicio, monto_devengado, tarifa_snapshot, estado')
    .gte('fecha_servicio', desde)
    .lte('fecha_servicio', hasta)
    .neq('estado', 'REVERSADO');

  const { data: eventos } = await (doctor_id ? eventosQuery.eq('doctor_id', doctor_id) : eventosQuery);

  const filas: ResumenFila[] = [];

  for (const eh of (eventos || [])) {
    const esProcCirugia = eh.origen_tipo === 'PROCEDIMIENTO' && eh.origen_id;
    if (esProcCirugia) {
      const { data: cc } = await supabase.from('consulta_conceptos').select('consulta_id').eq('id', eh.origen_id).maybeSingle();
      if (cc?.consulta_id) {
        const { data: ac } = await supabase.from('agenda_cirugias').select('estado').eq('id', cc.consulta_id).maybeSingle();
        if (ac && ac.estado !== 'cancelada') continue;
      }
    }

    let estado_pago: ResumenFila['estado_pago'] = 'POR_PAGAR';
    if (eh.tarifa_snapshot?.sin_tarifa) estado_pago = 'PENDIENTE_CONFIG';
    else if (eh.estado === 'PAGADO') estado_pago = 'PAGADO';

    filas.push({
      fuente: eh.origen_tipo,
      doctor_id: eh.doctor_id,
      fecha: eh.fecha_servicio,
      monto: Number(eh.monto_devengado) || 0,
      estado_pago,
      origen: (eh.tarifa_snapshot as Record<string, unknown>)?.origen_nombre as string || null,
    });
  }

  // Add cirugia_productividad data via separate queries
  const { data: cpRows } = await supabase
    .from('cirugia_productividad')
    .select('id, cirugia_id, monto, estado, regla_id, participante_id');

  if (cpRows) {
    for (const cp of cpRows) {
      const { data: part } = await supabase.from('cirugia_participantes').select('medico_id').eq('id', cp.participante_id).maybeSingle();
      const { data: agenda } = await supabase.from('agenda_cirugias').select('fecha, codigo, estado').eq('id', cp.cirugia_id).maybeSingle();

      if (!agenda || agenda.estado === 'cancelada') continue;
      if (agenda.fecha < desde || agenda.fecha > hasta) continue;
      if (cp.estado === 'ANULADO') continue;

      filas.push({
        fuente: 'CIRUGIA',
        doctor_id: part?.medico_id || '',
        fecha: agenda.fecha,
        monto: Number(cp.monto) || 0,
        estado_pago: (cp.regla_id == null || cp.monto == null) ? 'PENDIENTE_CONFIG' : (cp.estado === 'PAGADO' ? 'PAGADO' : 'POR_PAGAR'),
        origen: null,
      });
    }
  }

  return filas;
}
