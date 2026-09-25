import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { requireAuth } from '@/lib/supabase/server';

// Proyecciones tolerantes a esquema: legacy (marca/modelo/lote/fecha_caducidad)
// y nuevo (manufacturer/model/product_name/sphere/serial_number/expiration_date).
const PROYECCION_NUEVA =
  'id, manufacturer, model, product_name, tipo, tipo_lio, potencia_dioptrias, sphere, lote, serial_number, expiration_date, stock, estado';
const PROYECCION_NUEVA_MINIMA =
  'id, manufacturer, model, product_name, sphere, lote, serial_number, expiration_date, stock, estado';

type ModoTipo = 'solo_lio' | 'campos_lio' | 'todos';

const MODOS: ModoTipo[] = ['solo_lio', 'campos_lio', 'todos'];

function esFechaCaducada(item: Record<string, unknown>, hoy: string): boolean {
  const cad = (item.fecha_caducidad || item.expiration_date || null) as string | null;
  if (!cad) return false;
  return String(cad).slice(0, 10) <= hoy;
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get('tipo');

  const supabase = getSupabaseAdmin();
  const hoy = new Date().toISOString().slice(0, 10);

  // Estrategia: 1) esquema legacy con filtro tipo (?tipo=LENTE_INTRAOCULAR);
  // 2) si la consulta falla por columnas inexistentes (esquema nuevo) se
  // reintenta con proyección nueva; 3) si no hay filas con el filtro tipo, se
  // relaja a ítems con campos LIO (tipo_lio/potencia_dioptrias) y como última
  // opción a todo el inventario disponible.
  let filas: Record<string, unknown>[] = [];
  let intentosOk = 0;
  let errorColumnas = false;
  let errorFinal: string | null = null;

  // Modo aplicable según las columnas que incluye la proyección.
  const modoAplica = (modo: ModoTipo, proyeccion: string): boolean => {
    if (modo === 'solo_lio' && !/(^|, )tipo(,|$)/.test(proyeccion)) return false;
    if (modo === 'campos_lio' && !proyeccion.includes('tipo_lio')) return false;
    return true;
  };

  const aplicarModo = (query: any, modo: ModoTipo) => {
    if (modo === 'solo_lio' && tipo) {
      return query.eq('tipo', tipo);
    }
    if (modo === 'campos_lio') {
      return query.or('tipo_lio.not.is.null,potencia_dioptrias.not.is.null');
    }
    return query;
  };

  // Intento 1: esquema legacy (marca/modelo/lote/fecha_caducidad)
  for (const modo of MODOS) {
    if (!modoAplica(modo, 'id, marca, modelo, tipo, tipo_lio, potencia_dioptrias, lote, fecha_caducidad, stock, estado')) continue;
    let query = supabase
      .from('inventario_items')
      .select(
        'id, marca, modelo, tipo, tipo_lio, potencia_dioptrias, lote, fecha_caducidad, stock, estado'
      )
      .eq('estado', 'DISPONIBLE')
      .gt('stock', 0)
      .or(`fecha_caducidad.is.null,fecha_caducidad.gt.${hoy}`)
      .order('marca', { ascending: true });

    query = aplicarModo(query, modo);

    const { data, error } = await query;
    if (error) {
      errorFinal = error.message;
      if (/column|does not exist|schema cache/i.test(error.message)) {
        errorColumnas = true;
        break;
      }
      continue;
    }
    intentosOk += 1;
    filas = (data as unknown as Record<string, unknown>[]) || [];
    if (filas.length > 0) break;
  }

  // Intento 2+: esquema nuevo (manufacturer/model) si el legacy no existe
  if (filas.length === 0 && errorColumnas) {
    for (const proyeccion of [PROYECCION_NUEVA, PROYECCION_NUEVA_MINIMA]) {
      let proyeccionValida = true;
      for (const modo of MODOS) {
        if (!proyeccionValida || !modoAplica(modo, proyeccion)) continue;
        let query = supabase
          .from('inventario_items')
          .select(proyeccion)
          .eq('estado', 'DISPONIBLE')
          .gt('stock', 0)
          .or(`expiration_date.is.null,expiration_date.gt.${hoy}`)
          .order('manufacturer', { ascending: true });

        query = aplicarModo(query, modo);

        const { data, error } = await query;
        if (error) {
          errorFinal = error.message;
          if (/column|does not exist|schema cache/i.test(error.message)) {
            proyeccionValida = false;
            break;
          }
          continue;
        }
        intentosOk += 1;
        filas = (data as unknown as Record<string, unknown>[]) || [];
        if (filas.length > 0) break;
      }
      if (filas.length > 0) break;
    }
  }

  // Solo 500 si NINGUNA consulta pudo ejecutarse; si hubo consultas válidas
  // que simplemente no devolvieron filas, se responde con lista vacía.
  if (filas.length === 0 && intentosOk === 0) {
    return NextResponse.json(
      { error: handleSupabaseError(errorFinal ? { message: errorFinal } : null, 'inventario/disponible').mensaje },
      { status: 500 },
    );
  }

  const result = filas
    .filter((item) => !esFechaCaducada(item, hoy))
    .map((item) => ({
      id: item.id,
      marca:
        item.manufacturer !== undefined || item.product_name !== undefined
          ? (item.manufacturer as string) || (item.product_name as string) || '—'
          : (item.marca as string) || '—',
      modelo:
        item.manufacturer !== undefined || item.product_name !== undefined
          ? (item.model as string) || (item.product_name as string) || null
          : (item.modelo as string) || null,
      tipo_lio: (item.tipo_lio as string) ?? null,
      potencia_dioptrias:
        (item.potencia_dioptrias as number) ??
        (item.sphere != null ? (item.sphere as number) : null),
      lote: (item.lote as string) || (item.serial_number as string) || null,
      fecha_caducidad:
        (item.fecha_caducidad as string) || (item.expiration_date as string) || null,
      stock: item.stock,
    }));

  return NextResponse.json(result);
}
