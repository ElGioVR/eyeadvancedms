import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { doctorRequerido, verificarDueno } from '@/lib/consultas-acceso';
import { leerJSON, validarId } from '@/lib/api/validar';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { MotorDevengoService } from '@/services/productividad';
import { ruta } from '@/lib/api/ruta';

/**
 * PUT /api/consultas/[id]/servicios
 * Reemplaza los estudios y procedimientos de una consulta ya creada (alta
 * rápida desde la agenda o al concluir la consulta):
 *  - columnas de la consulta (estudio_1..3, procedimiento, *_doctor_id),
 *  - conceptos clínicos con precio del catálogo de la aseguranza,
 *  - costo total y estatus de pago,
 *  - honorarios: se cancelan los de servicios quitados y se generan los nuevos.
 * Los servicios que no cambian conservan su concepto (y sus honorarios).
 */
const servicioSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  nombre: z.string().trim().min(1).max(255),
  doctor_id: z.string().uuid().optional().nullable(),
  indicado_por_id: z.string().uuid().optional().nullable(),
}).strict();

const bodySchema = z.object({
  estudios: z.array(servicioSchema).max(3),
  procedimientos: z.array(servicioSchema).max(20),
}).strict();

type Tipo = 'ESTUDIO' | 'PROCEDIMIENTO';
interface ConceptoFila {
  id: string;
  tipo_concepto: string;
  concepto_id: string | null;
  texto_original: string | null;
  doctor_id: string | null;
  indicado_por_id?: string | null;
  precio_aplicado: number | null;
  cantidad: number | null;
}

const norm = (t: string | null | undefined) => (t || '').trim().toLowerCase();

async function manejarPUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const idError = validarId(id, 'ID de consulta');
  if (idError) return idError;

  const data = await leerJSON(request, bodySchema, { maxBytes: 30_000 });
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();
  const [consultaRes, requerido] = await Promise.all([
    supabase
      .from('consultas')
      .select('id, doctor_id, estatus, aseguranza_id, costo_total, monto_pagado, estatus_pago, pacientes:paciente_id (aseguranza_id)')
      .eq('id', id)
      .maybeSingle(),
    doctorRequerido(auth.user.id, auth.perfil),
  ]);
  const consulta = consultaRes.data as
    | { id: string; doctor_id: string; estatus: string; aseguranza_id: string | null; costo_total: number | null; monto_pagado: number | null; estatus_pago: string | null; pacientes: { aseguranza_id?: string | null } | { aseguranza_id?: string | null }[] | null }
    | null;
  if (consultaRes.error || !consulta) {
    return NextResponse.json({ error: 'La consulta no existe' }, { status: 404 });
  }
  const denegado = verificarDueno(requerido, consulta.doctor_id);
  if (denegado) return denegado;
  if (consulta.estatus === 'CANCELADA') {
    return NextResponse.json({ error: 'La consulta está cancelada' }, { status: 409 });
  }

  const pac = Array.isArray(consulta.pacientes) ? consulta.pacientes[0] : consulta.pacientes;
  const aseguranzaId = consulta.aseguranza_id || pac?.aseguranza_id || null;

  // Conceptos actuales (con la columna indicado_por_id si ya existe).
  let conceptosRes = await supabase
    .from('consulta_conceptos')
    .select('id, tipo_concepto, concepto_id, texto_original, doctor_id, indicado_por_id, precio_aplicado, cantidad')
    .eq('consulta_id', id);
  let conIndicado = true;
  if (conceptosRes.error && /indicado_por_id/.test(conceptosRes.error.message)) {
    conIndicado = false;
    conceptosRes = await supabase
      .from('consulta_conceptos')
      .select('id, tipo_concepto, concepto_id, texto_original, doctor_id, precio_aplicado, cantidad')
      .eq('consulta_id', id) as typeof conceptosRes;
  }
  if (conceptosRes.error) {
    return NextResponse.json({ error: handleSupabaseError(conceptosRes.error, 'consultas.servicios.leer').mensaje }, { status: 500 });
  }
  const actuales = (conceptosRes.data || []) as ConceptoFila[];

  // Precio desde el catálogo de la aseguranza (mismo criterio que al crear).
  const resolver = async (tipo: Tipo, servicioId: string | null | undefined, nombre: string) => {
    if (!aseguranzaId) return { id: servicioId || null, nombre, costo: 0 };
    let q = supabase
      .from('aseguranza_servicios')
      .select('id, nombre, costo')
      .eq('aseguranza_id', aseguranzaId)
      .eq('activo', true)
      .eq('tipo', tipo);
    q = servicioId ? q.eq('id', servicioId) : q.ilike('nombre', nombre.replace(/[\\%_]/g, (c) => `\\${c}`));
    const { data: svc } = await q.limit(1).maybeSingle();
    return { id: svc?.id || servicioId || null, nombre: svc?.nombre || nombre, costo: Number(svc?.costo) || 0 };
  };

  const pedidos: Array<{ tipo: Tipo; servicio: z.infer<typeof servicioSchema> }> = [
    ...data.estudios.map((s) => ({ tipo: 'ESTUDIO' as Tipo, servicio: s })),
    ...data.procedimientos.map((s) => ({ tipo: 'PROCEDIMIENTO' as Tipo, servicio: s })),
  ];

  // Empareja cada servicio pedido con un concepto existente equivalente.
  const disponibles = actuales.filter((c) => c.tipo_concepto === 'ESTUDIO' || c.tipo_concepto === 'PROCEDIMIENTO');
  const conservados = new Set<string>();
  const nuevos: Array<{ tipo: Tipo; servicio: z.infer<typeof servicioSchema> }> = [];
  for (const p of pedidos) {
    const doctor = p.servicio.doctor_id || consulta.doctor_id;
    const indicado = p.servicio.indicado_por_id || consulta.doctor_id;
    const match = disponibles.find((c) =>
      !conservados.has(c.id)
      && c.tipo_concepto === p.tipo
      && (p.servicio.id ? c.concepto_id === p.servicio.id : norm(c.texto_original) === norm(p.servicio.nombre))
      && (c.doctor_id || consulta.doctor_id) === doctor
      && (!conIndicado || (c.indicado_por_id || consulta.doctor_id) === indicado));
    if (match) conservados.add(match.id);
    else nuevos.push(p);
  }
  const quitados = disponibles.filter((c) => !conservados.has(c.id));

  // No se quita un servicio cuyo honorario ya se pagó.
  if (quitados.length) {
    const { data: pagados } = await supabase
      .from('eventos_honorario')
      .select('id')
      .in('origen_id', quitados.map((q) => q.id))
      .eq('estado', 'PAGADO')
      .limit(1);
    if (pagados && pagados.length) {
      return NextResponse.json(
        { error: 'No se puede quitar un estudio o procedimiento cuyo honorario ya se pagó' },
        { status: 409 },
      );
    }
  }

  const precios = await Promise.all(nuevos.map((n) => resolver(n.tipo, n.servicio.id, n.servicio.nombre)));
  const filasNuevas = nuevos.map((n, i) => ({
    consulta_id: id,
    doctor_id: n.servicio.doctor_id || consulta.doctor_id,
    ...(conIndicado ? { indicado_por_id: n.servicio.indicado_por_id || consulta.doctor_id } : {}),
    tipo_concepto: n.tipo,
    concepto_id: precios[i].id,
    texto_original: precios[i].nombre,
    precio_aplicado: precios[i].costo,
    cantidad: 1,
    ojo: null,
  }));

  // 1) Insertar los nuevos conceptos.
  if (filasNuevas.length) {
    const { error } = await supabase.from('consulta_conceptos').insert(filasNuevas);
    if (error) {
      return NextResponse.json({ error: handleSupabaseError(error, 'consultas.servicios.insertar').mensaje }, { status: 500 });
    }
  }

  // 2) Quitar los que ya no están (y cancelar sus honorarios pendientes).
  if (quitados.length) {
    const ids = quitados.map((q) => q.id);
    await supabase.from('eventos_honorario').update({ estado: 'CANCELADO' }).in('origen_id', ids).neq('estado', 'PAGADO');
    const { error } = await supabase.from('consulta_conceptos').delete().in('id', ids);
    if (error) {
      return NextResponse.json({ error: handleSupabaseError(error, 'consultas.servicios.quitar').mensaje }, { status: 500 });
    }
  }

  // 3) Columnas de la consulta y costo total.
  const est = data.estudios;
  const procs = data.procedimientos;
  const costoConservado = actuales
    .filter((c) => !quitados.some((q) => q.id === c.id))
    .reduce((s, c) => s + (Number(c.precio_aplicado) || 0) * Math.max(1, Number(c.cantidad) || 1), 0);
  const costoTotal = costoConservado + filasNuevas.reduce((s, f) => s + f.precio_aplicado, 0);
  const montoPagado = Number(consulta.monto_pagado) || 0;

  const update: Record<string, unknown> = {
    estudio_1: est[0]?.nombre ?? null,
    estudio_2: est[1]?.nombre ?? null,
    estudio_3: est[2]?.nombre ?? null,
    estudio_1_doctor_id: est[0] ? est[0].doctor_id || null : null,
    estudio_2_doctor_id: est[1] ? est[1].doctor_id || null : null,
    estudio_3_doctor_id: est[2] ? est[2].doctor_id || null : null,
    procedimiento: procs.length ? procs.map((p) => p.nombre).join(', ') : null,
    procedimiento_doctor_id: procs[0] ? procs[0].doctor_id || null : null,
  };
  // El costo solo se recalcula si cambió algún servicio con precio.
  if (filasNuevas.length || quitados.length) {
    update.costo_total = costoTotal;
    update.estatus_pago = costoTotal > 0 && montoPagado < costoTotal ? 'PENDIENTE_PAGO' : (consulta.estatus_pago || 'PENDIENTE_PAGO');
  }

  const { data: actualizada, error: updError } = await supabase
    .from('consultas')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (updError) {
    return NextResponse.json({ error: handleSupabaseError(updError, 'consultas.servicios.actualizar').mensaje }, { status: 500 });
  }

  // 4) Historial y honorarios de los servicios nuevos (best-effort).
  await Promise.all([
    Promise.resolve(
      supabase.from('consulta_historial').insert({
        consulta_id: id,
        tipo_evento: 'EDICION',
        usuario_id: auth.user.id,
        payload: {
          motivo: 'Estudios y procedimientos actualizados',
          agregados: filasNuevas.map((f) => f.texto_original),
          quitados: quitados.map((q) => q.texto_original),
        },
      }),
    ).then(({ error }) => { if (error) handleSupabaseError(error, 'consultas.servicios.historial'); }),
    filasNuevas.length
      ? (async () => {
          // Respeta «devengo automático» de Configuración › Honorarios.
          const { data: cfg } = await supabase.from('configuracion_sistema').select('valor').eq('clave', 'honorarios').maybeSingle();
          if ((cfg?.valor as Record<string, unknown> | null)?.devengo_automatico === false) return;
          await new MotorDevengoService().generarDesdeConsulta(id);
        })().catch((err) => console.error('Honorarios al editar servicios:', err))
      : null,
  ]);

  return NextResponse.json(actualizada);
}

export const PUT = ruta('consultas/[id]/servicios#PUT', manejarPUT);
