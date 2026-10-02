import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError, mensajeSeguro } from '@/lib/supabase/handle-error';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerJSON, validarId } from '@/lib/api/validar';
import { doctorRequerido, verificarDueno } from '@/lib/consultas-acceso';
import { agendaSoloPropia } from '@/lib/permisos-agenda';

/** Tipos admitidos por el CHECK de consulta_historial.tipo_evento (migración 090). */
const TIPOS_EVENTO = ['CREACION', 'CAMBIO_ESTATUS', 'EDICION', 'CANCELACION', 'REAGENDADO', 'PAGADO', 'FINALIZADO'] as const;

const eventoSchema = z
  .object({
    tipo_evento: z
      .string()
      .trim()
      .min(1, 'tipo_evento es requerido')
      .max(60, 'tipo_evento demasiado largo')
      .pipe(z.enum(TIPOS_EVENTO, { errorMap: () => ({ message: 'tipo_evento no válido' }) })),
    payload: z.record(z.unknown()).optional(),
  })
  .strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const { id } = await params;
  const idError = validarId(id, 'ID de consulta');
  if (idError) return idError;
  const supabase = getSupabaseAdmin();

  // Historial + (solo rol doctor) consulta y doctor del usuario, en paralelo
  const requeridoP = doctorRequerido(auth.user.id, auth.perfil);
  const [historialResult, requerido, consultaResult] = await Promise.all([
    supabase
      .from('consulta_historial')
      .select('id, consulta_id, tipo_evento, usuario_id, payload, created_at')
      .eq('consulta_id', id)
      .order('created_at', { ascending: false })
      .limit(500),
    requeridoP,
    agendaSoloPropia(auth.perfil?.rol)
      ? supabase.from('consultas').select('doctor_id').eq('id', id).maybeSingle()
      : Promise.resolve(null),
  ]);

  // RBAC: el rol de agenda propia solo ve el historial de lo suyo (como en GET /consultas/[id])
  if (requerido !== undefined) {
    const denegado = verificarDueno(requerido, consultaResult?.data?.doctor_id);
    if (denegado) return denegado;
  }

  const { data, error } = historialResult;
  if (error) {
    return NextResponse.json({ error: mensajeSeguro(error, 'consultas.[id].historial') }, { status: 500 });
  }

  let enriched: Array<Record<string, unknown>> = data || [];
  const userIds = [...new Set((data || []).map((h) => h.usuario_id).filter((u): u is string => !!u))];
  if (userIds.length > 0) {
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .in('id', userIds);
    const userMap = new Map(((usuarios || []) as Array<{ id: string; nombre: string | null }>).map((u) => [u.id, u.nombre]));
    enriched = (data || []).map((h) => ({
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
  const idError = validarId(id, 'ID de consulta');
  if (idError) return idError;

  const body = await leerJSON(request, eventoSchema, { maxBytes: 20_000 });
  if (body instanceof NextResponse) return body;

  const supabase = getSupabaseAdmin();

  // Verificar que la consulta exista (y RBAC de doctor) antes de registrar el evento
  const [consultaResult, requerido] = await Promise.all([
    supabase.from('consultas').select('id, doctor_id').eq('id', id).maybeSingle(),
    doctorRequerido(auth.user.id, auth.perfil),
  ]);
  const { data: consulta, error: consultaError } = consultaResult;
  if (consultaError || !consulta) {
    return NextResponse.json({ error: 'Consulta no encontrada' }, { status: 404 });
  }
  const denegado = verificarDueno(requerido, consulta.doctor_id);
  if (denegado) return denegado;

  const { error } = await supabase.from('consulta_historial').insert({
    consulta_id: id,
    tipo_evento: body.tipo_evento,
    usuario_id: auth.user.id,
    payload: body.payload ?? {},
  });

  if (error) {
    const { mensaje, traducido } = handleSupabaseError(error, 'consultas.[id].historial.crear');
    return NextResponse.json(
      { error: traducido ? mensaje : 'Error al registrar el evento' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
