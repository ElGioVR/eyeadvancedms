import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { requireRoleInventario } from '@/lib/acceso-enfermeria';
import { translateError } from '@/lib/supabase/errors';
import { ingresarLenteAInventario } from '@/lib/inventario-lentes';
import { leerJSON } from '@/lib/api/validar';
import { ruta } from '@/lib/api/ruta';
import { notificarLenteRecibido } from '@/services/notificaciones';

/*
 * Plan de resurtimiento: lentes en modo SOLICITAR de cirugías activas.
 * GET   → pendientes, priorizados por la fecha de cirugía más próxima.
 * PATCH → { ids, accion: 'SOLICITAR' }  marca como solicitados.
 *         { id, accion: 'RECIBIR', lote?, expiration_date?, serial_number? }
 *           da entrada al inventario (Kardex ENTRADA), asigna automáticamente la
 *           pieza a la cirugía/paciente que la pidió (LISTO) y notifica a quien
 *           la pidió (creado_por o, si no hay, quien creó la cirugía), a quien
 *           la marcó como solicitada y a quien la recibió.
 * Requiere sql/patch-lentes-logistica-supabase.sql.
 */

const ESTADOS_ACTIVOS_EXCLUIDOS = ['cancelada', 'completada', 'reagendada'];

export interface PlanResurtimientoFila {
  id: string;
  cirugia_id: string;
  orden: 'PRIMERO' | 'SEGUNDO' | 'RESPALDO';
  fabricante: string | null;
  modelo: string | null;
  torico: boolean;
  marca: boolean;
  poder_d: number | null;
  cilindro: number | null;
  estado_logistica: 'POR_SOLICITAR' | 'SOLICITADO';
  solicitado_at: string | null;
  paciente: string | null;
  expediente: string | null;
  fecha: string | null;
  hora: string | null;
  ojo: string | null;
  dias_para_cirugia: number | null;
}

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRoleInventario(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { data, error } = await getSupabaseAdmin()
    .from('cirugia_lentes')
    .select('id, cirugia_id, orden, fabricante, modelo, torico, marca, poder_d, cilindro, estado_logistica, solicitado_at, agenda_cirugias!inner(fecha, hora, ojo, nombre_paciente, expediente, estado)')
    .eq('modo', 'SOLICITAR')
    .eq('estado', 'RESERVADO')
    .in('estado_logistica', ['POR_SOLICITAR', 'SOLICITADO'])
    .limit(500);
  if (error) {
    return NextResponse.json({ error: translateError(error.message) }, { status: 500 });
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const filas = (data ?? [])
    .map((r: any) => ({ r, c: Array.isArray(r.agenda_cirugias) ? r.agenda_cirugias[0] : r.agenda_cirugias }))
    .filter(({ c }) => c && !ESTADOS_ACTIVOS_EXCLUIDOS.includes(String(c.estado ?? '').toLowerCase()))
    .map(({ r, c }): PlanResurtimientoFila => {
      const f = c.fecha ? new Date(`${String(c.fecha).slice(0, 10)}T00:00:00`) : null;
      return {
        id: r.id,
        cirugia_id: r.cirugia_id,
        orden: r.orden,
        fabricante: r.fabricante,
        modelo: r.modelo,
        torico: !!r.torico,
        marca: !!r.marca,
        poder_d: r.poder_d != null ? Number(r.poder_d) : null,
        cilindro: r.cilindro != null ? Number(r.cilindro) : null,
        estado_logistica: r.estado_logistica,
        solicitado_at: r.solicitado_at,
        paciente: c.nombre_paciente ?? null,
        expediente: c.expediente ?? null,
        fecha: c.fecha ?? null,
        hora: c.hora ?? null,
        ojo: c.ojo ?? null,
        dias_para_cirugia: f ? Math.round((f.getTime() - hoy.getTime()) / 86400000) : null,
      };
    })
    // Prioridad: cirugía más próxima primero; a igual fecha, el primer lente antes que el respaldo.
    .sort((a, b) => String(a.fecha ?? '9999').localeCompare(String(b.fecha ?? '9999'))
      || String(a.hora ?? '').localeCompare(String(b.hora ?? ''))
      || ['PRIMERO', 'SEGUNDO', 'RESPALDO'].indexOf(a.orden) - ['PRIMERO', 'SEGUNDO', 'RESPALDO'].indexOf(b.orden));
  return NextResponse.json(filas);
}

const solicitarSchema = z.object({
  accion: z.literal('SOLICITAR'),
  ids: z.array(z.string().uuid()).min(1).max(100),
});
const recibirSchema = z.object({
  accion: z.literal('RECIBIR'),
  id: z.string().uuid(),
  lote: z.string().trim().max(100).optional().nullable(),
  expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  serial_number: z.string().trim().max(100).optional().nullable(),
});
const patchSchema = z.discriminatedUnion('accion', [solicitarSchema, recibirSchema]);

async function manejarPATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRoleInventario(auth.user, ['admin', 'recepcionista']);
  if (roleError) return roleError;
  const data = await leerJSON(request, patchSchema);
  if (data instanceof NextResponse) return data;
  const supabase = getSupabaseAdmin();
  const ahora = new Date().toISOString();

  if (data.accion === 'SOLICITAR') {
    const { data: act, error } = await supabase
      .from('cirugia_lentes')
      .update({ estado_logistica: 'SOLICITADO', solicitado_at: ahora, solicitado_por: auth.user.id, updated_at: ahora })
      .in('id', data.ids)
      .eq('modo', 'SOLICITAR')
      .eq('estado', 'RESERVADO')
      .eq('estado_logistica', 'POR_SOLICITAR')
      .select('id');
    if (error) return NextResponse.json({ error: translateError(error.message) }, { status: 500 });
    return NextResponse.json({ ok: true, actualizados: act?.length ?? 0 });
  }

  // RECIBIR
  const { data: lente } = await supabase
    .from('cirugia_lentes')
    .select('id, cirugia_id, orden, fabricante, modelo, poder_d, cilindro, torico, estado, estado_logistica, inventario_item_id, solicitado_por')
    .eq('id', data.id)
    .eq('modo', 'SOLICITAR')
    .maybeSingle();
  if (!lente || lente.estado !== 'RESERVADO') {
    return NextResponse.json({ error: 'El lente ya no está pendiente en el plan.' }, { status: 404 });
  }
  if (lente.inventario_item_id) {
    return NextResponse.json({ error: 'Este lente ya fue recibido.' }, { status: 409 });
  }
  if (!lente.fabricante || !lente.modelo) {
    return NextResponse.json({ error: 'El lente solicitado no tiene marca y modelo.' }, { status: 400 });
  }

  // 1) Entrada al inventario (suma si ya existe el mismo lente; si no, lo crea) + Kardex.
  const ingreso = await ingresarLenteAInventario(
    {
      fabricante: lente.fabricante,
      modelo: lente.modelo,
      poder_d: lente.poder_d != null ? Number(lente.poder_d) : null,
      cilindro: lente.cilindro != null ? Number(lente.cilindro) : null,
      torico: !!lente.torico,
      lote: data.lote ?? null,
      expiration_date: data.expiration_date ?? null,
      serial_number: data.serial_number ?? null,
    },
    auth.user.id,
    {
      referenciaId: lente.cirugia_id,
      motivo: `Recepción de plan de resurtimiento — ${lente.orden.toLowerCase()}${data.serial_number ? ` · SN ${data.serial_number}` : ''}`,
    },
  );
  if (!ingreso.ok) return NextResponse.json({ error: ingreso.error }, { status: ingreso.status });
  const itemId = ingreso.itemId;

  // 2) Asignación automática: la pieza queda comprometida a la cirugía (paciente) que la pidió.
  const { data: asignado, error: errLente } = await supabase
    .from('cirugia_lentes')
    .update({
      inventario_item_id: itemId,
      estado_logistica: 'LISTO',
      recibido_at: ahora,
      recibido_por: auth.user.id,
      updated_at: ahora,
    })
    .eq('id', lente.id)
    .is('inventario_item_id', null)
    .select('id');
  if (errLente) return NextResponse.json({ error: translateError(errLente.message) }, { status: 500 });
  if (!asignado?.length) {
    return NextResponse.json({ error: 'Otro usuario recibió este lente al mismo tiempo; la pieza quedó en inventario sin asignar.' }, { status: 409 });
  }

  // 3) Avisos: quien lo pidió + quien lo marcó como solicitado + quien lo recibió.
  const { data: cx } = await supabase
    .from('agenda_cirugias')
    .select('nombre_paciente, fecha, hora, created_by')
    .eq('id', lente.cirugia_id)
    .maybeSingle();
  // creado_por es opcional (sql/patch-lente-recibido-notificacion.sql): si no existe, se usa quien creó la cirugía.
  const { data: extra } = await supabase.from('cirugia_lentes').select('creado_por').eq('id', lente.id).maybeSingle();
  const { data: receptor } = await supabase.from('usuarios').select('nombre').eq('id', auth.user.id).maybeSingle();
  const solicitante = (extra as { creado_por?: string | null } | null)?.creado_por ?? (cx as { created_by?: string | null } | null)?.created_by ?? null;
  const notificados = await notificarLenteRecibido({
    userIds: [solicitante, lente.solicitado_por, auth.user.id],
    cirugiaId: lente.cirugia_id,
    paciente: cx?.nombre_paciente ?? 'paciente',
    fecha: cx?.fecha ? String(cx.fecha).slice(0, 10) : null,
    hora: cx?.hora ?? null,
    lente: [lente.fabricante, lente.modelo, lente.poder_d != null ? `${lente.poder_d}D` : null, lente.torico && lente.cilindro != null ? `cil. ${lente.cilindro}` : null].filter(Boolean).join(' '),
    orden: lente.orden === 'PRIMERO' ? 'primer lente' : lente.orden === 'SEGUNDO' ? 'segundo lente' : 'respaldo',
    recibidoPor: (receptor as { nombre?: string | null } | null)?.nombre ?? null,
  });
  return NextResponse.json({ ok: true, inventario_item_id: itemId, paciente: cx?.nombre_paciente ?? null, notificados });
}

export const GET = ruta('inventario/plan-resurtimiento#GET', manejarGET);
export const PATCH = ruta('inventario/plan-resurtimiento#PATCH', manejarPATCH);
