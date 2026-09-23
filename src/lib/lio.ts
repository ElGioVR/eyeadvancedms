import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface LIODisponible {
  id: string;
  marca: string;
  modelo: string | null;
  tipo_lio: string | null;
  potencia_dioptrias: number | null;
  lote: string | null;
  fecha_caducidad: string | null;
  stock: number;
  estado: string;
}

/**
 * Lista los LIOs que pueden ser usados en una cirugía.
 * Filtros: tipo = LENTE_INTRAOCULAR, estado = DISPONIBLE, stock > 0,
 * fecha de caducidad nula o futura.
 */
export async function listarLIOsDisponibles(): Promise<LIODisponible[]> {
  const supabase = getSupabaseAdmin();

  const hoy = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('inventario_items')
    .select(
      'id, marca, modelo, tipo, tipo_lio, potencia_dioptrias, lote, fecha_caducidad, stock, estado'
    )
    .eq('tipo', 'LENTE_INTRAOCULAR')
    .eq('estado', 'DISPONIBLE')
    .gt('stock', 0)
    .or(`fecha_caducidad.is.null,fecha_caducidad.gt.${hoy}`)
    .order('marca', { ascending: true })
    .order('modelo', { ascending: true });

  if (error) {
    throw new Error(`Error al consultar LIOs disponibles: ${error.message}`);
  }

  return (data || []).map((item) => ({
    id: item.id,
    marca: item.marca,
    modelo: item.modelo,
    tipo_lio: item.tipo_lio,
    potencia_dioptrias: item.potencia_dioptrias,
    lote: item.lote,
    fecha_caducidad: item.fecha_caducidad,
    stock: item.stock,
    estado: item.estado,
  }));
}

export interface ValidarLIOResult {
  valido: boolean;
  error?: string;
  item?: LIODisponible;
}

/**
 * Valida que un ítem de inventario pueda usarse como LIO en una cirugía.
 * No modifica stock (eso se hace al completar la cirugía).
 */
export async function validarLIO(
  inventarioItemId: string
): Promise<ValidarLIOResult> {
  const supabase = getSupabaseAdmin();

  const { data: item, error } = await supabase
    .from('inventario_items')
    .select(
      'id, marca, modelo, tipo, tipo_lio, potencia_dioptrias, lote, fecha_caducidad, stock, estado'
    )
    .eq('id', inventarioItemId)
    .single();

  if (error || !item) {
    return { valido: false, error: 'El LIO seleccionado no existe' };
  }

  if (item.tipo !== 'LENTE_INTRAOCULAR') {
    return { valido: false, error: 'El ítem seleccionado no es un LIO' };
  }

  if (item.estado !== 'DISPONIBLE') {
    return { valido: false, error: `El LIO no está disponible (estado: ${item.estado})` };
  }

  if (item.stock < 1) {
    return { valido: false, error: 'El LIO seleccionado no tiene stock' };
  }

  if (item.fecha_caducidad) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const cad = new Date(item.fecha_caducidad);
    if (cad < hoy) {
      return { valido: false, error: 'El LIO seleccionado está caducado' };
    }
  }

  return {
    valido: true,
    item: {
      id: item.id,
      marca: item.marca,
      modelo: item.modelo,
      tipo_lio: item.tipo_lio,
      potencia_dioptrias: item.potencia_dioptrias,
      lote: item.lote,
      fecha_caducidad: item.fecha_caducidad,
      stock: item.stock,
      estado: item.estado,
    },
  };
}
