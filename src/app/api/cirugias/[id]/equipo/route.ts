import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorInterno, horaHHMM, leerJSON, uuid, validarId } from '@/lib/api/validar';
import { ruta } from '@/lib/api/ruta';
import { VALORES_ROL_PERSONAL } from '@/lib/catalogos/cirugia';
import { ROL_ANESTESIOLOGO, esAnestesiologo } from '@/lib/catalogos/personal';
import { detectarConflictosAgenda, detectarConflictosPersonal } from '@/lib/agenda-conflictos';
import { calcularProductividadCirugia } from '@/lib/productividad';
import { enSegundoPlano } from '@/lib/segundo-plano';

/**
 * C7 / C8: editor de equipo desde el detalle. Reemplaza médicos (con rol y horario)
 * y personal de apoyo. Conserva los participantes que no cambian (y su productividad),
 * crea la productividad de los nuevos y la recalcula.
 */
const horarioValido = (d: { hora_inicio?: string | null; hora_fin?: string | null }) =>
  !d.hora_inicio || !d.hora_fin || d.hora_fin.slice(0, 5) > d.hora_inicio.slice(0, 5);

const esquemaEquipo = z.object({
  participantes: z
    .array(
      z.object({
        medico_id: uuid,
        rol_id: uuid,
        hora_inicio: horaHHMM.optional().nullable(),
        hora_fin: horaHHMM.optional().nullable(),
      }).refine(horarioValido, { message: 'El horario de un médico debe terminar después de iniciar' })
    )
    .min(1, 'Debe quedar al menos un participante')
    .max(20, 'Demasiados participantes'),
  personal: z
    .array(
      z.object({
        rol: z.enum(VALORES_ROL_PERSONAL),
        personal_id: uuid,
        hora_inicio: horaHHMM,
        hora_fin: horaHHMM,
      }).refine(horarioValido, { message: 'El horario del personal debe terminar después de iniciar' })
    )
    .max(20, 'Demasiado personal de apoyo'),
});

const ESTADOS_CERRADOS = new Set(['CANCELADA', 'CANCELADO', 'COMPLETADA', 'COMPLETADO', 'REAGENDADA', 'REAGENDADO']);

async function manejarPUT(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const data = await leerJSON(request, esquemaEquipo);
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();
  const { data: cirugia, error: errC } = await supabase
    .from('agenda_cirugias')
    .select('id, fecha, hora, duracion_min, estado, origen_id, servicio_id')
    .eq('id', id)
    .maybeSingle();
  if (errC) return errorInterno(errC, 'cirugias.equipo.leer');
  if (!cirugia) return NextResponse.json({ error: 'Cirugía no encontrada' }, { status: 404 });
  if (ESTADOS_CERRADOS.has(String(cirugia.estado ?? ''))) {
    return NextResponse.json({ error: 'La cirugía ya está cerrada; no se puede cambiar el equipo' }, { status: 409 });
  }

  // Participantes: sin repetir médico+rol.
  const vistos = new Set<string>();
  const participantes = data.participantes.filter((p) => {
    const k = `${p.medico_id}|${p.rol_id}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  // Validación de roles y anestesiólogos (misma regla que la alta).
  const medicoIds = Array.from(new Set(participantes.map((p) => p.medico_id)));
  const rolIds = Array.from(new Set(participantes.map((p) => p.rol_id)));
  const [rolesRes, doctoresRes] = await Promise.all([
    supabase.from('cat_roles_participante').select('id, clave').in('id', rolIds),
    supabase.from('doctores').select('id, tipo_personal, alias').in('id', medicoIds),
  ]);
  if (rolesRes.error || (rolesRes.data || []).length !== rolIds.length) {
    return NextResponse.json({ error: 'Alguno de los roles no existe' }, { status: 400 });
  }
  if (doctoresRes.error || (doctoresRes.data || []).length !== medicoIds.length) {
    return NextResponse.json({ error: 'Alguno de los médicos no existe' }, { status: 400 });
  }
  const claveRol = new Map((rolesRes.data || []).map((r: { id: string; clave: string }) => [r.id, r.clave]));
  const doctorPor = new Map((doctoresRes.data || []).map((d: { id: string; tipo_personal: string | null; alias: string }) => [d.id, d]));
  for (const p of participantes) {
    const clave = claveRol.get(p.rol_id) || '';
    const persona = { tipo_personal: doctorPor.get(p.medico_id)?.tipo_personal ?? null };
    if (clave === ROL_ANESTESIOLOGO && !esAnestesiologo(persona)) {
      return NextResponse.json({ error: 'En el rol Anestesiólogo solo se puede asignar personal registrado como anestesiólogo' }, { status: 400 });
    }
    if (clave && clave !== ROL_ANESTESIOLOGO && esAnestesiologo(persona)) {
      return NextResponse.json({ error: 'Los anestesiólogos solo pueden asignarse en el rol Anestesiólogo' }, { status: 400 });
    }
  }

  // Personal de apoyo: existe y está activo.
  const personalIds = Array.from(new Set(data.personal.map((p) => p.personal_id)));
  const nombres = new Map<string, string>();
  if (personalIds.length) {
    const { data: personalCat, error: errPersonal } = await supabase
      .from('personal_clinico')
      .select('id, nombre, activo')
      .in('id', personalIds);
    if (errPersonal) return errorInterno(errPersonal, 'cirugias.equipo.personal');
    const activos = (personalCat || []).filter((p: { activo: boolean }) => p.activo);
    if (activos.length !== personalIds.length) {
      return NextResponse.json({ error: 'Alguna persona del personal de apoyo no existe o está inactiva' }, { status: 400 });
    }
    activos.forEach((p: { id: string; nombre: string }) => nombres.set(p.id, p.nombre));
  }

  // Conflictos de agenda (excluyendo esta misma cirugía).
  if (cirugia.fecha && cirugia.hora) {
    const conflictosMedicos = await detectarConflictosAgenda({
      fecha: cirugia.fecha as string,
      hora: cirugia.hora as string,
      duracion_min: Number(cirugia.duracion_min) || 60,
      medicos: medicoIds,
    });
    const otros = conflictosMedicos.filter((c) => c.entidad_id !== id);
    if (otros.length > 0) {
      return NextResponse.json({ error: otros[0].descripcion, conflictos: otros }, { status: 409 });
    }
  }
  if (cirugia.fecha && data.personal.length) {
    const conflictosPersonal = await detectarConflictosPersonal({
      fecha: cirugia.fecha as string,
      miembros: data.personal.map((p) => ({ personal_id: p.personal_id, hora_inicio: p.hora_inicio, hora_fin: p.hora_fin })),
      excluirCirugiaId: id,
    });
    if (conflictosPersonal.length > 0) {
      return NextResponse.json({ error: conflictosPersonal[0].descripcion, conflictos: conflictosPersonal }, { status: 409 });
    }
  }

  // Participantes actuales: se conservan los que siguen; se quitan (con su productividad) los que salen.
  const { data: actuales, error: errActuales } = await supabase
    .from('cirugia_participantes')
    .select('id, medico_id, rol_id')
    .eq('cirugia_id', id);
  if (errActuales) return errorInterno(errActuales, 'cirugias.equipo.participantes');
  const clavesNuevas = new Set(participantes.map((p) => `${p.medico_id}|${p.rol_id}`));
  const existentePorClave = new Map<string, string>();
  const aQuitar: string[] = [];
  for (const a of actuales || []) {
    const k = `${a.medico_id}|${a.rol_id}`;
    if (clavesNuevas.has(k)) existentePorClave.set(k, a.id as string);
    else aQuitar.push(a.id as string);
  }

  if (aQuitar.length) {
    const { error: errProd } = await supabase.from('cirugia_productividad').delete().in('participante_id', aQuitar);
    if (errProd) return errorInterno(errProd, 'cirugias.equipo.productividad-borrar');
    const { error: errPart } = await supabase.from('cirugia_participantes').delete().in('id', aQuitar);
    if (errPart) return errorInterno(errPart, 'cirugias.equipo.participantes-borrar');
  }

  // Nuevos participantes: alta en participantes y productividad pendiente (igual que la alta).
  const nuevos = participantes.filter((p) => !existentePorClave.has(`${p.medico_id}|${p.rol_id}`));
  for (const p of nuevos) {
    const { data: fila, error: errIns } = await supabase
      .from('cirugia_participantes')
      .insert({ cirugia_id: id, medico_id: p.medico_id, rol_id: p.rol_id })
      .select('id')
      .single();
    if (errIns || !fila) return errorInterno(errIns, 'cirugias.equipo.participantes-insertar');
    existentePorClave.set(`${p.medico_id}|${p.rol_id}`, fila.id as string);
    const { error: errProd } = await supabase.from('cirugia_productividad').insert({
      cirugia_id: id,
      participante_id: fila.id,
      origen_id: cirugia.origen_id,
      servicio_id: cirugia.servicio_id,
      rol_id: p.rol_id,
      estado: 'PENDIENTE',
      monto: null,
      regla_id: null,
    });
    if (errProd) return errorInterno(errProd, 'cirugias.equipo.productividad-insertar');
  }

  // Horario de cada médico (las columnas de mig. 370).
  await Promise.all(
    participantes.map((p) => {
      const filaId = existentePorClave.get(`${p.medico_id}|${p.rol_id}`);
      if (!filaId) return null;
      return supabase
        .from('cirugia_participantes')
        .update({ hora_inicio: p.hora_inicio ?? null, hora_fin: p.hora_fin ?? null })
        .eq('id', filaId);
    })
  );

  // Personal de apoyo: se reemplaza completo (no tiene productividad propia).
  const { error: errBorrarPersonal } = await supabase.from('cirugia_personal').delete().eq('cirugia_id', id);
  if (errBorrarPersonal) return errorInterno(errBorrarPersonal, 'cirugias.equipo.personal-borrar');
  if (data.personal.length) {
    const { error: errPersonalIns } = await supabase.from('cirugia_personal').insert(
      data.personal.map((p) => ({
        cirugia_id: id,
        rol: p.rol,
        personal_id: p.personal_id,
        nombre: nombres.get(p.personal_id) ?? '',
        hora_inicio: p.hora_inicio,
        hora_fin: p.hora_fin,
      }))
    );
    if (errPersonalIns) return errorInterno(errPersonalIns, 'cirugias.equipo.personal-insertar');
  }

  // Productividad recalculada en segundo plano (no bloquea la respuesta).
  enSegundoPlano(
    (async () => {
      try {
        await calcularProductividadCirugia(id);
      } catch {
        // Si falla, la productividad queda PENDIENTE sin monto.
      }
    })(),
    'cirugias.equipo.productividad'
  );

  return NextResponse.json({ ok: true, participantes: participantes.length, personal: data.personal.length });
}

export const PUT = ruta('cirugias/[id]/equipo#PUT', manejarPUT);
