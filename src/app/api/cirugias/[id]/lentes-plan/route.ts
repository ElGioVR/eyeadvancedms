import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { validarId, leerJSON } from '@/lib/api/validar';
import { ruta } from '@/lib/api/ruta';
import { ROLES_GESTION_AGENDA } from '@/lib/permisos-agenda';
import { estadoCerrado } from '@/lib/permisos-edicion';
import { guardarPlanLentes, liberarLentes, type OrdenLente } from '@/lib/cirugia-lentes';

/**
 * Reemplaza el plan de lentes de una cirugía abierta (formulario de edición).
 * Por cada lente del plan: asignar (reserva pieza), solicitar (plan de resurtimiento) o compra
 * directa. Los órdenes que ya no están en el plan se liberan (queda historial en cirugia_lentes).
 */
const planSchema = z.object({
  plan: z.array(z.object({
    orden: z.enum(['PRIMERO', 'SEGUNDO', 'RESPALDO']),
    modo: z.enum(['ASIGNAR', 'SOLICITAR', 'COMPRA_DIRECTA', 'SIN_TRAMITE']),
    torico: z.boolean(),
    marca: z.boolean(),
    fabricante: z.string().trim().max(255).optional().nullable(),
    modelo: z.string().trim().max(255).optional().nullable(),
    poder_d: z.number().min(0).max(40).optional().nullable(),
    cilindro: z.number().min(0).max(12).optional().nullable(),
    inventario_item_id: z.string().uuid().optional().nullable(),
  }).refine((l) => l.modo !== 'ASIGNAR' || !!l.inventario_item_id, { message: 'Falta la pieza de inventario a asignar' })).max(3),
}).strict();

async function manejarPUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ROLES_GESTION_AGENDA);
  if (roleError) return roleError;
  const cuerpo = await leerJSON(request, planSchema);
  if (cuerpo instanceof NextResponse) return cuerpo;

  const supabase = getSupabaseAdmin();
  const { data: cirugia } = await supabase.from('agenda_cirugias').select('estado').eq('id', id).maybeSingle();
  if (!cirugia) return NextResponse.json({ error: 'Cirugía no encontrada' }, { status: 404 });
  if (estadoCerrado(cirugia.estado)) {
    return NextResponse.json({ error: 'Esta cirugía ya está cerrada; sus lentes quedaron fijos' }, { status: 409 });
  }

  // Lentes que salen del plan: se liberan (primero, para que su pieza vuelva a estar disponible).
  const { data: actuales } = await supabase.from('cirugia_lentes').select('orden').eq('cirugia_id', id).eq('estado', 'RESERVADO');
  const enPlan = new Set(cuerpo.plan.map((l) => l.orden));
  for (const a of actuales ?? []) {
    if (!enPlan.has(a.orden as OrdenLente)) await liberarLentes(id, a.orden as OrdenLente);
  }

  const r = await guardarPlanLentes(id, cuerpo.plan, { reservarPrimero: true });
  if (!r.ok) return NextResponse.json({ error: `Lente ${r.orden.toLowerCase()}: ${r.error}` }, { status: 409 });

  // Pieza del primer lente en la fila de la cirugía (la usan el detalle y el cierre).
  const primero = cuerpo.plan.find((l) => l.orden === 'PRIMERO');
  await supabase
    .from('agenda_cirugias')
    .update({ inventario_item_id: primero?.modo === 'ASIGNAR' ? primero.inventario_item_id ?? null : null, updated_at: new Date().toISOString() })
    .eq('id', id);
  return NextResponse.json({ ok: true });
}

export const PUT = ruta('cirugias/[id]/lentes-plan#PUT', manejarPUT);
