import { NextResponse } from 'next/server';
import { faltantesPaciente } from '@/lib/import-agenda';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { handleSupabaseError } from '@/lib/supabase/handle-error';
import { esquemaPaginacion, fechaISO, leerJSON, leerQuery, uuid } from '@/lib/api/validar';
import { sanitizarBusqueda } from '@/lib/text';
import { z } from 'zod';
import { hoyTijuana } from '@/lib/rangos';
import { columnasTelefonos, faltanColumnasTelefonos, telefonosSchema } from '@/lib/telefonos-paciente-db';
import { ruta } from '@/lib/api/ruta';
import { idempotente } from '@/lib/api/idempotencia';

const pacienteCreateSchema = z
  .object({
    nombre_completo: z.string().trim().min(1).max(255).optional(),
    nombre: z.string().trim().min(1).max(255).optional(),
    sexo: z.enum(['H', 'M', 'MASCULINO', 'FEMENINO', 'OTRO']).optional(),
    fecha_nacimiento: fechaISO.optional(),
    edad: z.number().int().min(0).max(150).optional(),
    telefono: z.string().max(20).optional(),
    telefonos: telefonosSchema.optional(),
    email: z.string().email().max(255).optional(),
    direccion: z.string().max(1000).optional(),
    contacto_emergencia: z.string().max(255).optional(),
    tel_emergencia: z.string().max(20).optional(),
    aseguranza_id: uuid.optional().nullable(),
    numero_poliza: z.string().max(100).optional().nullable(),
    numero_afiliacion: z.string().max(100).optional().nullable(),
    numero_expediente: z.string().trim().max(50).optional().nullable(),
  })
  .strict()
  .refine((data) => data.nombre_completo || data.nombre, {
    message: 'El nombre del paciente es obligatorio',
  });

const listadoQuerySchema = z.object({
  ...esquemaPaginacion(15, 100),
  // Búsqueda opcional por nombre / teléfono / email (se sanea antes de ir a PostgREST)
  search: z.string().max(100).optional(),
});

const COLUMNAS_PACIENTE =
  'id, nombre_completo, sexo, fecha_nacimiento, edad, telefono, email, direccion, contacto_emergencia, tel_emergencia, aseguranza_id, numero_poliza, numero_afiliacion, numero_expediente, created_at';

interface PacienteFila {
  id: string;
  nombre_completo: string | null;
  sexo: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  contacto_emergencia: string | null;
  tel_emergencia: string | null;
  aseguranza_id: string | null;
  numero_poliza: string | null;
  numero_afiliacion: string | null;
  numero_expediente: string | null;
  created_at: string;
}

type Embed<T> = T | T[] | null | undefined;
function primero<T>(v: Embed<T>): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

type Enriquecido = PacienteFila & {
  aseguradora: string | null;
  consultas_count: number;
  ultima_visita: string | null;
};

function filaRespuesta(p: Enriquecido, pendiente: boolean) {
  const nombre = p.nombre_completo || '';
  const iniciales = nombre
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return {
    id: p.id,
    nombre: p.nombre_completo,
    nombre_completo: p.nombre_completo,
    iniciales,
    sexo: p.sexo === 'MASCULINO' ? 'H' : 'M',
    fecha_nacimiento: p.fecha_nacimiento,
    edad: p.edad,
    telefono: p.telefono,
    email: p.email,
    direccion: p.direccion,
    contacto_emergencia: p.contacto_emergencia,
    tel_emergencia: p.tel_emergencia,
    aseguranza_id: p.aseguranza_id || null,
    aseguradora: p.aseguranza_id ? p.aseguradora : null,
    numero_poliza: p.numero_poliza || null,
    numero_afiliacion: p.numero_afiliacion || null,
    numero_expediente: p.numero_expediente || null,
    consultas_count: p.consultas_count || 0,
    ultima_visita: p.ultima_visita || null,
    pendiente_completar: pendiente,
    faltantes: pendiente ? faltantesPaciente(p) : [],
    created_at: p.created_at,
  };
}

/**
 * Columnas resumen `pacientes.consultas_count` / `ultima_visita` (migración
 * de performance 1800000000480, mantenidas por trigger). Si aún no existen,
 * se usa el camino anterior (subconsultas embebidas) y se reintenta en 5 min.
 */
let resumenNoDisponibleHasta = 0;
const REINTENTO_RESUMEN_MS = 5 * 60_000;

async function manejarGET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista', 'enfermero']);
  if (roleError) return roleError;

  const query = leerQuery(request, listadoQuerySchema);
  if (query instanceof NextResponse) return query;
  const { page, pageSize } = query;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const busqueda = query.search ? sanitizarBusqueda(query.search) : '';
  const patron = busqueda ? `%${busqueda}%` : '';

  const supabase = getSupabaseAdmin();
  const digitosBusqueda = busqueda.replace(/\D/g, '');
  const filtroBusqueda = patron
    ? `nombre_completo.ilike.${patron},telefono.ilike.${patron},email.ilike.${patron},numero_expediente.ilike.${patron}` +
      (digitosBusqueda.length >= 4 ? `,telefonos_busqueda.ilike.%${digitosBusqueda}%` : '')
    : '';

  // Camino rápido: resumen precalculado → 1 consulta simple por página, sin
  // subconsultas por fila ni segundo viaje para «pendiente de completar».
  if (Date.now() >= resumenNoDisponibleHasta) {
    let q = supabase
      .from('pacientes')
      .select(`${COLUMNAS_PACIENTE}, consultas_count, ultima_visita, pendiente_completar, aseguranzas:aseguranza_id (nombre, activo)`, {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (filtroBusqueda) q = q.or(filtroBusqueda);
    const r = await q;
    if (!r.error) {
      const filasRapidas = (r.data as unknown as Array<
        PacienteFila & {
          consultas_count: number | null;
          ultima_visita: string | null;
          pendiente_completar: boolean | null;
          aseguranzas: Embed<{ nombre: string | null; activo: boolean | null }>;
        }
      >).map((p) => {
        const aseg = primero(p.aseguranzas);
        const fila: Enriquecido = {
          ...p,
          aseguradora: aseg && aseg.activo ? aseg.nombre ?? null : null,
          consultas_count: p.consultas_count ?? 0,
          ultima_visita: p.ultima_visita ?? null,
        };
        return filaRespuesta(fila, p.pendiente_completar === true);
      });
      return NextResponse.json({ data: filasRapidas, total: r.count || 0, page, pageSize });
    }
    // Columna inexistente (migración sin aplicar): desactivar el camino rápido un rato.
    if (r.error.code === '42703' || r.error.code === 'PGRST204' || /column|does not exist/i.test(r.error.message)) {
      resumenNoDisponibleHasta = Date.now() + REINTENTO_RESUMEN_MS;
    } else {
      handleSupabaseError(r.error, 'pacientes.listar.rapido');
    }
  }

  // Un solo viaje: pacientes + nombre de la aseguranza + conteo de consultas
  // + fecha de la última consulta (limitada a 1 fila por paciente).
  let consulta = supabase
    .from('pacientes')
    .select(
      `${COLUMNAS_PACIENTE},
      aseguranzas:aseguranza_id (nombre, activo),
      consultas_count:consultas (count),
      ultima:consultas (fecha)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .order('fecha', { referencedTable: 'ultima', ascending: false })
    // Última visita = la consulta más reciente hasta hoy (no citas futuras ni canceladas).
    .lte('ultima.fecha', hoyTijuana())
    .neq('ultima.estatus', 'CANCELADA')
    .limit(1, { referencedTable: 'ultima' })
    .range(from, to);
  if (patron) {
    // Teléfonos adicionales (mig. 1800000000470); si la columna no existe,
    // el respaldo de abajo repite la búsqueda sin ella.
    const digitos = busqueda.replace(/\D/g, '');
    const extra = digitos.length >= 4 ? `,telefonos_busqueda.ilike.%${digitos}%` : '';
    consulta = consulta.or(`nombre_completo.ilike.${patron},telefono.ilike.${patron},email.ilike.${patron},numero_expediente.ilike.${patron}${extra}`);
  }

  const { data, error, count } = await consulta;

  let filas: Enriquecido[];
  let total = count || 0;

  if (!error) {
    filas = (data as unknown as Array<
      PacienteFila & {
        aseguranzas: Embed<{ nombre: string | null; activo: boolean | null }>;
        consultas_count: Embed<{ count: number }>;
        ultima: Embed<{ fecha: string | null }>;
      }
    >).map((p) => {
      const aseg = primero(p.aseguranzas);
      return {
        ...p,
        // Igual que antes: solo se muestra el nombre si la aseguranza está activa
        aseguradora: aseg && aseg.activo ? aseg.nombre ?? null : null,
        consultas_count: primero(p.consultas_count)?.count ?? 0,
        ultima_visita: primero(p.ultima)?.fecha ?? null,
      };
    });
  } else {
    // Respaldo si el servidor PostgREST no admite el conteo embebido:
    // mismo resultado con consultas acotadas a los pacientes de la página.
    handleSupabaseError(error, 'pacientes.listar.embed');
    let base = supabase
      .from('pacientes')
      .select(COLUMNAS_PACIENTE, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (patron) {
      base = base.or(`nombre_completo.ilike.${patron},telefono.ilike.${patron},email.ilike.${patron}`);
    }
    const r = await base;
    if (r.error) {
      return NextResponse.json({ error: handleSupabaseError(r.error, 'pacientes.listar').mensaje }, { status: 500 });
    }
    const pacientes = (r.data || []) as PacienteFila[];
    total = r.count || 0;
    const ids = pacientes.map((p) => p.id);
    const asegIds = [...new Set(pacientes.map((p) => p.aseguranza_id).filter((v): v is string => !!v))];
    const [consultasRes, asegRes] = await Promise.all([
      ids.length
        ? supabase.from('consultas').select('paciente_id, fecha, estatus').in('paciente_id', ids)
        : Promise.resolve({ data: [] as Array<{ paciente_id: string; fecha: string }> }),
      asegIds.length
        ? supabase.from('aseguranzas').select('id, nombre').in('id', asegIds).eq('activo', true)
        : Promise.resolve({ data: [] as Array<{ id: string; nombre: string }> }),
    ]);
    const asegMap = new Map((asegRes.data || []).map((a) => [a.id, a.nombre]));
    const cMap = new Map<string, { count: number; ultima: string }>();
    const hoy = hoyTijuana();
    for (const c of consultasRes.data || []) {
      const e = cMap.get(c.paciente_id) || { count: 0, ultima: '' };
      e.count++;
      if (c.fecha > e.ultima && c.fecha <= hoy && (c as { estatus?: string }).estatus !== 'CANCELADA') e.ultima = c.fecha;
      cMap.set(c.paciente_id, e);
    }
    filas = pacientes.map((p) => ({
      ...p,
      aseguradora: p.aseguranza_id ? asegMap.get(p.aseguranza_id) || null : null,
      consultas_count: cMap.get(p.id)?.count || 0,
      ultima_visita: cMap.get(p.id)?.ultima || null,
    }));
  }

  // Altas automáticas (importación) con datos por completar (mig. 400; sin ella, ninguna).
  const pendientes = new Set<string>();
  if (filas.length) {
    const r = await supabase.from('pacientes').select('id').in('id', filas.map((p) => p.id)).eq('pendiente_completar', true);
    if (!r.error) for (const x of r.data || []) pendientes.add((x as { id: string }).id);
  }

  const result = filas.map((p) => filaRespuesta(p, pendientes.has(p.id)));

  return NextResponse.json({ data: result, total, page, pageSize });
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin', 'doctor', 'recepcionista']);
  if (roleError) return roleError;

  const data = await leerJSON(request, pacienteCreateSchema, { maxBytes: 20_000 });
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();

  // La fecha de nacimiento es opcional (migración 1800000000440): sin dato se
  // guarda NULL, ya no la fecha ficticia 2000-01-01.
  const insertData: Record<string, unknown> = {
    nombre_completo: data.nombre_completo || data.nombre,
    sexo: 'MASCULINO',
    fecha_nacimiento: null,
  };

  if (data.sexo) {
    insertData.sexo = data.sexo === 'H' ? 'MASCULINO' : data.sexo === 'M' ? 'FEMENINO' : data.sexo;
  }
  if (data.fecha_nacimiento) insertData.fecha_nacimiento = data.fecha_nacimiento;
  if (data.edad !== undefined) insertData.edad = data.edad;
  if (data.telefono) insertData.telefono = data.telefono;
  if (data.email) insertData.email = data.email;
  if (data.direccion) insertData.direccion = data.direccion;
  if (data.contacto_emergencia) insertData.contacto_emergencia = data.contacto_emergencia;
  if (data.tel_emergencia) insertData.tel_emergencia = data.tel_emergencia;
  if (data.aseguranza_id) insertData.aseguranza_id = data.aseguranza_id;
  if (data.numero_poliza) insertData.numero_poliza = data.numero_poliza;
  if (data.numero_afiliacion) insertData.numero_afiliacion = data.numero_afiliacion;
  if (data.numero_expediente) insertData.numero_expediente = data.numero_expediente;
  if (data.telefonos) Object.assign(insertData, columnasTelefonos(data.telefonos));

  const insertar = (fila: Record<string, unknown>) => supabase
    .from('pacientes')
    .insert(fila)
    .select('id, nombre_completo, sexo, fecha_nacimiento, edad, telefono, email, direccion, aseguranza_id, numero_poliza, numero_afiliacion, numero_expediente, created_at')
    .single();
  let { data: paciente, error } = await insertar(insertData);
  // BD sin las columnas de teléfonos (mig. 1800000000470): se guarda solo el principal.
  if (error && faltanColumnasTelefonos(error)) {
    const { telefonos: _t, telefonos_busqueda: _b, ...sinLista } = insertData;
    ({ data: paciente, error } = await insertar(sinLista));
  }

  if (error || !paciente) {
    if (error?.code === '23505' && /numero_expediente/.test(`${error.message} ${error.details ?? ''}`)) {
      return NextResponse.json({ error: `Ya existe un paciente con el número de expediente ${data.numero_expediente}` }, { status: 409 });
    }
    return NextResponse.json({ error: handleSupabaseError(error, 'pacientes.crear').mensaje }, { status: 500 });
  }

  return NextResponse.json({
    id: paciente.id,
    nombre: paciente.nombre_completo,
    nombre_completo: paciente.nombre_completo,
    sexo: paciente.sexo === 'MASCULINO' ? 'H' : 'M',
    fecha_nacimiento: paciente.fecha_nacimiento,
    edad: paciente.edad,
    telefono: paciente.telefono,
    email: paciente.email,
    direccion: paciente.direccion,
    aseguranza_id: paciente.aseguranza_id || null,
    numero_poliza: paciente.numero_poliza || null,
    numero_afiliacion: paciente.numero_afiliacion || null,
    numero_expediente: paciente.numero_expediente || null,
    created_at: paciente.created_at,
  }, { status: 201 });
}

export const GET = ruta('pacientes#GET', manejarGET);
export const POST = ruta('pacientes#POST', idempotente('pacientes#POST', manejarPOST));
