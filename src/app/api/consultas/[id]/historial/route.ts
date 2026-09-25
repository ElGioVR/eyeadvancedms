import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { errorTranslations } from '@/lib/supabase/errors';
import { requireAuth, requireRole } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('consulta_historial')
    .select('id, consulta_id, tipo_evento, usuario_id, payload, created_at')
    .eq('consulta_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let enriched = data || [];
  const userIds = [...new Set(enriched.map((h) => h.usuario_id).filter(Boolean))];
  if (userIds.length > 0) {
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .in('id', userIds);
    const userMap = new Map((usuarios || []).map((u: any) => [u.id, u.nombre]));
    enriched = enriched.map((h) => ({
      ...h,
      usuario_nombre: h.usuario_id ? userMap.get(h.usuario_id) || null : null,
    }));
  }

  return NextResponse.json({ data: enriched });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  let body: { tipo_evento?: unknown; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const tipo_evento = typeof body.tipo_evento === 'string' ? body.tipo_evento.trim() : '';
  const payload = body.payload;

  if (!tipo_evento) {
    return NextResponse.json({ error: 'tipo_evento es requerido' }, { status: 400 });
  }
  if (tipo_evento.length > 60) {
    return NextResponse.json({ error: 'tipo_evento demasiado largo' }, { status: 400 });
  }
  if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
    return NextResponse.json({ error: 'payload debe ser un objeto' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Verificar que la consulta exista antes de registrar el evento
  const { data: consulta, error: consultaError } = await supabase
    .from('consultas')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (consultaError || !consulta) {
    return NextResponse.json({ error: 'Consulta no encontrada' }, { status: 404 });
  }

  const { error } = await supabase.from('consulta_historial').insert({
    consulta_id: id,
    tipo_evento,
    usuario_id: auth.user.id,
    payload: (payload as Record<string, unknown>) ?? {},
  });

  if (error) {
    return NextResponse.json(
      { error: errorTranslations[error.message] || 'Error al registrar el evento' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
