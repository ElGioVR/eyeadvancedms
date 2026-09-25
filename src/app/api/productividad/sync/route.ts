import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';
import { MotorDevengoService } from '@/services/productividad';

const syncSchema = z.object({
  fecha_desde: z.string().optional(),
  fecha_hasta: z.string().optional(),
  solo_pendientes: z.boolean().optional(),
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
  const { fecha_desde, fecha_hasta, solo_pendientes } = validation.data;
  const desde = fecha_desde || new Date().toISOString().slice(0, 10);
  const hasta = fecha_hasta || new Date().toISOString().slice(0, 10);
  const errores: string[] = [];
  let consultasVerificadas = 0;
  let cirugiasVerificadas = 0;
  let eventosCreados = 0;
  let eventosExistentes = 0;
  let consultasDesplegadas = 0;
  let cirugiasDesplegadas = 0;

  try {
    const service = new MotorDevengoService();
    const pendientes = await service.listarPendientesDespliegue(desde, hasta);

    let queryConsultas = supabase
      .from('consultas')
      .select('id, doctor_id, fecha, paciente_id, aseguranza_id, estatus, deployed_to_performance')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .in('estatus', ['AGENDADA', 'PROCESADA', 'COMPLETADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA']);

    if (solo_pendientes) queryConsultas = queryConsultas.eq('deployed_to_performance', false);

    const { data: consultas } = await queryConsultas;

    if (consultas) {
      consultasVerificadas = consultas.length;
      // Precarga batch: eventos existentes para TODAS las consultas en 1 query
      const idsConsultas = consultas.map((c) => c.id);
      const conEventoConsulta = new Set<string>();
      for (let i = 0; i < idsConsultas.length; i += 500) {
        const chunk = idsConsultas.slice(i, i + 500);
        const { data: ev } = await supabase
          .from('eventos_honorario')
          .select('origen_id')
          .eq('origen_tipo', 'CONSULTA')
          .in('origen_id', chunk)
          .neq('estado', 'CANCELADO');
        for (const r of ev || []) conEventoConsulta.add(r.origen_id);
      }

      for (const consulta of consultas) {
        try {
          if (conEventoConsulta.has(consulta.id) && consulta.deployed_to_performance) {
            eventosExistentes++;
          } else {
            const resultado = await service.generarDesdeConsulta(consulta.id);
            eventosCreados += resultado.eventos_creados;
            eventosExistentes += resultado.eventos_existentes;
            if (resultado.deployed) consultasDesplegadas++;
            for (const docId of resultado.reportar_doctor_distinto) {
              if (!errores.includes(`doctor_distinto:${docId}`)) {
                errores.push(`doctor_distinto:${docId}`);
              }
            }
          }
        } catch (err) {
          errores.push(`Consulta ${consulta.id}: ${err instanceof Error ? err.message : 'Error'}`);
        }
      }
    }

    let queryCirugias = supabase
      .from('agenda_cirugias')
      .select('id, doctor_id, fecha, procedimiento, estado, consulta_id, deployed_to_performance')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .neq('estado', 'cancelada');

    if (solo_pendientes) queryCirugias = queryCirugias.eq('deployed_to_performance', false);

    const { data: cirugias } = await queryCirugias;

    if (cirugias) {
      cirugiasVerificadas = cirugias.length;
      // Precarga batch: eventos + doctores esperados para TODAS las cirugías en 3 queries
      const idsCirugias = cirugias.map((c) => c.id);
      const eventosPorCirugia = new Map<string, Set<string>>();
      const agdPorCirugia = new Map<string, Set<string>>();
      const partPorCirugia = new Map<string, Set<string>>();

      for (let i = 0; i < idsCirugias.length; i += 500) {
        const chunk = idsCirugias.slice(i, i + 500);
        const [{ data: ev }, { data: agd }, { data: part }] = await Promise.all([
          supabase.from('eventos_honorario').select('origen_id, doctor_id').eq('origen_tipo', 'OPERACION').in('origen_id', chunk).neq('estado', 'CANCELADO'),
          supabase.from('agenda_cirugia_doctores').select('cirugia_id, doctor_id').in('cirugia_id', chunk),
          supabase.from('cirugia_participantes').select('cirugia_id, medico_id').in('cirugia_id', chunk),
        ]);
        for (const r of ev || []) {
          if (!eventosPorCirugia.has(r.origen_id)) eventosPorCirugia.set(r.origen_id, new Set());
          eventosPorCirugia.get(r.origen_id)!.add(r.doctor_id);
        }
        for (const r of agd || []) {
          if (!r.doctor_id) continue;
          if (!agdPorCirugia.has(r.cirugia_id)) agdPorCirugia.set(r.cirugia_id, new Set());
          agdPorCirugia.get(r.cirugia_id)!.add(r.doctor_id);
        }
        for (const r of part || []) {
          if (!r.medico_id) continue;
          if (!partPorCirugia.has(r.cirugia_id)) partPorCirugia.set(r.cirugia_id, new Set());
          partPorCirugia.get(r.cirugia_id)!.add(r.medico_id);
        }
      }

      for (const cirugia of cirugias) {
        try {
          if (cirugia.estado === 'cancelada') {
            await service.cancelarPorCirugia(cirugia.id);
            continue;
          }

          const conEvento = eventosPorCirugia.get(cirugia.id) || new Set<string>();
          const esperados = new Set<string>();
          if (cirugia.doctor_id) esperados.add(cirugia.doctor_id);
          for (const d of agdPorCirugia.get(cirugia.id) || []) esperados.add(d);
          for (const m of partPorCirugia.get(cirugia.id) || []) esperados.add(m);

          const faltantes = [...esperados].filter((d) => !conEvento.has(d));

          if (faltantes.length === 0 && cirugia.deployed_to_performance) {
            eventosExistentes++;
          } else {
            const resultado = await service.generarDesdeCirugia(cirugia.id);
            eventosCreados += resultado.eventos_creados;
            eventosExistentes += resultado.eventos_existentes;
            if (resultado.deployed) cirugiasDesplegadas++;
          }
        } catch (err) {
          errores.push(`Cirugía ${cirugia.id}: ${err instanceof Error ? err.message : 'Error'}`);
        }
      }
    }

    const duracionMs = Math.round(performance.now() - startedAt);

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
        consultas_desplegadas: consultasDesplegadas,
        cirugias_desplegadas: cirugiasDesplegadas,
        pendientes_antes: {
          consultas: pendientes.consultas_pendientes,
          cirugias: pendientes.cirugias_pendientes,
          doctores_sin_evento: pendientes.doctores_sin_evento.length,
        },
        doctores_sin_evento: pendientes.doctores_sin_evento,
        doctores_en_modulo: pendientes.doctores_en_modulo,
        doctores_total: pendientes.doctores_total,
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

  const url = new URL(request.url);
  const desde = url.searchParams.get('desde') || undefined;
  const hasta = url.searchParams.get('hasta') || undefined;

  if (url.searchParams.get('preview') === '1') {
    try {
      const service = new MotorDevengoService();
      const preview = await service.listarPendientesDespliegue(desde, hasta);
      return NextResponse.json(preview);
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'Error en preview',
      }, { status: 500 });
    }
  }

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
