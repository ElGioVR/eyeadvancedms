import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { fechaISO } from '@/lib/api/validar';
import { ruta } from '@/lib/api/ruta';
import { ROLES_VER_AGENDA } from '@/lib/permisos-agenda';

const querySchema = z.object({
  paciente_id: z.string().uuid(),
  fecha: fechaISO,
});

/**
 * Estudios y procedimientos del paciente en un día (comentario C16).
 * Para enfermería en el celular: solo nombres, sin costos ni pagos, así que
 * no requiere acceso a /api/consultas.
 */
async function manejarGET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ROLES_VER_AGENDA);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const q = querySchema.safeParse({
    paciente_id: searchParams.get('paciente_id') ?? '',
    fecha: searchParams.get('fecha') ?? '',
  });
  if (!q.success) {
    return NextResponse.json({ error: 'Parámetros no válidos (paciente_id, fecha)' }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from('consultas')
    .select('id, estudio_1, estudio_2, estudio_3, procedimiento, estatus')
    .eq('paciente_id', q.data.paciente_id)
    .eq('fecha', q.data.fecha)
    .neq('estatus', 'CANCELADA')
    .order('hora_inicio', { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'agenda.estudios-dia').mensaje }, { status: 500 });
  }

  const items = (data ?? []).flatMap((c) => {
    const estudios = [c.estudio_1, c.estudio_2, c.estudio_3]
      .filter((n): n is string => !!n && n.trim() !== '')
      .map((n, i) => ({ id: `${c.id}-e${i}`, tipo: 'ESTUDIO' as const, etiqueta: n }));
    const proc = c.procedimiento && c.procedimiento.trim() !== ''
      ? [{ id: `${c.id}-p`, tipo: 'PROCEDIMIENTO' as const, etiqueta: c.procedimiento }]
      : [];
    return [...estudios, ...proc];
  });

  return NextResponse.json({ data: items }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = ruta('agenda/estudios-dia#GET', manejarGET);
