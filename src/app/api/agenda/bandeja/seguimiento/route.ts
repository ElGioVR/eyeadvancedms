import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { puedeGestionarAgenda } from '@/lib/permisos-agenda';
import { errorInterno, leerQuery, uuid } from '@/lib/api/validar';
import { ruta } from '@/lib/api/ruta';
import { sanitizarBusqueda } from '@/lib/text';
import { etiquetaTipoConsulta } from '@/lib/catalogos/tipos-consulta';
import {
  FILTROS_SEGUIMIENTO,
  ahoraClinica,
  describirEventoHistorial,
  detalleEvento,
  pasaFiltro,
  resultadoCita,
  sumarDias,
  type ResultadoClave,
  type TipoEventoBandeja,
} from '@/lib/bandeja-agenda';

/*
 * Seguimiento de citas pasadas (pestaña «Por cerrar» de la bandeja).
 *   GET ?q=texto&filtro=…          → busca en TODO el historial por paciente/expediente.
 *   GET ?filtro=…&dias=N           → sin texto: las de los últimos N días (máx. 365).
 *   GET ?tipo=cirugia|consulta&id= → historial («qué pasó») de una cita.
 */

export const dynamic = 'force-dynamic';

const LIMITE_FUENTE = 300;
const LIMITE_RESPUESTA = 80;

const ESTADO_CONSULTA_A_AGENDA: Record<string, string> = {
  BORRADOR: 'agendada', AGENDADA: 'agendada', PROCESADA: 'completada', PENDIENTE_ESTUDIO: 'aplazada',
  PENDIENTE_CIRUGIA: 'reagendada', APLAZADA: 'aplazada', REAGENDADA: 'reagendada', COMPLETADA: 'completada',
  CANCELADA: 'cancelada', FINALIZADA: 'completada',
};

export interface ItemSeguimiento {
  id: string;
  tipo: TipoEventoBandeja;
  paciente_id: string | null;
  doctor_id: string | null;
  paciente: string;
  expediente: string | null;
  fecha: string | null;
  hora: string | null;
  hora_fin: string | null;
  duracion_min: number | null;
  /** Estado en el vocabulario de la agenda (para el modal de acciones). */
  estado: string;
  doctor: string | null;
  detalle: string | null;
  resultado: ResultadoClave;
  resultado_detalle: string | null;
  motivo: string | null;
}

export interface EventoSeguimiento {
  fecha: string;
  titulo: string;
  motivo: string | null;
  usuario: string | null;
}

const querySchema = z.object({
  q: z.string().max(100).optional(),
  filtro: z.enum(FILTROS_SEGUIMIENTO).catch('todas'),
  dias: z.coerce.number().int().min(1).max(365).catch(60),
  tipo: z.enum(['cirugia', 'consulta', 'estudio']).optional(),
  id: uuid.optional(),
});

async function historial(tipo: TipoEventoBandeja, id: string) {
  const supabase = getSupabaseAdmin();
  const crudos: Array<{ evento: string; datos: Record<string, unknown> | null; usuario_id: string | null; created_at: string }> = [];
  if (tipo === 'cirugia') {
    const { data, error } = await supabase
      .from('cirugia_historial')
      .select('accion, detalle, usuario_id, created_at')
      .eq('cirugia_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return errorInterno(error, 'agenda.seguimiento.historial');
    for (const h of (data || []) as Array<{ accion: string; detalle: Record<string, unknown> | null; usuario_id: string | null; created_at: string }>) {
      crudos.push({ evento: h.accion, datos: h.detalle, usuario_id: h.usuario_id, created_at: h.created_at });
    }
  } else {
    const { data, error } = await supabase
      .from('consulta_historial')
      .select('tipo_evento, payload, usuario_id, created_at')
      .eq('consulta_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return errorInterno(error, 'agenda.seguimiento.historial');
    for (const h of (data || []) as Array<{ tipo_evento: string; payload: Record<string, unknown> | null; usuario_id: string | null; created_at: string }>) {
      crudos.push({ evento: h.tipo_evento, datos: h.payload, usuario_id: h.usuario_id, created_at: h.created_at });
    }
  }
  const ids = [...new Set(crudos.map((c) => c.usuario_id).filter((u): u is string => !!u))];
  const nombres = new Map<string, string | null>();
  if (ids.length) {
    const { data } = await supabase.from('usuarios').select('id, nombre').in('id', ids);
    for (const u of (data || []) as Array<{ id: string; nombre: string | null }>) nombres.set(u.id, u.nombre);
  }
  const eventos: EventoSeguimiento[] = [];
  for (const c of crudos) {
    const d = describirEventoHistorial(tipo, c.evento, c.datos);
    if (!d) continue;
    eventos.push({ fecha: c.created_at, titulo: d.titulo, motivo: d.motivo, usuario: c.usuario_id ? nombres.get(c.usuario_id) ?? null : null });
  }
  return NextResponse.json({ eventos }, { headers: { 'Cache-Control': 'no-store' } });
}

async function manejarGET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  if (!auth.perfil?.activo || !puedeGestionarAgenda(auth.perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const p = leerQuery(request, querySchema);
  if (p instanceof NextResponse) return p;

  if (p.tipo && p.id) return historial(p.tipo, p.id);

  const q = p.q ? sanitizarBusqueda(p.q) : '';
  if (p.q && q.length < 2) return NextResponse.json({ items: [], total: 0 });

  const ahora = ahoraClinica();
  const desde = q ? null : sumarDias(ahora.fecha, -p.dias);
  const supabase = getSupabaseAdmin();

  let qCx = supabase
    .from('agenda_cirugias')
    .select(`id, paciente_id, doctor_id, nombre_paciente, expediente, fecha, hora, estado, procedimiento, ojo, duracion_min,
             motivo_aplazamiento, doctores:doctor_id (alias), servicio:servicio_id (nombre),
             paciente:paciente_id (numero_expediente)`);
  // Con texto: también aplazadas sin fecha. Sin texto: solo el rango.
  qCx = desde ? qCx.gte('fecha', desde).lte('fecha', ahora.fecha) : qCx.or(`fecha.lte.${ahora.fecha},fecha.is.null`);
  if (q) qCx = qCx.or(`nombre_paciente.ilike.%${q}%,expediente.ilike.%${q}%`);

  let qCo = supabase
    .from('consultas')
    .select(`id, paciente_id, doctor_id, fecha, hora_inicio, hora_fin, tipo_consulta, tipo_visita, estatus,
             estudio_1, estudio_2, estudio_3, procedimiento,
             doctores:doctor_id (alias), especialidad:especialidad_id (nombre),
             pacientes:paciente_id${q ? '!inner' : ''} (nombre_completo, numero_expediente)`)
    .lte('fecha', ahora.fecha);
  if (desde) qCo = qCo.gte('fecha', desde);
  if (q) qCo = qCo.or(`nombre_completo.ilike.%${q}%,numero_expediente.ilike.%${q}%`, { foreignTable: 'pacientes' });

  const [cx, co] = await Promise.all([
    qCx.order('fecha', { ascending: false, nullsFirst: false }).limit(LIMITE_FUENTE),
    qCo.order('fecha', { ascending: false }).order('hora_inicio', { ascending: false }).limit(LIMITE_FUENTE),
  ]);
  if (cx.error || co.error) return errorInterno(cx.error || co.error, 'agenda.seguimiento');

  const items: ItemSeguimiento[] = [];
  for (const c of (cx.data || []) as any[]) {
    const r = resultadoCita({ tipo: 'cirugia', estado: c.estado, fecha: c.fecha, hora: c.hora, duracion_min: c.duracion_min }, ahora);
    if (r.clave === 'proxima' || !pasaFiltro(r.clave, p.filtro)) continue;
    items.push({
      id: c.id,
      tipo: 'cirugia',
      paciente_id: c.paciente_id,
      doctor_id: c.doctor_id ?? null,
      paciente: c.nombre_paciente || '',
      expediente: c.expediente || c.paciente?.numero_expediente || null,
      fecha: c.fecha,
      hora: c.hora,
      hora_fin: null,
      duracion_min: c.duracion_min ?? null,
      estado: c.estado,
      doctor: c.doctores?.alias || null,
      detalle: detalleEvento({ tipo: 'cirugia', procedimiento: c.procedimiento || c.servicio?.nombre, ojo: c.ojo }),
      resultado: r.clave,
      resultado_detalle: r.detalle,
      motivo: c.motivo_aplazamiento || null,
    });
  }
  for (const c of (co.data || []) as any[]) {
    const tipo: TipoEventoBandeja = (c.tipo_consulta || '').toUpperCase().includes('ESTUDIO') ? 'estudio' : 'consulta';
    const r = resultadoCita({ tipo, estado: c.estatus, fecha: c.fecha, hora: c.hora_inicio, hora_fin: c.hora_fin }, ahora);
    if (r.clave === 'proxima' || !pasaFiltro(r.clave, p.filtro)) continue;
    items.push({
      id: c.id,
      tipo,
      paciente_id: c.paciente_id,
      doctor_id: c.doctor_id ?? null,
      paciente: c.pacientes?.nombre_completo || '',
      expediente: c.pacientes?.numero_expediente || null,
      fecha: c.fecha,
      hora: c.hora_inicio,
      hora_fin: c.hora_fin,
      duracion_min: null,
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
      resultado: r.clave,
      resultado_detalle: r.detalle,
      motivo: null,
    });
  }

  // Más reciente primero; aplazadas sin fecha al final.
  items.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.hora || '').localeCompare(a.hora || ''));
  const conteo: Partial<Record<ResultadoClave, number>> = {};
  for (const i of items) conteo[i.resultado] = (conteo[i.resultado] || 0) + 1;

  return NextResponse.json(
    { items: items.slice(0, LIMITE_RESPUESTA), total: items.length, conteo, dias: q ? null : p.dias },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = ruta('agenda/bandeja/seguimiento#GET', manejarGET);
