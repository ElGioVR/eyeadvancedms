import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';
import { MotorDevengoService } from '@/services/productividad';

const syncSchema = z.object({
  fecha_desde: z.string().optional(),
  fecha_hasta: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = syncSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0]?.message || 'Datos inválidos' }, { status: 400 });
  }

  const startedAt = performance.now();
  const supabase = getSupabaseAdmin();
  const { fecha_desde, fecha_hasta } = validation.data;
  const desde = fecha_desde || new Date().toISOString().slice(0, 10);
  const hasta = fecha_hasta || new Date().toISOString().slice(0, 10);
  const errores: string[] = [];
  let consultasVerificadas = 0;
  let cirugiasVerificadas = 0;
  let eventosCreados = 0;
  let eventosExistentes = 0;

  try {
    const { data: consultas } = await supabase
      .from('consultas')
      .select('id, doctor_id, fecha, paciente_id, aseguranza_id, estatus')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .in('estatus', ['PROCESADA', 'COMPLETADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA']);

    if (consultas) {
      consultasVerificadas = consultas.length;
      for (const consulta of consultas) {
        try {
          const { data: eventos } = await supabase
            .from('eventos_honorario')
            .select('id')
            .eq('origen_tipo', 'CONSULTA')
            .eq('origen_id', consulta.id)
            .limit(1);

          const service = new MotorDevengoService();

          if (eventos && eventos.length > 0) {
            eventosExistentes++;
          } else {
            const resultado = await service.generarDesdeConsulta(consulta.id);
            eventosCreados += resultado.eventos_creados;
          }
        } catch (err) {
          errores.push(`Consulta ${consulta.id}: ${err instanceof Error ? err.message : 'Error'}`);
        }
      }
    }

    const { data: cirugias } = await supabase
      .from('agenda_cirugias')
      .select('id, doctor_id, fecha, procedimiento, estado, consulta_id')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .neq('estado', 'cancelada');

    if (cirugias) {
      cirugiasVerificadas = cirugias.length;
      for (const cirugia of cirugias) {
        try {
          const { data: eventos } = await supabase
            .from('eventos_honorario')
            .select('id')
            .eq('origen_tipo', 'OPERACION')
            .eq('origen_id', cirugia.id)
            .limit(1);

          const service = new MotorDevengoService();

          if (eventos && eventos.length > 0) {
            eventosExistentes++;
          } else {
            const resultado = await service.generarDesdeCirugia(cirugia.id);
            eventosCreados += resultado.eventos_creados;
          }

          if (cirugia.consulta_id) {
            const { data: eventosConsulta } = await supabase
              .from('eventos_honorario')
              .select('id')
              .eq('origen_tipo', 'CONSULTA')
              .eq('origen_id', cirugia.consulta_id)
              .limit(1);

            if (eventosConsulta && eventosConsulta.length > 0) {
              // La consulta ya tiene honorarios; la cirugía es independiente
              // No duplicar
            }
          }
        } catch (err) {
          errores.push(`Cirugía ${cirugia.id}: ${err instanceof Error ? err.message : 'Error'}`);
        }
      }
    }

    const duracionMs = Math.round(performance.now() - startedAt);
    const duracionSeg = (duracionMs / 1000).toFixed(1);

    await supabase.from('sync_log').insert({
      fecha_inicio: desde,
      fecha_fin: hasta,
      consultas_verificadas: consultasVerificadas,
      cirugias_verificadas: cirugiasVerificadas,
      eventos_creados: eventosCreados,
      eventos_existentes: eventosExistentes,
      errores: errores.length,
      duracion_ms: duracionMs,
      ejecutado_por: auth.user.id,
    }).select().single();

    return NextResponse.json({
      success: true,
      sync: {
        consultas_verificadas: consultasVerificadas,
        cirugias_verificadas: cirugiasVerificadas,
        eventos_creados: eventosCreados,
        eventos_existentes: eventosExistentes,
        errores,
        duracion_ms: duracionMs,
      },
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Error en sync',
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('sync_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'Error al obtener logs de sync' }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
