import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { z } from 'zod';

const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).max(200).optional(),
  all: z.boolean().optional(),
}).strict().refine((data) => data.ids || data.all === true, {
  message: 'Debe proporcionar "ids" o "all: true"',
});

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('notificaciones')
    .select('id,tipo,titulo,mensaje,entidad_tipo,entidad_id,leido,created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'notificaciones').mensaje }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await leerJSON(request, markReadSchema, { maxBytes: 16_000 });
  if (body instanceof NextResponse) return body;
  // Nada que marcar: no se consulta la BD
  if (!body.all && body.ids?.length === 0) return NextResponse.json({ success: true });

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('notificaciones')
    .update({ leido: true })
    .eq('user_id', auth.user.id);

  if (body.all) {
    query = query.eq('leido', false);
  } else if (body.ids) {
    // Sólo las no leídas: evita reescribir filas que no cambian
    query = query.in('id', body.ids).eq('leido', false);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'notificaciones').mensaje }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
