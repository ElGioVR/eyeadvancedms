import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
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
  const body = await request.json();
  const { tipo_evento, payload } = body;

  if (!tipo_evento) {
    return NextResponse.json({ error: 'tipo_evento es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from('consulta_historial').insert({
    consulta_id: id,
    tipo_evento,
    usuario_id: auth.user.id,
    payload: payload ?? {},
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
