export type TipoFuenteHonorario = 'CONSULTA' | 'ESTUDIO' | 'PROCEDIMIENTO' | 'CIRUGIA';

export interface MetricasLigados {
  estudios_ligados: number;
  procedimientos_ligados: number;
  cirugias_ligadas: number;
}

export interface ResolverFuenteInput {
  tipo: 'CONSULTA' | 'ESTUDIO' | 'PROCEDIMIENTO' | 'CIRUGIA';
  tieneConsultaRaiz: boolean;
  consultaId: string | null;
  cirugiaConsultaId?: string | null;
  doctorId: string | null;
  doctorConsultaId?: string | null;
}

export interface ResolverFuenteResultado {
  crearLinea: boolean;
  fuente: TipoFuenteHonorario | null;
  origenId: string | null;
  doctorId: string | null;
  metricasIniciales: MetricasLigados;
  reportarDoctorDistinto: boolean;
  motivo: string;
}

export function metricasVacias(): MetricasLigados {
  return { estudios_ligados: 0, procedimientos_ligados: 0, cirugias_ligadas: 0 };
}

export function resolverFuenteHonorario(input: ResolverFuenteInput): ResolverFuenteResultado {
  const base: ResolverFuenteResultado = {
    crearLinea: false,
    fuente: null,
    origenId: null,
    doctorId: null,
    metricasIniciales: metricasVacias(),
    reportarDoctorDistinto: false,
    motivo: '',
  };

  if (input.tipo === 'CIRUGIA') {
    const consultaId = input.cirugiaConsultaId ?? null;
    if (consultaId) {
      return {
        ...base,
        motivo: 'cirugia_ligada_consulta',
      };
    }
    if (!input.doctorId) {
      return { ...base, motivo: 'cirugia_sin_doctor' };
    }
    return {
      ...base,
      crearLinea: true,
      fuente: 'CIRUGIA',
      origenId: null,
      doctorId: input.doctorId,
      motivo: 'cirugia_independiente',
    };
  }

  if (input.tipo === 'CONSULTA') {
    if (!input.consultaId || !input.doctorId) {
      return { ...base, motivo: 'consulta_incompleta' };
    }
    return {
      ...base,
      crearLinea: true,
      fuente: 'CONSULTA',
      origenId: input.consultaId,
      doctorId: input.doctorId,
      motivo: 'consulta_raiz',
    };
  }

  if (input.tieneConsultaRaiz && input.consultaId) {
    const reportar =
      input.doctorConsultaId != null &&
      input.doctorId != null &&
      input.doctorId !== input.doctorConsultaId;

    if (reportar && input.doctorId) {
      return {
        ...base,
        crearLinea: true,
        fuente: input.tipo,
        origenId: null,
        doctorId: input.doctorId,
        reportarDoctorDistinto: true,
        motivo: 'ligado_doctor_ejecutor_distinto',
      };
    }

    return {
      ...base,
      reportarDoctorDistinto: reportar,
      motivo: reportar
        ? 'ligado_doctor_ejecutor_distinto'
        : 'ligado_a_consulta_sin_linea_propia',
    };
  }

  if (!input.doctorId) {
    return { ...base, motivo: 'sin_doctor' };
  }

  return {
    ...base,
    crearLinea: true,
    fuente: input.tipo,
    origenId: null,
    doctorId: input.doctorId,
    motivo: 'independiente',
  };
}

export function contarMetricasConceptos(
  conceptos: Array<{ tipo_concepto: string }>
): MetricasLigados {
  const m = metricasVacias();
  for (const c of conceptos) {
    if (c.tipo_concepto === 'ESTUDIO') m.estudios_ligados += 1;
    else if (c.tipo_concepto === 'PROCEDIMIENTO') m.procedimientos_ligados += 1;
  }
  return m;
}

export function mergeMetricas(
  a: MetricasLigados,
  b: Partial<MetricasLigados>
): MetricasLigados {
  return {
    estudios_ligados: a.estudios_ligados + (b.estudios_ligados ?? 0),
    procedimientos_ligados: a.procedimientos_ligados + (b.procedimientos_ligados ?? 0),
    cirugias_ligadas: a.cirugias_ligadas + (b.cirugias_ligadas ?? 0),
  };
}
