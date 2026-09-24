import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import {
  CSV_BOM,
  formatFechaCsv,
  rangoPersonalizado,
} from '@/lib/rangos';
import { listarResumenHonorarios, type ResumenFila } from '@/lib/productividad';

type TabId = 'honorarios' | 'por_doctor' | 'cirugias' | 'entradas_salidas' | 'estudios' | 'pagos' | 'tarifas' | 'periodos' | 'sync';

const TABS: TabId[] = ['honorarios', 'por_doctor', 'cirugias', 'entradas_salidas', 'estudios', 'pagos', 'tarifas', 'periodos', 'sync'];

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
  tabs: TabId[]
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
      ? (async () => {
          let q = supabase
            .from('cirugia_productividad')
            .select(
              `id, cirugia_id, monto, estado, regla_id,
               participante:cirugia_participantes!inner(medico_id, doctores:medico_id(nombre_completo)),
               agenda:agenda_cirugias!inner(fecha, codigo, estado)
              `
            )
            .gte('agenda.fecha', desde)
            .lte('agenda.fecha', hasta)
            .neq('estado', 'ANULADO')
            .neq('agenda.estado', 'cancelada')
            .order('fecha', { referencedTable: 'agenda_cirugias', ascending: false })
            .limit(200);
          if (doctorId) {
            q = q.eq('participante.medico_id', doctorId);
          }
          const { data } = await q;
          return data || [];
        })()
      : Promise.resolve([]),
    need('entradas_salidas')
      ? (async () => {
          let q = supabase
            .from('consultas')
            .select(
              `id, folio, fecha, tipo_consulta, costo_total, monto_pagado, estatus_pago, estatus,
               pacientes:paciente_id(nombre_completo),
               doctores:doctor_id(nombre_completo)
              `
            )
            .gte('fecha', desde)
            .lte('fecha', hasta)
            .order('fecha', { ascending: false })
            .order('hora_inicio', { ascending: false })
            .limit(200);
          if (doctorId) q = q.eq('doctor_id', doctorId);
          const { data } = await q;
          return data || [];
        })()
      : Promise.resolve([]),
    need('estudios')
      ? (async () => {
          let q = supabase
            .from('consulta_conceptos')
            .select(
              `id, cantidad, precio_aplicado, texto_original, doctor_id, consulta_id,
               consulta:consultas!inner(fecha, folio, paciente_id,
                 pacientes:paciente_id(nombre_completo),
                 doctores:doctor_id(nombre_completo))
              `
            )
            .eq('tipo_concepto', 'ESTUDIO')
            .gte('consulta.fecha', desde)
            .lte('consulta.fecha', hasta)
            .order('fecha', { referencedTable: 'consultas', ascending: false })
            .limit(200);
          if (doctorId) q = q.eq('doctor_id', doctorId);
          const { data } = await q;
          return data || [];
        })()
      : Promise.resolve([]),
    needNombres
      ? supabase.from('doctores').select('id, nombre_completo').limit(500)
      : Promise.resolve({ data: [] as Array<{ id: string; nombre_completo: string }> }),
  ]);

  const nombres = new Map(
    (doctoresRes.data || []).map((d) => [d.id as string, d.nombre_completo as string])
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
      | { medico_id?: string; doctores?: { nombre_completo?: string } }
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
      doctor_nombre: part?.doctores?.nombre_completo || nombres.get(part?.medico_id || '') || '—',
      monto: toNumber(row.monto),
      estado: row.estado,
      estado_pago: estadoPago,
    };
  })
    : [];

  const entradasSalidas = need('entradas_salidas')
    ? (entradas as Array<Record<string, unknown>>).map((c) => ({
    id: c.id,
    folio: c.folio || null,
    fecha: c.fecha,
    tipo_consulta: c.tipo_consulta,
    paciente: ((c.pacientes as { nombre_completo?: string } | null)?.nombre_completo) || '',
    doctor: ((c.doctores as { nombre_completo?: string } | null)?.nombre_completo) || '',
    costo_total: toNumber(c.costo_total),
    monto_pagado: toNumber(c.monto_pagado),
    saldo: toNumber(c.costo_total) - toNumber(c.monto_pagado),
    estatus_pago: c.estatus_pago,
    estatus: c.estatus,
  }))
    : [];

  const estudiosTab = need('estudios')
    ? (estudios as Array<Record<string, unknown>>).map((row) => {
    const consulta = row.consulta as
      | {
          fecha?: string;
          folio?: string;
          pacientes?: { nombre_completo?: string };
          doctores?: { nombre_completo?: string };
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
        consulta?.doctores?.nombre_completo ||
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
        ['Fecha', 'Folio', 'Paciente', 'Doctor', 'Tipo', 'Costo', 'Pagado', 'Saldo', 'Estatus pago'],
        data.entradas_salidas.map((c) => [
          formatFechaCsv(String(c.fecha || '')),
          csvCell(c.folio as string | null),
          csvCell(c.paciente),
          csvCell(c.doctor),
          csvCell(c.tipo_consulta as string | null),
          toNumber(c.costo_total),
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

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const { desde, hasta } = rangoPersonalizado(
    searchParams.get('desde'),
    searchParams.get('hasta')
  );
  const doctorId = searchParams.get('doctor_id');
  const formato = (searchParams.get('formato') || 'json').toLowerCase();
  const tabRaw = searchParams.get('tab') || 'honorarios';
  const tab = (TABS.includes(tabRaw as TabId) ? tabRaw : 'honorarios') as TabId;

  if (desde > hasta) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (doctorId) {
    const { data: doc } = await supabase
      .from('doctores')
      .select('id')
      .eq('id', doctorId)
      .maybeSingle();
    if (!doc) {
      return NextResponse.json({ error: 'Doctor no encontrado' }, { status: 404 });
    }
  }

  try {
    const data = await cargarTabs(desde, hasta, doctorId, [tab]);
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
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set(
      'Server-Timing',
      `productividad;dur=${(performance.now() - startedAt).toFixed(1)}`
    );
    return response;
  }
}
