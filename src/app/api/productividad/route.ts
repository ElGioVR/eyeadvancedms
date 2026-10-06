import { NextResponse } from 'next/server';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { leerQuery } from '@/lib/api/validar';
import { leerTodo } from '@/lib/productividad/lotes';
import { fechaReal, uuidOpcional, validarRango } from '@/lib/productividad/validacion';
import { z } from 'zod';
import {
  CSV_BOM,
  formatFechaCsv,
  rangoPersonalizado,
} from '@/lib/rangos';
import { listarResumenHonorarios, type ResumenFila } from '@/lib/productividad';
import { ruta } from '@/lib/api/ruta';

type TabId = 'honorarios' | 'por_doctor' | 'cirugias' | 'entradas_salidas' | 'estudios' | 'pagos' | 'tarifas' | 'periodos' | 'sync';

const TABS: TabId[] = ['honorarios', 'por_doctor', 'cirugias', 'entradas_salidas', 'estudios', 'pagos', 'tarifas', 'periodos', 'sync'];

// Pantalla: primeras 200 filas por pestaña. CSV: todas (paginado en bloques de
// 1000 hasta este tope) — antes el CSV también se cortaba en 200 sin avisar.
const LIMITE_PANTALLA = 200;
const MAX_FILAS_CSV = 20000;

const querySchema = z.object({
  desde: fechaReal.optional(),
  hasta: fechaReal.optional(),
  doctor_id: uuidOpcional,
  formato: z.string().max(10).optional(),
  tab: z.string().max(40).optional(),
});

/** Lee `LIMITE_PANTALLA` filas o, para CSV, todas paginando con `.range()`. */
async function leerFilas<T>(
  construir: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  completo: boolean
): Promise<T[]> {
  if (completo) {
    return leerTodo<T>(
      (a, b) => construir(a, b) as PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
      MAX_FILAS_CSV
    );
  }
  // En pantalla, como antes, un fallo deja la pestaña vacía (el CSV sí falla).
  const { data, error } = await construir(0, LIMITE_PANTALLA - 1);
  if (error) console.error('[productividad] lectura de pestaña', error.message);
  return (data || []) as T[];
}

function sanitizeCsvCell(value: string | number | null | undefined): string {
  const raw = value == null ? '' : String(value);
  if (!raw) return '';
  if (/^[=+\-@\t\r\n]/.test(raw)) {
    return `'${raw.replace(/"/g, '""')}`;
  }
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function csvCell(v: string | number | null | undefined): string | number {
  return v == null ? '' : v;
}

function csvFrom(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [headers.map(sanitizeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map((cell) => sanitizeCsvCell(csvCell(cell))).join(','));
  }
  return CSV_BOM + lines.join('\r\n');
}

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function consolidarConsultas(filas: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const mapa = new Map<string, Record<string, unknown>>();
  for (const row of filas) {
    const id = String(row.id);
    const prev = mapa.get(id);
    if (!prev) {
      mapa.set(id, row);
      continue;
    }
    const previos = Array.isArray(prev.conceptos) ? (prev.conceptos as unknown[]) : [];
    const nuevos = Array.isArray(row.conceptos) ? (row.conceptos as unknown[]) : [];
    prev.conceptos = [...previos, ...nuevos];
  }
  return [...mapa.values()];
}

function calcularEdad(
  fechaNacimiento: string | null | undefined,
  fechaRef: string | null | undefined
): number | null {
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaNacimiento || '');
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaRef || '');
  if (!n || !r) return null;
  const ny = Number(n[1]);
  const nm = Number(n[2]);
  const nd = Number(n[3]);
  const ry = Number(r[1]);
  const rm = Number(r[2]);
  const rd = Number(r[3]);
  let edad = ry - ny;
  if (rm < nm || (rm === nm && rd < nd)) edad -= 1;
  return edad >= 0 ? edad : null;
}

function operadorDeConceptos(conceptos: unknown): number | null {
  if (!Array.isArray(conceptos)) return null;
  const total = conceptos.reduce((suma, raw) => {
    const c = raw as { tipo_concepto?: string; cantidad?: number | null };
    if (c?.tipo_concepto !== 'PROCEDIMIENTO') return suma;
    return suma + Math.max(1, toNumber(c.cantidad) || 1);
  }, 0);
  return total > 1 ? total : null;
}

function agruparPorDoctor(filas: ResumenFila[], nombres: Map<string, string>) {
  const map = new Map<
    string,
    {
      doctor_id: string;
      doctor_nombre: string;
      eventos: number;
      monto: number;
      pendiente: number;
      pagado: number;
      sin_config: number;
    }
  >();

  for (const f of filas) {
    const key = f.doctor_id;
    const row =
      map.get(key) ||
      {
        doctor_id: key,
        doctor_nombre: nombres.get(key) || '—',
        eventos: 0,
        monto: 0,
        pendiente: 0,
        pagado: 0,
        sin_config: 0,
      };
    row.eventos += 1;
    row.monto += toNumber(f.monto);
    if (f.estado_pago === 'PAGADO') row.pagado += toNumber(f.monto);
    else if (f.estado_pago === 'PENDIENTE_CONFIG') row.sin_config += 1;
    else row.pendiente += toNumber(f.monto);
    map.set(key, row);
  }

  return [...map.values()].sort((a, b) => b.monto - a.monto);
}

async function cargarTabs(
  desde: string,
  hasta: string,
  doctorId: string | null,
  tabs: TabId[],
  completo = false
) {
  const supabase = getSupabaseAdmin();
  const need = (t: TabId) => tabs.includes(t);
  const needResumen = need('honorarios') || need('por_doctor');
  const needNombres =
    needResumen || need('cirugias') || need('estudios') || need('entradas_salidas');

  const [resumen, cirugias, entradas, estudios, doctoresRes] = await Promise.all([
    needResumen
      ? listarResumenHonorarios({ desde, hasta, doctor_id: doctorId || undefined })
      : Promise.resolve([] as ResumenFila[]),
    need('cirugias')
      ? leerFilas<Record<string, unknown>>((a, b) => {
          let q = supabase
            .from('cirugia_productividad')
            .select(
              `id, cirugia_id, monto, estado, regla_id,
               participante:cirugia_participantes!inner(medico_id, doctores:medico_id(alias)),
               agenda:agenda_cirugias!inner(fecha, codigo, estado)
              `
            )
            .gte('agenda.fecha', desde)
            .lte('agenda.fecha', hasta)
            .neq('estado', 'ANULADO')
            .neq('agenda.estado', 'cancelada')
            .order('fecha', { referencedTable: 'agenda_cirugias', ascending: false })
            .order('id', { ascending: true });
          if (doctorId) {
            q = q.eq('participante.medico_id', doctorId);
          }
          return q.range(a, b);
        }, completo)
      : Promise.resolve([]),
    need('entradas_salidas')
      ? leerFilas<Record<string, unknown>>((a, b) => {
          let q = supabase
            .from('consultas')
            .select(
              `id, folio, fecha, hora_inicio, hora_fin, tipo_consulta, tipo_visita, diagnostico,
               estudio_1, estudio_2, estudio_3, procedimiento, metodo_pago, moneda,
               costo_total, monto_pagado, estatus_pago, estatus, aseguranza_id,
               pacientes:paciente_id(nombre_completo, telefono, sexo, fecha_nacimiento, edad),
               doctores:doctor_id(alias),
               aseguranza:aseguranza_id(nombre),
               conceptos:consulta_conceptos(tipo_concepto, cantidad)
              `
            )
            .gte('fecha', desde)
            .lte('fecha', hasta)
            .order('fecha', { ascending: false })
            .order('hora_inicio', { ascending: false })
            .order('id', { ascending: true });
          if (doctorId) q = q.eq('doctor_id', doctorId);
          return q.range(a, b);
        }, completo).then(consolidarConsultas)
      : Promise.resolve([]),
    need('estudios')
      ? leerFilas<Record<string, unknown>>((a, b) => {
          let q = supabase
            .from('consulta_conceptos')
            .select(
              `id, cantidad, precio_aplicado, texto_original, doctor_id, consulta_id,
               consulta:consultas!inner(fecha, folio, paciente_id,
                 pacientes:paciente_id(nombre_completo),
                 doctores:doctor_id(alias))
              `
            )
            .eq('tipo_concepto', 'ESTUDIO')
            .gte('consulta.fecha', desde)
            .lte('consulta.fecha', hasta)
            .order('fecha', { referencedTable: 'consultas', ascending: false })
            .order('id', { ascending: true });
          if (doctorId) q = q.eq('doctor_id', doctorId);
          return q.range(a, b);
        }, completo)
      : Promise.resolve([]),
    needNombres
      ? supabase.from('doctores').select('id, alias').order('id').limit(1000)
      : Promise.resolve({ data: [] as Array<{ id: string; alias: string }> }),
  ]);

  const nombres = new Map(
    (doctoresRes.data || []).map((d) => [d.id as string, d.alias as string])
  );

  const honorarios = need('honorarios')
    ? resumen.map((f) => ({
        ...f,
        doctor_nombre: nombres.get(f.doctor_id) || '—',
      }))
    : [];

  const cirugiasTab = need('cirugias')
    ? (cirugias as Array<Record<string, unknown>>).map((row) => {
    const part = row.participante as
      | { medico_id?: string; doctores?: { alias?: string } }
      | null;
    const agenda = row.agenda as { fecha?: string; codigo?: string } | null;
    const estadoPago =
      row.regla_id == null || row.monto == null
        ? 'PENDIENTE_CONFIG'
        : row.estado === 'PAGADO'
          ? 'PAGADO'
          : 'POR_PAGAR';
    return {
      id: row.id,
      cirugia_id: row.cirugia_id,
      codigo: agenda?.codigo || null,
      fecha: agenda?.fecha || null,
      doctor_id: part?.medico_id || null,
      doctor_nombre: part?.doctores?.alias || nombres.get(part?.medico_id || '') || '—',
      monto: toNumber(row.monto),
      estado: row.estado,
      estado_pago: estadoPago,
    };
  })
    : [];

  const entradasSalidas = need('entradas_salidas')
    ? (entradas as Array<Record<string, unknown>>).map((c) => {
        const pac = c.pacientes as
          | {
              nombre_completo?: string;
              telefono?: string | null;
              sexo?: string | null;
              fecha_nacimiento?: string | null;
              edad?: number | null;
            }
          | null;
        const doc = c.doctores as { alias?: string } | null;
        const aseg = c.aseguranza as { nombre?: string } | null;
        const edadCalc = calcularEdad(pac?.fecha_nacimiento, c.fecha as string | null);
        return {
          id: c.id,
          folio: c.folio || null,
          fecha: c.fecha,
          hora_inicio: (c.hora_inicio as string | null) || null,
          hora_fin: (c.hora_fin as string | null) || null,
          tipo_consulta: c.tipo_consulta,
          tipo_visita: (c.tipo_visita as string | null) || null,
          diagnostico: (c.diagnostico as string | null) || null,
          estudio_1: (c.estudio_1 as string | null) || null,
          estudio_2: (c.estudio_2 as string | null) || null,
          estudio_3: (c.estudio_3 as string | null) || null,
          procedimiento: (c.procedimiento as string | null) || null,
          operador: operadorDeConceptos(c.conceptos),
          paciente: pac?.nombre_completo || '',
          telefono: pac?.telefono || null,
          sexo: pac?.sexo || null,
          fecha_nacimiento: pac?.fecha_nacimiento || null,
          edad: edadCalc ?? pac?.edad ?? null,
          doctor: doc?.alias || '',
          aseguranza: aseg?.nombre || null,
          metodo_pago: (c.metodo_pago as string | null) || null,
          moneda: (c.moneda as string | null) || null,
          costo_total: toNumber(c.costo_total),
          monto_pagado: toNumber(c.monto_pagado),
          saldo: toNumber(c.costo_total) - toNumber(c.monto_pagado),
          estatus_pago: c.estatus_pago,
          estatus: c.estatus,
        };
      })
    : [];

  const estudiosTab = need('estudios')
    ? (estudios as Array<Record<string, unknown>>).map((row) => {
    const consulta = row.consulta as
      | {
          fecha?: string;
          folio?: string;
          pacientes?: { nombre_completo?: string };
          doctores?: { alias?: string };
        }
      | null;
    const cantidad = Math.max(1, toNumber(row.cantidad) || 1);
    const unit = toNumber(row.precio_aplicado);
    return {
      id: row.id,
      consulta_id: row.consulta_id,
      fecha: consulta?.fecha || null,
      folio: consulta?.folio || null,
      paciente: consulta?.pacientes?.nombre_completo || '',
      doctor:
        consulta?.doctores?.alias ||
        nombres.get(typeof row.doctor_id === 'string' ? row.doctor_id : '') ||
        '',
      concepto: typeof row.texto_original === 'string' ? row.texto_original : 'Estudio',
      cantidad,
      precio_unitario: unit,
      total: unit * cantidad,
    };
  })
    : [];

  const porDoctor = need('por_doctor') ? agruparPorDoctor(resumen, nombres) : [];

  const totales = {
    honorarios_monto: honorarios.reduce((s, f) => s + toNumber(f.monto), 0),
    honorarios_eventos: honorarios.length,
    por_pagar: honorarios
      .filter((f) => f.estado_pago === 'POR_PAGAR')
      .reduce((s, f) => s + toNumber(f.monto), 0),
    pagado: honorarios
      .filter((f) => f.estado_pago === 'PAGADO')
      .reduce((s, f) => s + toNumber(f.monto), 0),
    pendiente_config: honorarios.filter((f) => f.estado_pago === 'PENDIENTE_CONFIG').length,
    cirugias_monto: cirugiasTab.reduce((s, c) => s + c.monto, 0),
    entradas_costo: entradasSalidas.reduce((s, c) => s + c.costo_total, 0),
    entradas_pagado: entradasSalidas.reduce((s, c) => s + c.monto_pagado, 0),
    estudios_total: estudiosTab.reduce((s, e) => s + e.total, 0),
    estudios_cantidad: estudiosTab.reduce((s, e) => s + e.cantidad, 0),
  };

  return {
    honorarios,
    por_doctor: porDoctor,
    cirugias: cirugiasTab,
    entradas_salidas: entradasSalidas,
    estudios: estudiosTab,
    totales,
  };
}

type ProductividadData = Awaited<ReturnType<typeof cargarTabs>>;

function csvParaTab(tab: TabId, data: ProductividadData): string {
  switch (tab) {
    case 'por_doctor':
      return csvFrom(
        ['Doctor', 'Eventos', 'Monto', 'Por pagar', 'Pagado', 'Sin configurar'],
        data.por_doctor.map((d) => [
          csvCell(d.doctor_nombre),
          d.eventos,
          d.monto,
          d.pendiente,
          d.pagado,
          d.sin_config,
        ])
      );
    case 'cirugias':
      return csvFrom(
        ['Código', 'Fecha', 'Doctor', 'Monto', 'Estado', 'Estado pago'],
        data.cirugias.map((c) => [
          csvCell(c.codigo as string | null),
          formatFechaCsv(String(c.fecha || '')),
          csvCell(c.doctor_nombre),
          toNumber(c.monto),
          csvCell(c.estado as string),
          csvCell(c.estado_pago as string),
        ])
      );
    case 'entradas_salidas':
      return csvFrom(
        [
          'FECHA',
          'HORA DE INGRESO',
          'HORA DE EGRESO',
          'NUMERO DE TELEFONO',
          'DOCTOR',
          'NOMBRE DE PACIENTE',
          'SEXO',
          'FECHA DE NACIMIENTO',
          'EDAD',
          'CONSULTA',
          'DIAGNOSTICO',
          'TIPO DE CONSULTA',
          'ESTUDIO 1',
          'ESTUDIO 2',
          'ESTUDIO 3',
          'OPERADOR',
          'PROCEDIMIENTO',
          'ASEGURANZA',
          'METODO DE PAGO',
          'COSTO CONSULTA',
          'TIPO DE MONEDA',
          'FOLIO',
          'PAGADO',
          'SALDO',
          'ESTATUS PAGO',
        ],
        data.entradas_salidas.map((c) => [
          formatFechaCsv(String(c.fecha || '')),
          csvCell(typeof c.hora_inicio === 'string' ? c.hora_inicio.slice(0, 5) : null),
          csvCell(typeof c.hora_fin === 'string' ? c.hora_fin.slice(0, 5) : null),
          csvCell(c.telefono as string | null),
          csvCell(c.doctor),
          csvCell(c.paciente),
          csvCell(c.sexo as string | null),
          c.fecha_nacimiento ? formatFechaCsv(String(c.fecha_nacimiento)) : '',
          c.edad == null ? '' : toNumber(c.edad),
          csvCell(c.tipo_consulta as string | null),
          csvCell(c.diagnostico as string | null),
          csvCell(c.tipo_visita as string | null),
          csvCell(c.estudio_1 as string | null),
          csvCell(c.estudio_2 as string | null),
          csvCell(c.estudio_3 as string | null),
          c.operador == null ? '' : toNumber(c.operador),
          csvCell(c.procedimiento as string | null),
          csvCell(c.aseguranza as string | null),
          csvCell(c.metodo_pago as string | null),
          toNumber(c.costo_total),
          csvCell(c.moneda as string | null),
          csvCell(c.folio as string | null),
          toNumber(c.monto_pagado),
          toNumber(c.saldo),
          csvCell(c.estatus_pago as string | null),
        ])
      );
    case 'estudios':
      return csvFrom(
        ['Fecha', 'Folio', 'Paciente', 'Doctor', 'Estudio', 'Cantidad', 'Precio unit.', 'Total'],
        data.estudios.map((e) => [
          formatFechaCsv(String(e.fecha || '')),
          csvCell(e.folio as string | null),
          csvCell(e.paciente),
          csvCell(e.doctor),
          csvCell(e.concepto),
          toNumber(e.cantidad),
          toNumber(e.precio_unitario),
          toNumber(e.total),
        ])
      );
    case 'honorarios':
    default:
      return csvFrom(
        ['Fecha', 'Doctor', 'Fuente', 'Origen', 'Monto', 'Estado pago'],
        data.honorarios.map((f) => [
          formatFechaCsv(String(f.fecha || '')),
          csvCell(f.doctor_nombre),
          csvCell(f.fuente),
          csvCell(f.origen),
          toNumber(f.monto),
          csvCell(f.estado_pago),
        ])
      );
  }
}

async function manejarGET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  // requireRole ya no cuesta un viaje extra (perfil cacheado): se espera antes
  // de leer para no gastar BD en usuarios sin permiso.
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const q = leerQuery(request, querySchema);
  if (q instanceof NextResponse) return q;
  const { desde, hasta } = rangoPersonalizado(q.desde, q.hasta);
  const doctorId = q.doctor_id ?? null;
  const formato = (q.formato || 'json').toLowerCase();
  const tabRaw = q.tab || 'honorarios';
  const tab = (TABS.includes(tabRaw as TabId) ? tabRaw : 'honorarios') as TabId;

  const rangoError = validarRango(desde, hasta);
  if (rangoError) return rangoError;

  const supabase = getSupabaseAdmin();

  try {
    // Validación del doctor y carga de la pestaña en paralelo.
    const [{ data: doc }, data] = await Promise.all([
      doctorId
        ? Promise.resolve(supabase.from('doctores').select('id').eq('id', doctorId).maybeSingle())
        : Promise.resolve({ data: { id: '' } }),
      cargarTabs(desde, hasta, doctorId, [tab], formato === 'csv'),
    ]);
    if (!doc) {
      return NextResponse.json({ error: 'Doctor no encontrado' }, { status: 404 });
    }
    const dur = (performance.now() - startedAt).toFixed(1);

    if (formato === 'csv') {
      const csv = csvParaTab(tab, data);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="productividad-${tab}-${desde}_${hasta}.csv"`,
          'Server-Timing': `productividad;dur=${dur}`,
        },
      });
    }

    const response = NextResponse.json({
      rango: { desde, hasta },
      doctor_id: doctorId,
      tab,
      ...data,
    });
    response.headers.set('Server-Timing', `productividad;dur=${dur}`);
    return response;
  } catch (err) {
    const message = mensajeSeguro(err, 'productividad', 'Error interno del servidor');
    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set(
      'Server-Timing',
      `productividad;dur=${(performance.now() - startedAt).toFixed(1)}`
    );
    return response;
  }
}

export const GET = ruta('productividad#GET', manejarGET);
