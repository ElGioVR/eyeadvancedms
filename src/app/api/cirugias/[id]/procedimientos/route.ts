import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorInterno, leerJSON, uuid, validarId } from '@/lib/api/validar';
import { ruta } from '@/lib/api/ruta';

/** C8: procedimientos adicionales de una cirugía (con su ojo). Reemplaza la lista completa. */
const esquemaProcedimientos = z.object({
  procedimientos: z
    .array(z.object({ servicio_id: uuid, ojo: z.enum(['OD', 'OI', 'OU']) }))
    .max(10, 'Demasiados procedimientos'),
});

/** Estados en los que la cirugía ya no se puede modificar. */
const ESTADOS_CERRADOS = new Set(['CANCELADA', 'CANCELADO', 'COMPLETADA', 'COMPLETADO', 'REAGENDADA', 'REAGENDADO']);

async function manejarPUT(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const data = await leerJSON(request, esquemaProcedimientos);
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();
  const { data: cirugia, error: errCirugia } = await supabase
    .from('agenda_cirugias')
    .select('id, servicio_id, estado')
    .eq('id', id)
    .maybeSingle();
  if (errCirugia) return errorInterno(errCirugia, 'cirugias.procedimientos.leer');
  if (!cirugia) return NextResponse.json({ error: 'Cirugía no encontrada' }, { status: 404 });
  if (ESTADOS_CERRADOS.has(String(cirugia.estado ?? ''))) {
    return NextResponse.json({ error: 'La cirugía ya está cerrada; no se pueden cambiar sus procedimientos' }, { status: 409 });
  }

  // Sin duplicados y sin repetir el procedimiento principal.
  const vistos = new Set<string>();
  const filas = data.procedimientos.filter((p) => {
    if (p.servicio_id === cirugia.servicio_id || vistos.has(p.servicio_id)) return false;
    vistos.add(p.servicio_id);
    return true;
  });

  const nombres = new Map<string, string>();
  if (filas.length) {
    const { data: servicios, error: errServicios } = await supabase
      .from('aseguranza_servicios')
      .select('id, nombre')
      .in('id', filas.map((f) => f.servicio_id));
    if (errServicios) return errorInterno(errServicios, 'cirugias.procedimientos.servicios');
    if (!servicios || servicios.length !== filas.length) {
      return NextResponse.json({ error: 'Alguno de los procedimientos no existe' }, { status: 400 });
    }
    servicios.forEach((s) => nombres.set(s.id as string, s.nombre as string));
  }

  const { error: errBorrar } = await supabase.from('cirugia_procedimientos').delete().eq('cirugia_id', id);
  if (errBorrar) return errorInterno(errBorrar, 'cirugias.procedimientos.borrar');

  if (filas.length) {
    const { error: errInsertar } = await supabase.from('cirugia_procedimientos').insert(
      filas.map((f, i) => ({
        cirugia_id: id,
        servicio_id: f.servicio_id,
        nombre: nombres.get(f.servicio_id) ?? '',
        orden: i + 1,
        ojo: f.ojo,
      }))
    );
    if (errInsertar) return errorInterno(errInsertar, 'cirugias.procedimientos.insertar');
  }

  return NextResponse.json({ ok: true, total: filas.length });
}

export const PUT = ruta('cirugias/[id]/procedimientos#PUT', manejarPUT);
