import { getSupabaseAdmin } from '@/lib/supabase/admin';

export class CierrePeriodoService {
  private supabase = getSupabaseAdmin();

  async cerrarPeriodo(
    periodoId: string,
    cerradoPor: string
  ): Promise<{
    periodo_cerrado: string;
    eventos_congelados: number;
    liquidaciones_generadas: number;
  }> {
    const { data: periodo, error: e1 } = await this.supabase
      .from('periodos_pago')
      .select('*')
      .eq('id', periodoId)
      .single();

    if (e1 || !periodo) throw new Error(`Período ${periodoId} no encontrado`);

    if (periodo.estado !== 'ABIERTO' && periodo.estado !== 'EN_REVISION') {
      throw new Error(`El período ${periodo.codigo} tiene estado ${periodo.estado}. Solo se pueden cerrar períodos ABIERTOS o EN_REVISION`);
    }

    const { count: eventosCount } = await this.supabase
      .from('eventos_honorario')
      .select('*', { count: 'exact', head: true })
      .eq('periodo_id', periodoId)
      .eq('estado', 'DEVENGADO');

    await this.supabase
      .from('eventos_honorario')
      .update({ estado: 'LIQUIDADO' })
      .eq('periodo_id', periodoId)
      .eq('estado', 'DEVENGADO');

    const liquidacionesGeneradas = await this.generarLiquidaciones(periodoId);

    await this.supabase
      .from('periodos_pago')
      .update({
        estado: 'CERRADO',
        cerrado_por: cerradoPor,
        cerrado_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', periodoId);

    await this.supabase
      .from('bitacora_honorarios')
      .insert({
        tabla: 'periodos_pago',
        registro_id: periodoId,
        accion: 'CIERRE',
        valor_anterior: { estado: periodo.estado },
        valor_nuevo: { estado: 'CERRADO', eventos: eventosCount },
        usuario_id: cerradoPor,
      });

    return {
      periodo_cerrado: periodoId,
      eventos_congelados: eventosCount || 0,
      liquidaciones_generadas: liquidacionesGeneradas,
    };
  }

  async reabrirPeriodo(periodoId: string, usuarioId: string, motivo: string): Promise<void> {
    const { data: periodo, error: e1 } = await this.supabase
      .from('periodos_pago')
      .select('*')
      .eq('id', periodoId)
      .single();

    if (e1 || !periodo) throw new Error(`Período ${periodoId} no encontrado`);

    if (periodo.estado === 'PAGADO') {
      throw new Error('No se puede reabrir un período ya pagado');
    }

    const { data: liquidacionesPagadas } = await this.supabase
      .from('liquidaciones_doctor')
      .select('id')
      .eq('periodo_id', periodoId)
      .eq('estado', 'PAGADA');

    if (liquidacionesPagadas && liquidacionesPagadas.length > 0) {
      throw new Error(`Hay ${liquidacionesPagadas.length} liquidaciones ya pagadas. No se puede reabrir.`);
    }

    await this.supabase
      .from('eventos_honorario')
      .update({ estado: 'DEVENGADO' })
      .eq('periodo_id', periodoId)
      .eq('estado', 'LIQUIDADO');

    await this.supabase
      .from('liquidaciones_doctor')
      .delete()
      .eq('periodo_id', periodoId)
      .neq('estado', 'PAGADA');

    await this.supabase
      .from('periodos_pago')
      .update({
        estado: 'ABIERTO',
        cerrado_por: null,
        cerrado_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', periodoId);

    await this.supabase
      .from('bitacora_honorarios')
      .insert({
        tabla: 'periodos_pago',
        registro_id: periodoId,
        accion: 'REAPERTURA',
        valor_anterior: { estado: periodo.estado },
        valor_nuevo: { estado: 'ABIERTO', motivo },
        usuario_id: usuarioId,
      });
  }

  private async generarLiquidaciones(periodoId: string): Promise<number> {
    const { data: eventos } = await this.supabase
      .from('eventos_honorario')
      .select('doctor_id, monto_devengado, moneda')
      .eq('periodo_id', periodoId)
      .eq('estado', 'LIQUIDADO');

    if (!eventos || eventos.length === 0) return 0;

    const agrupados = new Map<string, { total: number; moneda: string }>();

    for (const evento of eventos) {
      const key = `${evento.doctor_id}|${evento.moneda}`;
      const actual = agrupados.get(key) || { total: 0, moneda: evento.moneda };
      actual.total += evento.monto_devengado || 0;
      agrupados.set(key, actual);
    }

    let generadas = 0;

    for (const [key, datos] of agrupados) {
      const [doctorId, moneda] = key.split('|');

      const { data: ajustes } = await this.supabase
        .from('liquidaciones_doctor')
        .select('monto')
        .eq('periodo_id', periodoId)
        .eq('doctor_id', doctorId);

      const totalAjustes = (ajustes || []).reduce((sum, a) => sum + (a.monto || 0), 0);

      const netoPagar = datos.total + totalAjustes;

      const { error } = await this.supabase
        .from('liquidaciones_doctor')
        .upsert({
          periodo_id: periodoId,
          doctor_id: doctorId,
          total_devengado: datos.total,
          total_ajustes: totalAjustes,
          total_retenciones: 0,
          neto_pagar: netoPagar,
          moneda: moneda || 'PESOS',
          estado: 'PENDIENTE_APROBACION',
        }, {
          onConflict: 'periodo_id,doctor_id',
        });

      if (!error) generadas++;
    }

    return generadas;
  }
}
