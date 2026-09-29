import { NextResponse } from 'next/server';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON, leerQuery } from '@/lib/api/validar';
import { hoyTijuana } from '@/lib/rangos';
import { leerTodo, leerTodoEnLotes, mapConLimite } from '@/lib/productividad/lotes';
import { fechaReal, MAX_DIAS_REPORTE, MAX_DIAS_SYNC, validarRango } from '@/lib/productividad/validacion';
import { z } from 'zod';
import { MotorDevengoService, type ResultadoDevengo } from '@/services/productividad/MotorDevengoService';

// Un sync de un rango amplio hace cientos de escrituras.
export const maxDuration = 60;

/** Generaciones simultáneas (cada una hace ~3-6 viajes a la BD). */
const CONCURRENCIA_SYNC = 6;

/** '' / null ⇒ ausente (el panel envía la fecha vacía cuando no hay filtro). */
const fechaOpcional = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  fechaReal.optional()
);

const syncSchema = z
  .object({
    fecha_desde: fechaOpcional,
    fecha_hasta: fechaOpcional,
    solo_pendientes: z.boolean().optional(),
  })
  .strict();

const previewQuery = z.object({
  preview: z.string().max(5).optional(),
  desde: fechaReal.optional(),
  hasta: fechaReal.optional(),
});

const ESTATUS_DEVENGABLES = ['AGENDADA', 'PROCESADA', 'COMPLETADA', 'PENDIENTE_ESTUDIO', 'PENDIENTE_CIRUGIA'];

type ConsultaSync = { id: string; deployed_to_performance: boolean | null };
type CirugiaSync = {
  id: string;
  doctor_id: string | null;
  estado: string;
  consulta_id: string | null;
  deployed_to_performance: boolean | null;
};

type Paso =
  | { tipo: 'existente' }
  | { tipo: 'generado'; resultado: ResultadoDevengo }
  | { tipo: 'cancelado' }
  | { tipo: 'error'; mensaje: string };

function agregarSet(mapa: Map<string, Set<string>>, clave: string, valor: string | null | undefined) {
  if (!valor) return;
  let set = mapa.get(clave);
  if (!set) {
    set = new Set();
    mapa.set(clave, set);
  }
  set.add(valor);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const body = await leerJSON(request, syncSchema);
  if (body instanceof NextResponse) return body;

  const startedAt = performance.now();
  const supabase = getSupabaseAdmin();
  const { fecha_desde, fecha_hasta, solo_pendientes } = body;
  // "Hoy" en la zona de la clínica (antes UTC: después de ~16-17 h en Tijuana
  // el sync sin fechas procesaba el día siguiente).
  const hoy = hoyTijuana();
  const desde = fecha_desde || hoy;
  const hasta = fecha_hasta || hoy;
  const rangoError = validarRango(desde, hasta, MAX_DIAS_SYNC);
  if (rangoError) return rangoError;

  const errores: string[] = [];
  let eventosCreados = 0;
  let eventosExistentes = 0;
  let consultasDesplegadas = 0;
  let cirugiasDesplegadas = 0;

  try {
    const service = new MotorDevengoService();

    // Snapshot "antes" ‖ listado de consultas ‖ listado de cirugías (independientes;
    // antes en serie). Los listados se paginan: >1000 filas ya no se truncan.
    const [pendientes, consultas, cirugias] = await Promise.all([
      service.listarPendientesDespliegue(desde, hasta),
      leerTodo<ConsultaSync>((a, b) => {
        let q = supabase
          .from('consultas')
          .select('id, deployed_to_performance')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .in('estatus', ESTATUS_DEVENGABLES);
        if (solo_pendientes) q = q.eq('deployed_to_performance', false);
        return q.order('fecha', { ascending: true }).order('id', { ascending: true }).range(a, b);
      }),
      leerTodo<CirugiaSync>((a, b) => {
        let q = supabase
          .from('agenda_cirugias')
          .select('id, doctor_id, estado, consulta_id, deployed_to_performance')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .neq('estado', 'cancelada');
        if (solo_pendientes) q = q.eq('deployed_to_performance', false);
        return q.order('fecha', { ascending: true }).order('id', { ascending: true }).range(a, b);
      }),
    ]);

    const idsConsultas = consultas.map((c) => c.id);
    const idsCirugias = cirugias.map((c) => c.id);

    // Precarga en lote de eventos y doctores esperados (4 lecturas en paralelo).
    // Como antes, un fallo aquí no aborta: solo hace que se llame al motor
    // (idempotente por dedupe_key) para esas filas.
    const tolerante = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [evConsultas, evCirugias, agdRows, partRows] = await Promise.all([
      tolerante(
        leerTodoEnLotes<{ id: string; origen_id: string }>(idsConsultas, (l, a, b) =>
          supabase
            .from('eventos_honorario')
            .select('id, origen_id')
            .eq('origen_tipo', 'CONSULTA')
            .in('origen_id', l)
            .neq('estado', 'CANCELADO')
            .order('id', { ascending: true })
            .range(a, b)
        )
      ),
      tolerante(
        leerTodoEnLotes<{ id: string; origen_id: string; doctor_id: string }>(idsCirugias, (l, a, b) =>
          supabase
            .from('eventos_honorario')
            .select('id, origen_id, doctor_id')
            .eq('origen_tipo', 'OPERACION')
            .in('origen_id', l)
            .neq('estado', 'CANCELADO')
            .order('id', { ascending: true })
            .range(a, b)
        )
      ),
      tolerante(
        leerTodoEnLotes<{ id: string; cirugia_id: string; doctor_id: string | null }>(idsCirugias, (l, a, b) =>
          supabase
            .from('agenda_cirugia_doctores')
            .select('id, cirugia_id, doctor_id')
            .in('cirugia_id', l)
            .order('id', { ascending: true })
            .range(a, b)
        )
      ),
      tolerante(
        leerTodoEnLotes<{ id: string; cirugia_id: string; medico_id: string | null }>(idsCirugias, (l, a, b) =>
          supabase
            .from('cirugia_participantes')
            .select('id, cirugia_id, medico_id')
            .in('cirugia_id', l)
            .order('id', { ascending: true })
            .range(a, b)
        )
      ),
    ]);

    const conEventoConsulta = new Set(evConsultas.map((r) => r.origen_id));
    const eventosPorCirugia = new Map<string, Set<string>>();
    const agdPorCirugia = new Map<string, Set<string>>();
    const partPorCirugia = new Map<string, Set<string>>();
    for (const r of evCirugias) agregarSet(eventosPorCirugia, r.origen_id, r.doctor_id);
    for (const r of agdRows) agregarSet(agdPorCirugia, r.cirugia_id, r.doctor_id);
    for (const r of partRows) agregarSet(partPorCirugia, r.cirugia_id, r.medico_id);

    // ── Consultas: generación con concurrencia limitada ─────────────────────
    const pasosConsultas = await mapConLimite(consultas, CONCURRENCIA_SYNC, async (consulta): Promise<Paso> => {
      if (conEventoConsulta.has(consulta.id) && consulta.deployed_to_performance) {
        return { tipo: 'existente' };
      }
      try {
        return { tipo: 'generado', resultado: await service.generarDesdeConsulta(consulta.id) };
      } catch (err) {
        return { tipo: 'error', mensaje: `Consulta ${consulta.id}: ${mensajeSeguro(err, 'productividad.sync', 'Error')}` };
      }
    });

    // Se agregan en el orden original del listado (mismo reporte que en serie).
    for (const paso of pasosConsultas) {
      if (paso.tipo === 'existente') eventosExistentes++;
      else if (paso.tipo === 'error') errores.push(paso.mensaje);
      else if (paso.tipo === 'generado') {
        const resultado = paso.resultado;
        eventosCreados += resultado.eventos_creados;
        eventosExistentes += resultado.eventos_existentes;
        if (resultado.deployed) consultasDesplegadas++;
        for (const docId of resultado.reportar_doctor_distinto) {
          if (!errores.includes(`doctor_distinto:${docId}`)) {
            errores.push(`doctor_distinto:${docId}`);
          }
        }
      }
    }

    // ── Cirugías (después de las consultas: pueden sumar métricas al evento
    // de su consulta raíz). Las que comparten consulta raíz se procesan en
    // serie dentro de su grupo para no pisar el read-modify-write de
    // `metricas_ligados`; los grupos corren en paralelo.
    const procesarCirugia = async (cirugia: CirugiaSync): Promise<Paso> => {
      try {
        if (cirugia.estado === 'cancelada') {
          await service.cancelarPorCirugia(cirugia.id);
          return { tipo: 'cancelado' };
        }

        const conEvento = eventosPorCirugia.get(cirugia.id) || new Set<string>();
        const esperados = new Set<string>();
        if (cirugia.doctor_id) esperados.add(cirugia.doctor_id);
        for (const d of agdPorCirugia.get(cirugia.id) || []) esperados.add(d);
        for (const m of partPorCirugia.get(cirugia.id) || []) esperados.add(m);

        const faltantes = [...esperados].filter((d) => !conEvento.has(d));

        if (faltantes.length === 0 && cirugia.deployed_to_performance) {
          return { tipo: 'existente' };
        }
        return { tipo: 'generado', resultado: await service.generarDesdeCirugia(cirugia.id) };
      } catch (err) {
        return { tipo: 'error', mensaje: `Cirugía ${cirugia.id}: ${mensajeSeguro(err, 'productividad.sync', 'Error')}` };
      }
    };

    const grupos = new Map<string, number[]>();
    cirugias.forEach((c, i) => {
      const clave = c.consulta_id ? `c:${c.consulta_id}` : `x:${c.id}`;
      const g = grupos.get(clave);
      if (g) g.push(i);
      else grupos.set(clave, [i]);
    });

    const pasosCirugias = new Array<Paso>(cirugias.length);
    await mapConLimite([...grupos.values()], CONCURRENCIA_SYNC, async (indices) => {
      for (const i of indices) pasosCirugias[i] = await procesarCirugia(cirugias[i]);
    });

    for (const paso of pasosCirugias) {
      if (paso.tipo === 'existente') eventosExistentes++;
      else if (paso.tipo === 'error') errores.push(paso.mensaje);
      else if (paso.tipo === 'generado') {
        eventosCreados += paso.resultado.eventos_creados;
        eventosExistentes += paso.resultado.eventos_existentes;
        if (paso.resultado.deployed) cirugiasDesplegadas++;
      }
    }

    const consultasVerificadas = consultas.length;
    const cirugiasVerificadas = cirugias.length;
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
    });

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
      error: mensajeSeguro(err, 'productividad.sync', 'Error en sync'),
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const q = leerQuery(request, previewQuery);
  if (q instanceof NextResponse) return q;
  const { desde, hasta } = q;

  if (q.preview === '1') {
    if (desde && hasta) {
      const rangoError = validarRango(desde, hasta, MAX_DIAS_REPORTE);
      if (rangoError) return rangoError;
    }
    try {
      const service = new MotorDevengoService();
      const preview = await service.listarPendientesDespliegue(desde, hasta);
      return NextResponse.json(preview);
    } catch (err) {
      return NextResponse.json({
        error: mensajeSeguro(err, 'productividad.sync', 'Error en preview'),
      }, { status: 500 });
    }
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('sync_log')
    .select(
      'id, fecha_inicio, fecha_fin, consultas_verificadas, cirugias_verificadas, eventos_creados, eventos_existentes, errores, duracion_ms, ejecutado_por, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'Error al obtener logs de sync' }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
