import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { errorTranslations } from '@/lib/supabase/errors';
import { requireAuth } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { z } from 'zod';

const TIPOS_EVENTO = [
  'PAGO_HONORARIOS',
  'RECORDATORIO_CONSULTA',
  'ASIGNACION_SERVICIO',
  'PROXIMA_CIRUGIA',
  'CANCELACION',
  'REAGENDADO',
  'STOCK_BAJO',
  'SISTEMA',
] as const;

const updateSchema = z.object({
  preferencias: z.array(z.object({
    tipo_evento: z.enum(TIPOS_EVENTO),
    canal: z.enum(['IN_APP', 'EMAIL', 'PUSH']),
    activo: z.boolean(),
  }).strict()).min(1).max(TIPOS_EVENTO.length * 3),
}).strict();

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('notificacion_preferencias')
    .select('id, tipo_evento, canal, activo')
    .eq('user_id', auth.user.id)
    .order('tipo_evento')
    .limit(100);

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || handleSupabaseError(error, 'notificaciones.preferencias.get').mensaje }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await leerJSON(request, updateSchema, { maxBytes: 16_000 });
  if (body instanceof NextResponse) return body;

  // Una misma (tipo_evento, canal) repetida haría fallar el upsert
  // ("cannot affect row a second time"): se conserva la última.
  const unicas = new Map(body.preferencias.map((p) => [`${p.tipo_evento}|${p.canal}`, p]));

  const supabase = getSupabaseAdmin();

  // Un solo upsert para todas las preferencias (antes: una query por preferencia, errores ignorados)
  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from('notificacion_preferencias')
    .upsert(
      Array.from(unicas.values()).map((pref) => ({
        user_id: auth.user.id,
        tipo_evento: pref.tipo_evento,
        canal: pref.canal,
        activo: pref.activo,
        updated_at: ahora,
      })),
      { onConflict: 'user_id,tipo_evento,canal' },
    );

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'notificaciones.preferencias').mensaje }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
