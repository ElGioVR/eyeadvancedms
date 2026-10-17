import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { leerConRol, requireAuth, requireRole } from '@/lib/supabase/server';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { validarId } from '@/lib/api/validar';
import { ruta } from '@/lib/api/ruta';

/**
 * Datos completos de una cirugía para precargar el formulario de edición (mismo formulario
 * que la creación). Tolerante a esquema: `select('*')` para no fallar si faltan migraciones.
 */
async function manejarGET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idInvalido = validarId(id, 'ID de cirugía');
  if (idInvalido) return idInvalido;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const rolP = requireRole(auth.user, ['admin', 'doctor', 'recepcionista', 'enfermero']);
  const supabase = getSupabaseAdmin();

  const r = await leerConRol(rolP, async () => {
    const { data: cirugia, error } = await supabase.from('agenda_cirugias').select('*').eq('id', id).maybeSingle();
    if (error) return { error } as const;
    if (!cirugia) return { noEncontrada: true } as const;

    const [pacienteRes, participantes, personal, qx, lentes, archivos, adicionales] = await Promise.all([
      cirugia.paciente_id
        ? supabase.from('pacientes').select('id, nombre_completo, telefono, email, aseguranza_id').eq('id', cirugia.paciente_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from('cirugia_participantes').select('medico_id, rol_id, hora_inicio, hora_fin').eq('cirugia_id', id),
      supabase.from('cirugia_personal').select('rol, personal_id, hora_inicio, hora_fin').eq('cirugia_id', id),
      supabase.from('agenda_cirugias_procedimientos_qx').select('catalogo_quirurgico_id, orden').eq('cirugia_id', id).order('orden'),
      supabase
        .from('cirugia_lentes')
        .select('orden, origen, inventario_item_id, fabricante, modelo, poder_d, torico, estado, modo, marca, cilindro, estado_logistica')
        .eq('cirugia_id', id)
        .in('estado', ['RESERVADO', 'USADO'])
        .order('orden'),
      supabase
        .from('cirugia_archivos')
        .select('id, nombre_original, tipo_documento, size')
        .eq('cirugia_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      supabase.from('cirugia_procedimientos').select('servicio_id, ojo').eq('cirugia_id', id).order('orden'),
    ]);

    let paciente = pacienteRes.data as Record<string, unknown> | null;
    if (!paciente && cirugia.paciente_id) {
      // Esquema sin aseguranza_id en pacientes.
      const { data } = await supabase.from('pacientes').select('id, nombre_completo, telefono, email').eq('id', cirugia.paciente_id).maybeSingle();
      paciente = data as Record<string, unknown> | null;
    }

    // Catálogo quirúrgico: sin filas en la tabla de varios (cirugías anteriores) → el principal.
    const qxIds = (qx.data ?? []).map((x: { catalogo_quirurgico_id: string }) => x.catalogo_quirurgico_id);
    if (qxIds.length === 0 && cirugia.catalogo_quirurgico_id) qxIds.push(cirugia.catalogo_quirurgico_id as string);

    // Cirugías importadas antes del equipo homologado: el cirujano solo está en doctor_id.
    let equipo = (participantes.data ?? []) as Array<{ medico_id: string; rol_id: string; hora_inicio: string | null; hora_fin: string | null }>;
    if (equipo.length === 0 && cirugia.doctor_id) {
      const { data: rol } = await supabase.from('cat_roles_participante').select('id').eq('clave', 'cirujano').maybeSingle();
      if (rol?.id) equipo = [{ medico_id: cirugia.doctor_id as string, rol_id: rol.id as string, hora_inicio: null, hora_fin: null }];
    }

    return {
      cirugia,
      paciente: paciente ?? { id: cirugia.paciente_id, nombre_completo: cirugia.nombre_paciente, telefono: null, email: null },
      participantes: equipo,
      personal: personal.data ?? [],
      qx_ids: qxIds,
      lentes: lentes.data ?? [],
      archivos: archivos.data ?? [],
      adicionales: adicionales.data ?? [],
    } as const;
  });
  if ('denegado' in r) return r.denegado;
  const res = r.datos;
  if ('error' in res) return NextResponse.json({ error: handleSupabaseError(res.error, 'cirugias.edicion').mensaje }, { status: 500 });
  if ('noEncontrada' in res) return NextResponse.json({ error: 'Cirugía no encontrada' }, { status: 404 });
  return NextResponse.json(res);
}

export const GET = ruta('cirugias/[id]/edicion#GET', manejarGET);
