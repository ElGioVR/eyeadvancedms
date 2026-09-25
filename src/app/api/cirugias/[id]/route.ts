import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  const supabase = getSupabaseAdmin();

  const BASE_COLUMNS = `
    id,
    codigo,
    paciente_id,
    nombre_paciente,
    fecha,
    hora,
    estado,
    ojo,
    duracion_min,
    notas,
    origen_id,
    servicio_id,
    recurso_id,
    inventario_item_id,
    consulta_id,
    created_by,
    created_at,
    pacientes:paciente_id (nombre_completo),
    origen:origen_id (nombre),
    servicio:servicio_id (nombre),
    recurso:recurso_id (nombre, ubicacion)
  `;

  // 1er intento: con embed de LIO; si el esquema de inventario no tiene esas
  // columnas, se reintenta sin él y el LIO se resuelve aparte (best-effort).
  let cirugia: Record<string, unknown> | null = null;
  let error: { message: string } | null = null;

  const primero = await supabase
    .from('agenda_cirugias')
    .select(
      `${BASE_COLUMNS},
      lio:inventario_item_id (marca, modelo, tipo_lio, lote, fecha_caducidad)
    `
    )
    .eq('id', id)
    .maybeSingle();
  cirugia = (primero.data as Record<string, unknown> | null) ?? null;
  error = primero.error;

  if (error) {
    const retry = await supabase
      .from('agenda_cirugias')
      .select(BASE_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    cirugia = (retry.data as Record<string, unknown> | null) ?? null;
    error = retry.error;

    if (!error && cirugia) {
      const itemId = cirugia.inventario_item_id as string | null;
      if (itemId) {
        let lioQuery = await supabase
          .from('inventario_items')
          .select('marca, modelo, tipo_lio, lote, fecha_caducidad')
          .eq('id', itemId)
          .maybeSingle();
        if (lioQuery.error) {
          lioQuery = await supabase
            .from('inventario_items')
            .select('manufacturer AS marca, model AS modelo, lote, expiration_date AS fecha_caducidad')
            .eq('id', itemId)
            .maybeSingle();
        }
        cirugia.lio = lioQuery.data ?? null;
      }
    }
  }

  if (error) {
    return NextResponse.json({ error: handleSupabaseError(error, 'cirugias/[id]').mensaje }, { status: 500 });
  }
  if (!cirugia) {
    return NextResponse.json({ error: 'Cirugía no encontrada' }, { status: 404 });
  }

  const [participantes, archivos, productividad, historial] = await Promise.all([
    supabase
      .from('cirugia_participantes')
      .select('id, medico_id, rol_id, doctores:medico_id(alias), roles:rol_id(nombre, clave)')
      .eq('cirugia_id', id),
    supabase
      .from('cirugia_archivos')
      .select('id, nombre_original, mime_type, size, tipo_documento, uploaded_by, created_at')
      .eq('cirugia_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('cirugia_productividad')
      .select('id, participante_id, rol_id, estado, monto, regla_id, roles:rol_id(nombre)')
      .eq('cirugia_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('cirugia_historial')
      .select('id, accion, detalle, usuario_id, created_at')
      .eq('cirugia_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  return NextResponse.json({
    cirugia,
    participantes: participantes.data || [],
    archivos: archivos.data || [],
    productividad: productividad.data || [],
    historial: historial.data || [],
  });
}
