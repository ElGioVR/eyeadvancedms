/**
 * Incidencias de cancelación.
 *
 * Las citas canceladas ya no se muestran en la agenda; este reporte las cuenta
 * para productividad: cuántas, de qué tipo, motivo y quién las canceló.
 *
 * Estado actual:
 *  - Consultas y estudios: motivo y usuario salen de consulta_historial (CANCELACION).
 *  - Cirugías: motivo y usuario salen de cirugia_historial (ESTADO_CAMBIADO → cancelada,
 *    que PATCH /api/agenda/[id] registra con el motivo obligatorio). Cancelaciones previas
 *    sin ese registro quedan como `pendiente` («Sin registrar»).
 *
 * Pendiente: ver claude/incidencias-cancelacion-pendiente.md en el proyecto.
 */
import { NextResponse } from 'next/server';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerQuery } from '@/lib/api/validar';
import { fechaReal, uuidOpcional, validarRango } from '@/lib/productividad/validacion';
import { z } from 'zod';
import { rangoPersonalizado } from '@/lib/rangos';
import { ruta } from '@/lib/api/ruta';

const querySchema = z.object({
  desde: fechaReal.optional(),
  hasta: fechaReal.optional(),
  doctor_id: uuidOpcional,
});

type Fila = {
  id: string;
  tipo: 'cirugia' | 'consulta' | 'estudio';
  fecha: string | null;
  hora: string | null;
  paciente: string | null;
  doctor_id: string | null;
  doctor: string | null;
  motivo: string | null;
  cancelado_por_id: string | null;
  cancelado_por: string | null;
  pendiente: string[];
};

function contar(filas: Fila[], clave: (f: Fila) => string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of filas) {
    const k = clave(f) || 'Sin registrar';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

async function manejarGET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const q = leerQuery(request, querySchema);
  if (q instanceof NextResponse) return q;
  const { desde, hasta } = rangoPersonalizado(q.desde, q.hasta);
  const rangoError = validarRango(desde, hasta);
  if (rangoError) return rangoError;

  try {
    const supabase = getSupabaseAdmin();

    let qConsultas = supabase
      .from('consultas')
      .select('id, fecha, hora_inicio, doctor_id, tipo_consulta, doctores:doctor_id (alias), pacientes:paciente_id (nombre_completo)')
      .eq('estatus', 'CANCELADA')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .limit(5000);
    if (q.doctor_id) qConsultas = qConsultas.eq('doctor_id', q.doctor_id);

    let qCirugias = supabase
      .from('agenda_cirugias')
      .select('id, fecha, hora, doctor_id, nombre_paciente, doctores:doctor_id (alias)')
      .eq('estado', 'cancelada')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .limit(5000);
    if (q.doctor_id) qCirugias = qCirugias.eq('doctor_id', q.doctor_id);

    const [consultasRes, cirugiasRes] = await Promise.all([qConsultas, qCirugias]);
    if (consultasRes.error) throw consultasRes.error;
    if (cirugiasRes.error) throw cirugiasRes.error;

    const consultas = consultasRes.data || [];
    const ids = consultas.map((c) => c.id as string);
    const idsCx = (cirugiasRes.data || []).map((c) => c.id as string);
    const [historial, historialCx] = await Promise.all([
      ids.length
        ? supabase
            .from('consulta_historial')
            .select('consulta_id, usuario_id, payload, created_at')
            .eq('tipo_evento', 'CANCELACION')
            .in('consulta_id', ids)
            .order('created_at', { ascending: false })
            .then((r) => r.data || [])
        : Promise.resolve([]),
      idsCx.length
        ? supabase
            .from('cirugia_historial')
            .select('cirugia_id, usuario_id, detalle, created_at')
            .eq('accion', 'ESTADO_CAMBIADO')
            .in('cirugia_id', idsCx)
            .order('created_at', { ascending: false })
            .then((r) => r.data || [])
        : Promise.resolve([]),
    ]);
    // Cirugías: el cambio a cancelada más reciente.
    const cancelacionCx = new Map<string, { usuario_id: string | null; motivo: string | null }>();
    for (const h of historialCx as Array<{ cirugia_id: string; usuario_id: string | null; detalle: { a?: string; motivo?: string } | null }>) {
      if (String(h.detalle?.a ?? '').toLowerCase() !== 'cancelada' || cancelacionCx.has(h.cirugia_id)) continue;
      cancelacionCx.set(h.cirugia_id, { usuario_id: h.usuario_id || null, motivo: h.detalle?.motivo || null });
    }
    // Un registro por consulta: el cancelamiento más reciente.
    const cancelacion = new Map<string, { usuario_id: string | null; motivo: string | null }>();
    for (const h of historial) {
      const cid = h.consulta_id as string;
      if (!cancelacion.has(cid)) {
        const payload = (h.payload || {}) as { motivo?: string };
        cancelacion.set(cid, { usuario_id: (h.usuario_id as string) || null, motivo: payload.motivo || null });
      }
    }
    const usuarioIds = [...new Set([...cancelacion.values(), ...cancelacionCx.values()].map((v) => v.usuario_id).filter(Boolean) as string[])];
    const usuarios = usuarioIds.length
      ? (await supabase.from('usuarios').select('id, nombre').in('id', usuarioIds)).data || []
      : [];
    const nombreUsuario = new Map(usuarios.map((u) => [u.id as string, (u.nombre as string) || null]));

    const filasConsulta: Fila[] = consultas.map((c) => {
      const info = cancelacion.get(c.id as string);
      const esEstudio = (c.tipo_consulta || '').toUpperCase().includes('ESTUDIO');
      const pendiente: string[] = [];
      if (!info?.motivo) pendiente.push('motivo');
      if (!info?.usuario_id) pendiente.push('quien');
      return {
        id: c.id as string,
        tipo: esEstudio ? 'estudio' : 'consulta',
        fecha: (c.fecha as string) || null,
        hora: (c.hora_inicio as string) || null,
        paciente: (c as any).pacientes?.nombre_completo || null,
        doctor_id: (c.doctor_id as string) || null,
        doctor: (c as any).doctores?.alias || null,
        motivo: info?.motivo || null,
        cancelado_por_id: info?.usuario_id || null,
        cancelado_por: info?.usuario_id ? nombreUsuario.get(info.usuario_id) || null : null,
        pendiente,
      };
    });

    const filasCirugia: Fila[] = (cirugiasRes.data || []).map((c) => {
      const info = cancelacionCx.get(c.id as string);
      const pendiente: string[] = [];
      if (!info?.motivo) pendiente.push('motivo');
      if (!info?.usuario_id) pendiente.push('quien');
      return {
        id: c.id as string,
        tipo: 'cirugia',
        fecha: (c.fecha as string) || null,
        hora: (c.hora as string) || null,
        paciente: (c.nombre_paciente as string) || null,
        doctor_id: (c.doctor_id as string) || null,
        doctor: (c as any).doctores?.alias || null,
        motivo: info?.motivo || null,
        cancelado_por_id: info?.usuario_id || null,
        cancelado_por: info?.usuario_id ? nombreUsuario.get(info.usuario_id) || null : null,
        pendiente,
      };
    });

    const filas = [...filasConsulta, ...filasCirugia].sort((a, b) =>
      (b.fecha || '').localeCompare(a.fecha || '') || (a.hora || '').localeCompare(b.hora || '')
    );

    return NextResponse.json({
      desde,
      hasta,
      total: filas.length,
      resumen: {
        por_tipo: contar(filas, (f) => f.tipo),
        por_motivo: contar(filas, (f) => f.motivo),
        por_quien: contar(filas, (f) => f.cancelado_por),
        por_doctor: contar(filas, (f) => f.doctor),
      },
      filas,
    });
  } catch (err) {
    const message = mensajeSeguro(err, 'productividad.incidencias', 'Error interno del servidor');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = ruta('productividad/incidencias#GET', manejarGET);
