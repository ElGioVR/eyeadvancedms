import { NextResponse } from 'next/server';
import { notificarCancelacion, notificarReagendado } from '@/services/notificaciones';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { detectarConflictosAgenda, esEmpalmeAgenda, MENSAJE_EMPALME } from '@/lib/agenda-conflictos';
import { fechaISO, horaHHMM, leerJSON, validarId } from '@/lib/api/validar';
import { doctorRequerido, verificarDueno } from '@/lib/consultas-acceso';
import { MotorDevengoService } from '@/services/productividad';
import { ruta } from '@/lib/api/ruta';
import { enSegundoPlano } from '@/lib/segundo-plano';

const accionesSchema = z.object({
  accion: z.enum(['aplazar', 'reagendar', 'cancelar']),
  motivo: z.string().trim().min(1, 'El motivo es requerido').max(500),
  fecha: fechaISO.optional(),
  hora_inicio: horaHHMM.optional(),
  hora_fin: horaHHMM.optional().nullable(),
}).strict();

function toMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(':');
  return parseInt(h || '0', 10) * 60 + parseInt(m || '0', 10);
}

async function manejarPOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const idError = validarId(id, 'ID de consulta');
  if (idError) return idError;

  const data = await leerJSON(request, accionesSchema, { maxBytes: 10_000 });
  if (data instanceof NextResponse) return data;
  const supabase = getSupabaseAdmin();

  const [existingResult, requerido] = await Promise.all([
    supabase
      .from('consultas')
      .select('id, estatus, fecha, hora_inicio, hora_fin, doctor_id, pacientes:paciente_id (nombre_completo)')
      .eq('id', id)
      .maybeSingle(),
    doctorRequerido(auth.user.id, auth.perfil),
  ]);
  const { data: existing, error: checkError } = existingResult;

  if (checkError || !existing) {
    return NextResponse.json({ error: 'La consulta no existe' }, { status: 404 });
  }

  // RBAC: solo el rol de agenda propia (enfermería) queda limitado a lo suyo
  const denegado = verificarDueno(requerido, existing.doctor_id);
  if (denegado) return denegado;

  const pacienteJoin = (existing as { pacientes?: { nombre_completo?: string } | { nombre_completo?: string }[] | null }).pacientes;
  const pacienteNombre =
    (Array.isArray(pacienteJoin) ? pacienteJoin[0]?.nombre_completo : pacienteJoin?.nombre_completo) || 'Paciente';
  const notifBase = {
    doctorId: existing.doctor_id as string | null,
    paciente: pacienteNombre,
    entidadTipo: 'consulta' as const,
    entidadId: id,
    actorUserId: auth.user.id,
  };

  if (existing.estatus === 'COMPLETADA' || existing.estatus === 'CANCELADA') {
    return NextResponse.json({ error: 'La consulta ya está completada o cancelada' }, { status: 400 });
  }

  if (data.accion === 'aplazar') {
    if (!data.hora_inicio) {
      return NextResponse.json({ error: 'Selecciona la nueva hora de inicio' }, { status: 400 });
    }

    const nuevaHora = data.hora_inicio;
    const duracionPrevia = existing.hora_fin
      ? Math.max(toMin(existing.hora_fin) - toMin(existing.hora_inicio), 15)
      : 60;
    let nuevaHoraFin: string;
    if (data.hora_fin) {
      if (toMin(data.hora_fin) <= toMin(nuevaHora)) {
        return NextResponse.json({ error: 'La hora fin debe ser posterior a la hora de inicio' }, { status: 400 });
      }
      nuevaHoraFin = data.hora_fin.length === 5 ? `${data.hora_fin}:00` : data.hora_fin;
    } else {
      const [h, m] = nuevaHora.split(':');
      const finTotal = parseInt(h || '0', 10) * 60 + parseInt(m || '0', 10) + duracionPrevia;
      nuevaHoraFin = `${String(Math.floor(finTotal / 60) % 24).padStart(2, '0')}:${String(finTotal % 60).padStart(2, '0')}:00`;
    }

    const duracionMin = Math.max(toMin(nuevaHoraFin) - toMin(nuevaHora), 15);

    if (existing.doctor_id) {
      const conflictos = await detectarConflictosAgenda({
        fecha: existing.fecha,
        hora: nuevaHora,
        duracion_min: duracionMin,
        medicos: [existing.doctor_id],
      });
      const relevantes = conflictos.filter((c) => c.entidad_id !== id);
      if (relevantes.length > 0) {
        return NextResponse.json(
          { error: 'Conflicto de agenda', conflictos: relevantes },
          { status: 409 }
        );
      }
    }

    const { error: updError } = await supabase
      .from('consultas')
      .update({ hora_inicio: nuevaHora, hora_fin: nuevaHoraFin, estatus: 'APLAZADA' })
      .eq('id', id);
    if (esEmpalmeAgenda(updError)) {
      return NextResponse.json({ error: MENSAJE_EMPALME, conflictos: [] }, { status: 409 });
    }
    if (updError) {
      return NextResponse.json({ error: 'Error al aplazar la consulta' }, { status: 500 });
    }

    const { error } = await supabase.from('consulta_historial').insert({
      consulta_id: id,
      tipo_evento: 'REAGENDADO',
      usuario_id: auth.user.id,
      payload: {
        accion: 'aplazamiento',
        motivo: data.motivo,
        fecha_anterior: existing.fecha,
        hora_anterior: existing.hora_inicio,
        fecha_nueva: existing.fecha,
        hora_nueva: nuevaHora,
        hora_fin_nueva: nuevaHoraFin,
      },
    });
    if (error) {
      return NextResponse.json({ error: 'Error al registrar el aplazamiento' }, { status: 500 });
    }
    enSegundoPlano(notificarReagendado({ ...notifBase, fecha: existing.fecha, hora: nuevaHora, aplazada: true }), 'consultas.aplazar.notificar');
    return NextResponse.json({
      ok: true,
      accion: 'aplazar',
      fecha: existing.fecha,
      hora_inicio: nuevaHora,
      hora_fin: nuevaHoraFin,
    });
  }

  if (data.accion === 'cancelar') {
    const { error: updError } = await supabase
      .from('consultas')
      .update({ estatus: 'CANCELADA' })
      .eq('id', id);
    if (updError) {
      return NextResponse.json({ error: 'Error al cancelar la consulta' }, { status: 500 });
    }
    const { error } = await supabase.from('consulta_historial').insert({
      consulta_id: id,
      tipo_evento: 'CANCELACION',
      usuario_id: auth.user.id,
      payload: {
        motivo: data.motivo,
        estatus_anterior: existing.estatus,
      },
    });
    if (error) {
      return NextResponse.json({ error: 'Error al registrar la cancelación' }, { status: 500 });
    }

    await Promise.all([
      // el cancelamiento de honorarios es best-effort y no bloquea la cancelación de consulta
      new MotorDevengoService().cancelarPorConsulta(id).catch(() => undefined),
      notificarCancelacion({ ...notifBase, fecha: existing.fecha, hora: existing.hora_inicio, motivo: data.motivo }).catch(() => 0),
    ]);
    return NextResponse.json({ ok: true, accion: 'cancelar' });
  }

  // reagendar
  const nuevaFecha = data.fecha || existing.fecha;
  const nuevaHora = data.hora_inicio || existing.hora_inicio;
  const nuevaHoraFin = data.hora_fin !== undefined ? data.hora_fin : existing.hora_fin;

  if (nuevaHoraFin && toMin(nuevaHoraFin) <= toMin(nuevaHora)) {
    return NextResponse.json({ error: 'La hora fin debe ser posterior a la hora de inicio' }, { status: 400 });
  }

  const duracionMin = nuevaHoraFin
    ? Math.max(toMin(nuevaHoraFin) - toMin(nuevaHora), 15)
    : 60;

  if (existing.doctor_id) {
    const conflictos = await detectarConflictosAgenda({
      fecha: nuevaFecha,
      hora: nuevaHora,
      duracion_min: duracionMin,
      medicos: [existing.doctor_id],
    });
    const relevantes = conflictos.filter((c) => c.entidad_id !== id);
    if (relevantes.length > 0) {
      return NextResponse.json(
        { error: 'Conflicto de agenda', conflictos: relevantes },
        { status: 409 }
      );
    }
  }

  const { error: updError } = await supabase
    .from('consultas')
    .update({
      fecha: nuevaFecha,
      hora_inicio: nuevaHora,
      hora_fin: nuevaHoraFin ?? null,
      estatus: 'REAGENDADA',
    })
    .eq('id', id);
  if (esEmpalmeAgenda(updError)) {
    return NextResponse.json({ error: MENSAJE_EMPALME, conflictos: [] }, { status: 409 });
  }
  if (updError) {
    return NextResponse.json({ error: 'Error al reagendar la consulta' }, { status: 500 });
  }

  const { error } = await supabase.from('consulta_historial').insert({
    consulta_id: id,
    tipo_evento: 'REAGENDADO',
    usuario_id: auth.user.id,
    payload: {
      motivo: data.motivo,
      fecha_anterior: existing.fecha,
      hora_anterior: existing.hora_inicio,
      fecha_nueva: nuevaFecha,
      hora_nueva: nuevaHora,
      hora_fin_nueva: nuevaHoraFin ?? null,
    },
  });
  if (error) {
    return NextResponse.json({ error: 'Error al registrar el reagendado' }, { status: 500 });
  }

  enSegundoPlano(notificarReagendado({ ...notifBase, fecha: nuevaFecha, hora: nuevaHora }), 'consultas.reagendar.notificar');

  return NextResponse.json({
    ok: true,
    accion: 'reagendar',
    fecha: nuevaFecha,
    hora_inicio: nuevaHora,
    hora_fin: nuevaHoraFin ?? null,
  });
}

export const POST = ruta('consultas/[id]/acciones#POST', manejarPOST);
