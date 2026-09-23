import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface ReglaProductividadCirugia {
  id: string;
  origen_id: string;
  servicio_id: string;
  rol_id: string;
  tipo_calculo: 'FIJO' | 'PORCENTAJE';
  valor: number;
  moneda: string;
}

export interface ProductividadCirugiaRow {
  id: string;
  cirugia_id: string;
  participante_id: string;
  origen_id: string | null;
  servicio_id: string | null;
  rol_id: string | null;
  estado: string;
  monto: number | null;
  regla_id: string | null;
  created_at: string;
  updated_at: string;
}

function fechaHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Busca la regla de productividad vigente para una combinación
 * Origen + Servicio + Rol.
 */
export async function obtenerReglaProductividad({
  origen_id,
  servicio_id,
  rol_id,
}: {
  origen_id: string;
  servicio_id: string;
  rol_id: string;
}): Promise<ReglaProductividadCirugia | null> {
  const supabase = getSupabaseAdmin();
  const hoy = fechaHoy();

  const { data, error } = await supabase
    .from('reglas_productividad_cirugia')
    .select('id, origen_id, servicio_id, rol_id, tipo_calculo, valor, moneda')
    .eq('origen_id', origen_id)
    .eq('servicio_id', servicio_id)
    .eq('rol_id', rol_id)
    .eq('activo', true)
    .lte('vigente_desde', hoy)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`)
    .order('vigente_desde', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Error al consultar regla de productividad: ${error.message}`);
  }

  return data as ReglaProductividadCirugia | null;
}

/**
 * Calcula el monto a partir de una regla. Si es PORCENTAJE, toma como base
 * el costo del servicio en `aseguranza_servicios`.
 */
export async function calcularMontoProductividad(
  regla: ReglaProductividadCirugia,
  servicio_id: string
): Promise<number> {
  if (regla.tipo_calculo === 'FIJO') {
    return Number(regla.valor) || 0;
  }

  if (regla.tipo_calculo === 'PORCENTAJE') {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('aseguranza_servicios')
      .select('costo')
      .eq('id', servicio_id)
      .single();

    if (error || !data) {
      return 0;
    }

    const costo = Number(data.costo) || 0;
    return (costo * (Number(regla.valor) || 0)) / 100;
  }

  return 0;
}

/**
 * Recalcula la productividad de una cirugía aplicando las reglas vigentes
 * Origen + Servicio + Rol. Deja el estado en 'PENDIENTE' y guarda el monto
 * y la regla aplicada.
 */
export async function calcularProductividadCirugia(
  cirugia_id: string
): Promise<{ actualizados: number; sin_regla: number }> {
  const supabase = getSupabaseAdmin();

  const { data: cirugia, error: cirugiaError } = await supabase
    .from('agenda_cirugias')
    .select('origen_id, servicio_id')
    .eq('id', cirugia_id)
    .single();

  if (cirugiaError || !cirugia) {
    throw new Error('Cirugía no encontrada');
  }

  if (!cirugia.origen_id || !cirugia.servicio_id) {
    throw new Error('La cirugía no tiene origen o servicio definido');
  }

  const { data: rows, error: rowsError } = await supabase
    .from('cirugia_productividad')
    .select('id, rol_id')
    .eq('cirugia_id', cirugia_id);

  if (rowsError) {
    throw new Error(`Error al consultar productividad: ${rowsError.message}`);
  }

  let actualizados = 0;
  let sinRegla = 0;

  for (const row of rows || []) {
    if (!row.rol_id) {
      sinRegla += 1;
      continue;
    }

    const regla = await obtenerReglaProductividad({
      origen_id: cirugia.origen_id as string,
      servicio_id: cirugia.servicio_id as string,
      rol_id: row.rol_id,
    });

    if (!regla) {
      sinRegla += 1;
      continue;
    }

    const monto = await calcularMontoProductividad(regla, cirugia.servicio_id as string);

    const { error: updateError } = await supabase
      .from('cirugia_productividad')
      .update({
        monto,
        regla_id: regla.id,
        estado: 'PENDIENTE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (updateError) {
      throw new Error(`Error al actualizar productividad: ${updateError.message}`);
    }

    actualizados += 1;
  }

  return { actualizados, sin_regla: sinRegla };
}

/**
 * Devuelve los registros de productividad de una cirugía.
 */
export async function listarProductividadCirugia(
  cirugia_id: string
): Promise<ProductividadCirugiaRow[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('cirugia_productividad')
    .select('*')
    .eq('cirugia_id', cirugia_id)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Error al listar productividad: ${error.message}`);
  }

  return (data || []) as ProductividadCirugiaRow[];
}
