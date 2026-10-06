import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { puedeGestionarAgenda } from '@/lib/permisos-agenda';
import { errorInterno, leerJSON, uuid } from '@/lib/api/validar';
import { ruta } from '@/lib/api/ruta';
import { leerTelefonos } from '@/lib/telefonos-paciente-db';
import { etiquetaTipoConsulta } from '@/lib/catalogos/tipos-consulta';
import {
  DIAS_ATRAS_BANDEJA,
  ESTATUS_ACTIVOS_CONSULTA,
  ahoraClinica,
  clasificarBandeja,
  detalleEvento,
  etiquetaTiempo,
  sumarDias,
  type ConfirmacionCita,
  type SeccionBandeja,
  type TipoEventoBandeja,
} from '@/lib/bandeja-agenda';
import type { TelefonoPaciente } from '@/lib/telefonos-paciente';

/*
 * Bandeja de la agenda (recepción, admin y doctor):
 *   GET   → citas por confirmar (hoy/mañana) y por cerrar (ya terminaron).
 *   PATCH → marca la confirmación: 'enviada' (se mandó WhatsApp), 'confirmada' o null.
 * Los cambios de estado (completar, reagendar, aplazar, cancelar) usan los
 * endpoints existentes para conservar historial, notificaciones, LIO y devengo.
 */

export const dynamic = 'force-dynamic';

const LIMITE = 500;

const ESTADO_CONSULTA_A_AGENDA: Record<string, string> = {
  BORRADOR: 'agendada',
  AGENDADA: 'agendada',
  APLAZADA: 'aplazada',
  REAGENDADA: 'reagendada',
};

export interface ItemBandeja {
  id: string;
  tipo: TipoEventoBandeja;
  seccion: SeccionBandeja;
  paciente_id: string | null;
  doctor_id: string | null;
  paciente: string;
  telefono: string | null;
  telefonos: TelefonoPaciente[];
  fecha: string;
  hora: string | null;
  hora_fin: string | null;
  duracion_min: number | null;
  /** Estado en el vocabulario de la agenda (agendada, reagendada, aplazada). */
  estado: string;
  doctor: string | null;
  detalle: string | null;
  folio: string | null;
  confirmacion: ConfirmacionCita | null;
  confirmacion_at: string | null;
  tiempo: string;
}

/** Postgres 42703 = columna inexistente (falta aplicar el SQL de confirmación). */
const faltaColumna = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42703' || /confirmacion/.test(e.message || ''));

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  if (!auth.perfil?.activo || !puedeGestionarAgenda(auth.perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const ahora = ahoraClinica();
  const desde = sumarDias(ahora.fecha, -DIAS_ATRAS_BANDEJA);
  const hasta = sumarDias(ahora.fecha, 1);
  const supabase = getSupabaseAdmin();

  const consultar = (conConfirmacion: boolean) => {
    const conf = conConfirmacion ? ', confirmacion, confirmacion_at' : '';
    return Promise.all([
      supabase
        .from('agenda_cirugias')
        .select(`id, paciente_id, doctor_id, nombre_paciente, fecha, hora, estado, procedimiento, ojo, duracion_min,
                 doctores:doctor_id (alias), servicio:servicio_id (nombre)${conf}`)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        // Filtro en negativo: en producción el enum puede no tener 'reagendada'
        // (migración 170 sin aplicar) y nombrarlo en un IN rompe la consulta.
        .not('estado', 'in', '(aplazada,completada,cancelada)')
        .order('fecha')
        .order('hora')
        .limit(LIMITE),
      supabase
        .from('consultas')
        .select(`id, folio, paciente_id, doctor_id, fecha, hora_inicio, hora_fin, tipo_consulta, tipo_visita, estatus,
                 estudio_1, estudio_2, estudio_3, procedimiento,
                 doctores:doctor_id (alias), especialidad:especialidad_id (nombre),
                 pacientes:paciente_id (nombre_completo)${conf}`)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .in('estatus', [...ESTATUS_ACTIVOS_CONSULTA])
        .order('fecha')
        .order('hora_inicio')
        .limit(LIMITE),
    ]);
  };

  let migracionPendiente = false;
  let [cx, co] = await consultar(true);
  if (faltaColumna(cx.error) || faltaColumna(co.error)) {
    migracionPendiente = true;
    [cx, co] = await consultar(false);
  }
  if (cx.error || co.error) return errorInterno(cx.error || co.error, 'agenda.bandeja');

  const cirugias = (cx.data || []) as any[];
  const consultas = (co.data || []) as any[];

  const items: Array<Omit<ItemBandeja, 'telefono' | 'telefonos'>> = [];
  for (const c of cirugias) {
    const base = {
      tipo: 'cirugia' as const,
      fecha: c.fecha as string,
      hora: c.hora as string | null,
      hora_fin: null,
      duracion_min: c.duracion_min ?? null,
      confirmacion: (c.confirmacion ?? null) as ConfirmacionCita | null,
    };
    const seccion = clasificarBandeja(base, ahora);
    if (!seccion) continue;
    items.push({
      ...base,
      id: c.id,
      seccion,
      paciente_id: c.paciente_id,
      doctor_id: c.doctor_id ?? null,
      paciente: c.nombre_paciente || '',
      estado: c.estado,
      doctor: c.doctores?.alias || null,
      detalle: detalleEvento({ tipo: 'cirugia', procedimiento: c.procedimiento || c.servicio?.nombre, ojo: c.ojo }),
      folio: null,
      confirmacion_at: c.confirmacion_at ?? null,
      tiempo: etiquetaTiempo(base, ahora),
    });
  }
  for (const c of consultas) {
    const tipo: TipoEventoBandeja = (c.tipo_consulta || '').toUpperCase().includes('ESTUDIO') ? 'estudio' : 'consulta';
    const base = {
      tipo,
      fecha: c.fecha as string,
      hora: c.hora_inicio as string | null,
      hora_fin: c.hora_fin as string | null,
      duracion_min: null,
      confirmacion: (c.confirmacion ?? null) as ConfirmacionCita | null,
    };
    const seccion = clasificarBandeja(base, ahora);
    if (!seccion) continue;
    items.push({
      ...base,
      id: c.id,
      seccion,
      paciente_id: c.paciente_id,
      doctor_id: c.doctor_id ?? null,
      paciente: c.pacientes?.nombre_completo || '',
      estado: ESTADO_CONSULTA_A_AGENDA[c.estatus] || 'agendada',
      doctor: c.doctores?.alias || null,
      detalle: detalleEvento({
        tipo,
        tipo_consulta: c.tipo_consulta,
        tipo_consulta_label: etiquetaTipoConsulta(c.tipo_consulta, c.tipo_visita),
        especialidad: c.especialidad?.nombre,
        procedimiento: c.procedimiento,
        estudios: [c.estudio_1, c.estudio_2, c.estudio_3],
      }),
      folio: c.folio ?? null,
      confirmacion_at: c.confirmacion_at ?? null,
      tiempo: etiquetaTiempo(base, ahora),
    });
  }

  // Teléfonos solo de los pacientes por confirmar (payload mínimo).
  const idsConfirmar = items.filter((i) => i.seccion === 'por_confirmar' && i.paciente_id).map((i) => i.paciente_id as string);
  const telefonos = await leerTelefonos(idsConfirmar);

  const orden = (a: { fecha: string; hora: string | null }, b: { fecha: string; hora: string | null }) =>
    a.fecha.localeCompare(b.fecha) || (a.hora || '99').localeCompare(b.hora || '99');
  const completos: ItemBandeja[] = items.map((i) => {
    const lista = (i.paciente_id && telefonos.get(i.paciente_id)) || [];
    return { ...i, telefonos: lista, telefono: lista.find((t) => t.principal)?.numero ?? lista[0]?.numero ?? null };
  });
  const porConfirmar = completos.filter((i) => i.seccion === 'por_confirmar').sort(orden);
  // Por cerrar: lo más reciente primero (lo de hoy es lo más urgente).
  const porCerrar = completos.filter((i) => i.seccion === 'por_cerrar').sort((a, b) => orden(b, a));

  return NextResponse.json(
    { porConfirmar, porCerrar, total: porConfirmar.length + porCerrar.length, migracionPendiente, diasAtras: DIAS_ATRAS_BANDEJA },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const patchSchema = z.object({
  tipo: z.enum(['cirugia', 'consulta', 'estudio']),
  id: uuid,
  confirmacion: z.enum(['enviada', 'confirmada']).nullable(),
}).strict();

async function manejarPATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  if (!auth.perfil?.activo || !puedeGestionarAgenda(auth.perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const data = await leerJSON(request, patchSchema, { maxBytes: 2_000 });
  if (data instanceof NextResponse) return data;

  const tabla = data.tipo === 'cirugia' ? 'agenda_cirugias' : 'consultas';
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from(tabla)
    .update({
      confirmacion: data.confirmacion,
      confirmacion_at: data.confirmacion ? new Date().toISOString() : null,
      confirmacion_por: data.confirmacion ? auth.user.id : null,
    })
    .eq('id', data.id);
  // «Mensaje enviado» no rebaja una cita ya confirmada.
  if (data.confirmacion === 'enviada') q = q.or('confirmacion.is.null,confirmacion.eq.enviada');
  const { error } = await q;
  if (faltaColumna(error)) {
    return NextResponse.json(
      { error: 'Falta aplicar sql/patch-confirmacion-citas-supabase.sql para guardar la confirmación' },
      { status: 409 },
    );
  }
  if (error) return errorInterno(error, 'agenda.bandeja.confirmar');
  return NextResponse.json({ ok: true });
}

export const GET = ruta('agenda/bandeja#GET', manejarGET);
export const PATCH = ruta('agenda/bandeja#PATCH', manejarPATCH);
