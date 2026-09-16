import { getSupabaseAdmin } from '@/lib/supabase/admin';

export class ReversionService {
  private supabase = getSupabaseAdmin();

  async revertirEvento(
    eventoId: string,
    motivo: string,
    usuarioId: string
  ): Promise<{ evento_revertido: string; ajuste_generado: boolean }> {
    const { data: evento, error: e1 } = await this.supabase
      .from('eventos_honorario')
      .select('*')
      .eq('id', eventoId)
      .single();

    if (e1 || !evento) throw new Error(`Evento ${eventoId} no encontrado`);

    if (evento.estado === 'REVERSADO') {
      throw new Error('El evento ya fue revertido');
    }

    if (evento.estado === 'LIQUIDADO') {
      return this.revertirEventoLiquidado(evento, motivo, usuarioId);
    }

    const { error: updateError } = await this.supabase
      .from('eventos_honorario')
      .update({ estado: 'REVERSADO' })
      .eq('id', eventoId);

    if (updateError) throw new Error(`Error al revertir: ${updateError.message}`);

    await this.registrarBitacora('eventos_honorario', eventoId, 'REVERSION', {
      estado_anterior: evento.estado,
      estado_nuevo: 'REVERSADO',
      motivo,
    }, usuarioId);

    return { evento_revertido: eventoId, ajuste_generado: false };
  }

  private async revertirEventoLiquidado(
    evento: Record<string, unknown>,
    motivo: string,
    usuarioId: string
  ): Promise<{ evento_revertido: string; ajuste_generado: boolean }> {
    const liquidacionId = evento.periodo_id as string | null;

    if (liquidacionId) {
      const { data: liquidacion } = await this.supabase
        .from('liquidaciones_doctor')
        .select('id')
        .eq('periodo_id', liquidacionId)
        .eq('doctor_id', evento.doctor_id)
        .maybeSingle();

      if (liquidacion) {
        const montoDevengado = (evento.monto_devengado as number) || 0;

        await this.supabase
          .from('ajustes_liquidacion')
          .insert({
            liquidacion_id: liquidacion.id,
            tipo: 'CORRECCION',
            concepto: `Reversión evento ${evento.origen_tipo} ${evento.origen_id}`,
            monto: -montoDevengado,
            motivo,
            creado_por: usuarioId,
          });

        const { data: liq } = await this.supabase
          .from('liquidaciones_doctor')
          .select('total_ajustes, neto_pagar')
          .eq('id', liquidacion.id)
          .single();

        if (liq) {
          await this.supabase
            .from('liquidaciones_doctor')
            .update({
              total_ajustes: (liq.total_ajustes || 0) - montoDevengado,
              neto_pagar: (liq.neto_pagar || 0) - montoDevengado,
              updated_at: new Date().toISOString(),
            })
            .eq('id', liquidacion.id);
        }

        await this.registrarBitacora('eventos_honorario', evento.id as string, 'REVERSION_LIQUIDADO', {
          estado_anterior: 'LIQUIDADO',
          estado_nuevo: 'REVERSADO',
          ajuste: -montoDevengado,
          motivo,
        }, usuarioId);

        return { evento_revertido: evento.id as string, ajuste_generado: true };
      }
    }

    const { error } = await this.supabase
      .from('eventos_honorario')
      .update({ estado: 'REVERSADO' })
      .eq('id', evento.id);

    if (error) throw new Error(`Error al revertir: ${error.message}`);

    return { evento_revertido: evento.id as string, ajuste_generado: false };
  }

  async revertirConsulta(consultaId: string, motivo: string, usuarioId: string): Promise<{ revertidos: number }> {
    const { data: eventos } = await this.supabase
      .from('eventos_honorario')
      .select('id')
      .eq('origen_tipo', 'CONSULTA')
      .eq('origen_id', consultaId)
      .not('estado', 'eq', 'REVERSADO');

    let revertidos = 0;
    for (const evento of eventos || []) {
      await this.revertirEvento(evento.id, motivo, usuarioId);
      revertidos++;
    }

    return { revertidos };
  }

  async revertirCirugia(cirugiaId: string, motivo: string, usuarioId: string): Promise<{ revertidos: number }> {
    const { data: eventos } = await this.supabase
      .from('eventos_honorario')
      .select('id')
      .eq('origen_tipo', 'OPERACION')
      .eq('origen_id', cirugiaId)
      .not('estado', 'eq', 'REVERSADO');

    let revertidos = 0;
    for (const evento of eventos || []) {
      await this.revertirEvento(evento.id, motivo, usuarioId);
      revertidos++;
    }

    return { revertidos };
  }

  private async registrarBitacora(
    tabla: string,
    registroId: string,
    accion: string,
    valores: Record<string, unknown>,
    usuarioId: string
  ): Promise<void> {
    await this.supabase
      .from('bitacora_honorarios')
      .insert({
        tabla,
        registro_id: registroId,
        accion,
        valor_anterior: { estado: valores.estado_anterior },
        valor_nuevo: { estado: valores.estado_nuevo, motivo: valores.motivo, ajuste: valores.ajuste },
        usuario_id: usuarioId,
      });
  }
}
