import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { leerConRol, requireAuth, requireRole } from '@/lib/supabase/server';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { validarId, leerJSON } from '@/lib/api/validar';
import { ruta } from '@/lib/api/ruta';
import { ROLES_GESTION_AGENDA } from '@/lib/permisos-agenda';
import { liberarLentes, reservarLente, ORDENES_LENTE, type OrdenLente } from '@/lib/cirugia-lentes';

/** Lentes RESERVADOS de una cirugía (para marcar cuáles se usaron al completarla). */
async function manejarGET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const rolP = requireRole(auth.user, ['admin', 'doctor', 'recepcionista', 'enfermero']);

  const r = await leerConRol(rolP, async () =>
    getSupabaseAdmin()
      .from('cirugia_lentes')
      .select('orden, origen, inventario_item_id, fabricante, modelo, poder_d, torico')
      .eq('cirugia_id', id)
      .eq('estado', 'RESERVADO')
      .order('orden')
  );
  if ('denegado' in r) return r.denegado;
  const { data, error } = r.datos;
  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'agenda.lentes.GET').mensaje }, { status: 500 });
  }
  return NextResponse.json({ lentes: data ?? [] });
}

/** Un lente por orden: inventario (con pieza) u hospital (con marca y poder). */
const lenteSchema = z
  .object({
    orden: z.enum(ORDENES_LENTE),
    origen: z.enum(['INVENTARIO', 'HOSPITAL']),
    inventario_item_id: z.string().uuid().nullable().optional(),
    fabricante: z.string().trim().max(120).nullable().optional(),
    modelo: z.string().trim().max(120).nullable().optional(),
    poder_d: z.number().min(-40).max(40).nullable().optional(),
    torico: z.boolean().optional(),
  })
  .strict()
  .refine(
    (l) => (l.origen === 'INVENTARIO' ? !!l.inventario_item_id : !!l.fabricante && l.poder_d != null),
    { message: 'Elige una pieza de inventario, o marca y poder si es del hospital' }
  );

const cambioLentesSchema = z
  .object({
    lentes: z.array(lenteSchema).max(3),
    quitar: z.array(z.enum(ORDENES_LENTE)).max(3).default([]),
  })
  .strict();

/**
 * PUT: cambia los lentes de una cirugía pendiente (comentario C3/C4).
 * Por cada orden enviada libera la reserva anterior y reserva la nueva.
 * `quitar` libera una orden sin reemplazarla (el PRIMERO no se puede quitar).
 */
async function manejarPUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ROLES_GESTION_AGENDA);
  if (roleError) return roleError;

  const cuerpo = await leerJSON(request, cambioLentesSchema);
  if (cuerpo instanceof NextResponse) return cuerpo;

  if (cuerpo.quitar.includes('PRIMERO')) {
    return NextResponse.json({ error: 'El lente primero es obligatorio; cámbialo, no lo quites' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: cirugia, error: errCirugia } = await supabase
    .from('agenda_cirugias')
    .select('estado')
    .eq('id', id)
    .maybeSingle();
  if (errCirugia) {
    return NextResponse.json({ error: handleSupabaseError(errCirugia, 'agenda.lentes.PUT').mensaje }, { status: 500 });
  }
  if (!cirugia) return NextResponse.json({ error: 'Cirugía no encontrada' }, { status: 404 });
  if (['COMPLETADA', 'CANCELADA', 'REAGENDADA'].includes(cirugia.estado)) {
    return NextResponse.json(
      { error: 'Esta cirugía ya no se puede modificar; sus lentes quedaron fijos' },
      { status: 409 }
    );
  }

  const ordenes = new Set<OrdenLente>([...cuerpo.lentes.map((l) => l.orden), ...cuerpo.quitar]);
  for (const orden of ordenes) {
    const lib = await liberarLentes(id, orden);
    if (!lib.ok) return NextResponse.json({ error: lib.error, codigo: lib.codigo }, { status: 409 });
  }

  for (const l of cuerpo.lentes) {
    const res = await reservarLente({
      cirugiaId: id,
      orden: l.orden,
      origen: l.origen,
      inventarioItemId: l.inventario_item_id ?? null,
      fabricante: l.origen === 'HOSPITAL' ? l.fabricante ?? null : null,
      modelo: l.origen === 'HOSPITAL' ? l.modelo ?? null : null,
      poderD: l.origen === 'HOSPITAL' ? l.poder_d ?? null : null,
      torico: l.torico ?? false,
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `${res.error} (${l.orden.toLowerCase()}). Las demás órdenes sí se guardaron antes de este error; revisa y vuelve a guardar.`, codigo: res.codigo },
        { status: 409 }
      );
    }
  }

  const rolP = requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  const lectura = await leerConRol(rolP, async () =>
    supabase
      .from('cirugia_lentes')
      .select('orden, origen, inventario_item_id, fabricante, modelo, poder_d, torico')
      .eq('cirugia_id', id)
      .eq('estado', 'RESERVADO')
      .order('orden')
  );
  if ('denegado' in lectura) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: true, lentes: lectura.datos.data ?? [] });
}

export const GET = ruta('agenda/[id]/lentes#GET', manejarGET);
export const PUT = ruta('agenda/[id]/lentes#PUT', manejarPUT);
