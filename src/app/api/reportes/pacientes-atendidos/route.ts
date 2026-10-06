import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { CSV_BOM, rangoPersonalizado } from '@/lib/rangos';
import { leerQuery } from '@/lib/api/validar';
import { fechaReal, uuidOpcional, validarRango } from '@/lib/productividad/validacion';
import { edadDetallada, sexoLegible } from '@/lib/ficha-paciente';
import { etiquetaTipoConsulta } from '@/lib/catalogos/tipos-consulta';
import { ruta } from '@/lib/api/ruta';
import { exigirLimite } from '@/lib/api/limites';

/**
 * GET /api/reportes/pacientes-atendidos?desde&hasta&doctor_id
 * Pacientes atendidos en el periodo (consultas y estudios no cancelados):
 * un renglón por servicio (consulta, estudio, procedimiento) con diagnóstico,
 * quién lo indicó y quién lo realizó. Sin montos: lo descargan admin,
 * recepción y doctores.
 */
export const maxDuration = 60;

const querySchema = z.object({
  desde: fechaReal.optional(),
  hasta: fechaReal.optional(),
  doctor_id: uuidOpcional,
  formato: z.string().max(10).optional(),
});

const PAGE_SIZE = 1000;
const MAX_FILAS = 10000;

const ENCABEZADOS = [
  'FECHA', 'HORA', 'PACIENTE', 'EXPEDIENTE', 'SEXO', 'EDAD', 'TELEFONO',
  'MEDICO DE LA CONSULTA', 'TIPO DE CONSULTA', 'ESPECIALIDAD', 'DIAGNOSTICO',
  'CONCEPTO', 'SERVICIO', 'OJO', 'INDICADO POR', 'REALIZADO POR', 'ESTATUS', 'FOLIO',
];

type Alias = { id?: string | null; alias?: string | null } | null;
interface Concepto {
  tipo_concepto: string;
  texto_original: string | null;
  ojo: string | null;
  doctor_id: string | null;
  indicado_por_id?: string | null;
  realizado: Alias;
  indicado?: Alias;
}
interface FilaConsulta {
  id: string;
  folio: string | null;
  fecha: string;
  hora_inicio: string | null;
  tipo_consulta: string | null;
  tipo_visita: string | null;
  diagnostico: string | null;
  estatus: string | null;
  doctor_id: string | null;
  estudio_1: string | null; estudio_2: string | null; estudio_3: string | null;
  estudio_1_doctor_id: string | null; estudio_2_doctor_id: string | null; estudio_3_doctor_id: string | null;
  procedimiento: string | null;
  procedimiento_doctor_id: string | null;
  doctores: Alias;
  especialidad: { nombre?: string | null } | null;
  pacientes: { nombre_completo?: string | null; numero_expediente?: string | null; sexo?: string | null; fecha_nacimiento?: string | null; edad?: number | null; telefono?: string | null } | null;
  e1: Alias; e2: Alias; e3: Alias; pd: Alias;
  conceptos: Concepto[] | null;
}

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function celda(v: string | number | null | undefined): string {
  const raw = v == null ? '' : String(v);
  if (!raw) return '';
  if (/^[=+\-@\t\r\n]/.test(raw)) return `'${raw.replace(/"/g, '""')}`;
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

const SELECT_BASE = `
  id, folio, fecha, hora_inicio, tipo_consulta, tipo_visita, diagnostico, estatus, doctor_id,
  estudio_1, estudio_2, estudio_3, estudio_1_doctor_id, estudio_2_doctor_id, estudio_3_doctor_id,
  procedimiento, procedimiento_doctor_id,
  doctores:doctor_id (id, alias),
  especialidad:especialidad_id (nombre),
  pacientes:paciente_id (nombre_completo, numero_expediente, sexo, fecha_nacimiento, edad, telefono),
  e1:estudio_1_doctor_id (id, alias), e2:estudio_2_doctor_id (id, alias), e3:estudio_3_doctor_id (id, alias),
  pd:procedimiento_doctor_id (id, alias),`;
const CONCEPTOS_CON_INDICADO = `conceptos:consulta_conceptos (tipo_concepto, texto_original, ojo, doctor_id, indicado_por_id, realizado:doctor_id (id, alias), indicado:indicado_por_id (id, alias))`;
const CONCEPTOS_SIN_INDICADO = `conceptos:consulta_conceptos (tipo_concepto, texto_original, ojo, doctor_id, realizado:doctor_id (id, alias))`;

async function manejarGET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const limite = await exigirLimite('reporte', auth.user.id);
  if (limite) return limite;
  const roleError = await requireRole(auth.user, ['admin', 'recepcionista', 'doctor']);
  if (roleError) return roleError;

  const q = leerQuery(request, querySchema);
  if (q instanceof NextResponse) return q;
  const { desde, hasta } = rangoPersonalizado(q.desde, q.hasta);
  const rangoError = validarRango(desde, hasta);
  if (rangoError) return rangoError;
  const doctorId = q.doctor_id ?? null;

  try {
    const supabase = getSupabaseAdmin();
    const leer = async (conceptos: string) => {
      const filas: FilaConsulta[] = [];
      for (let desdeFila = 0; desdeFila < MAX_FILAS; desdeFila += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('consultas')
          .select(SELECT_BASE + conceptos)
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .neq('estatus', 'CANCELADA')
          .order('fecha', { ascending: true })
          .order('hora_inicio', { ascending: true })
          .order('id', { ascending: true })
          .range(desdeFila, desdeFila + PAGE_SIZE - 1);
        if (error) throw error;
        filas.push(...((data ?? []) as unknown as FilaConsulta[]));
        if (!data || data.length < PAGE_SIZE) break;
      }
      return filas;
    };
    let consultas: FilaConsulta[];
    try {
      consultas = await leer(CONCEPTOS_CON_INDICADO);
    } catch (err) {
      // BD sin la columna indicado_por_id (mig. 1800000000460): se reporta sin ella.
      if (!/indicado_por_id/.test(String((err as { message?: string })?.message))) throw err;
      consultas = await leer(CONCEPTOS_SIN_INDICADO);
    }

    const renglones: Array<Array<string | number | null>> = [];
    for (const c of consultas) {
      const pac = uno(c.pacientes);
      const medico = uno(c.doctores);
      const edad = edadDetallada(pac?.fecha_nacimiento, c.fecha)?.anios ?? pac?.edad ?? null;
      const tipoLabel = etiquetaTipoConsulta(c.tipo_consulta, c.tipo_visita);
      const base = [
        c.fecha, c.hora_inicio ? c.hora_inicio.slice(0, 5) : '', pac?.nombre_completo || '',
        pac?.numero_expediente || '', sexoLegible(pac?.sexo) || '', edad, pac?.telefono || '',
        medico?.alias || '', tipoLabel, uno(c.especialidad)?.nombre || '', c.diagnostico || '',
      ];
      const fin = [c.estatus || '', c.folio || ''];

      const conceptos = (c.conceptos || []).filter((x) => x.tipo_concepto === 'ESTUDIO' || x.tipo_concepto === 'PROCEDIMIENTO');
      type Servicio = { concepto: string; nombre: string; ojo: string | null; indicado: Alias; realizado: Alias };
      let servicios: Servicio[] = conceptos.map((x) => ({
        concepto: x.tipo_concepto === 'ESTUDIO' ? 'Estudio' : 'Procedimiento',
        nombre: x.texto_original || '',
        ojo: x.ojo,
        indicado: uno(x.indicado ?? null) ?? medico,
        realizado: uno(x.realizado) ?? medico,
      }));
      // Consultas antiguas o importadas: solo texto en las columnas.
      if (!conceptos.some((x) => x.tipo_concepto === 'ESTUDIO')) {
        const legado: Array<[string | null, Alias]> = [[c.estudio_1, uno(c.e1)], [c.estudio_2, uno(c.e2)], [c.estudio_3, uno(c.e3)]];
        for (const [nombre, realizado] of legado) {
          if (nombre) servicios.push({ concepto: 'Estudio', nombre, ojo: null, indicado: medico, realizado: realizado ?? medico });
        }
      }
      if (!conceptos.some((x) => x.tipo_concepto === 'PROCEDIMIENTO') && c.procedimiento) {
        servicios.push({ concepto: 'Procedimiento', nombre: c.procedimiento, ojo: null, indicado: medico, realizado: uno(c.pd) ?? medico });
      }

      // Renglón de la consulta (en «Estudios» el servicio es el propio estudio).
      const esEstudio = tipoLabel === 'Estudios';
      const renglonConsulta = { concepto: esEstudio ? 'Estudio' : 'Consulta', nombre: esEstudio ? '' : tipoLabel, ojo: null, indicado: medico, realizado: medico } as Servicio;
      if (!(esEstudio && servicios.length)) servicios = [renglonConsulta, ...servicios];

      // Filtro por médico: la consulta, o lo que indicó o realizó.
      if (doctorId) {
        const deEsteMedico = medico?.id === doctorId || c.doctor_id === doctorId;
        servicios = deEsteMedico ? servicios : servicios.filter((s) => s.indicado?.id === doctorId || s.realizado?.id === doctorId);
        if (!servicios.length) continue;
      }

      for (const s of servicios) {
        renglones.push([...base, s.concepto, s.nombre, s.ojo || '', s.indicado?.alias || '', s.realizado?.alias || '', ...fin]);
      }
    }

    const csv = CSV_BOM + [ENCABEZADOS.map(celda).join(','), ...renglones.map((r) => r.map(celda).join(','))].join('\r\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pacientes-atendidos-${desde}_${hasta}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: mensajeSeguro(err, 'reportes.pacientes-atendidos', 'No se pudo generar el reporte') }, { status: 500 });
  }
}

export const GET = ruta('reportes/pacientes-atendidos#GET', manejarGET);
