import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { z } from 'zod';

const cerrarSchema = z.object({
  notas: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const body = await request.json().catch(() => ({}));
  const validation = cerrarSchema.safeParse(body);

  const { data: periodo, error: e1 } = await supabase
    .from('periodos_pago')
    .select('*')
    .eq('id', id)
    .single();

  if (e1 || !periodo) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });
  if (periodo.estado !== 'ABIERTO' && periodo.estado !== 'EN_REVISION') {
    return NextResponse.json({ error: `Solo se pueden cerrar períodos ABIERTOS o EN_REVISION` }, { status: 400 });
  }

  const { data: eventos, count: eventosCount, error: e2 } = await supabase
    .from('eventos_honorario')
    .select('id', { count: 'exact', head: true })
    .eq('periodo_id', id)
    .eq('estado', 'DEVENGADO');

  await supabase
    .from('eventos_honorario')
    .update({ estado: 'LIQUIDADO' })
    .eq('periodo_id', id)
    .eq('estado', 'DEVENGADO');

  const { data: liquidaciones } = await supabase.rpc('generar_liquidaciones', { p_periodo_id: id });

  const notas = validation.data?.notas || '';
  await supabase.from('periodos_pago').update({
    estado: 'CERRADO',
    cerrado_por: auth.user.id,
    cerrado_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    notas: notas || periodo.notas,
  }).eq('id', id);

  await supabase.from('bitacora_honorarios').insert({
    tabla: 'periodos_pago', registro_id: id, accion: 'CIERRE',
    valor_anterior: { estado: periodo.estado }, valor_nuevo: { estado: 'CERRADO' },
    usuario_id: auth.user.id,
  });

  return NextResponse.json({
    success: true,
    estado: 'CERRADO',
    eventos_congelados: (eventosCount as number) || 0,
    liquidaciones_generadas: liquidaciones ? (Array.isArray(liquidaciones) ? liquidaciones.length : 1) : 0,
  });
}
