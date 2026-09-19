export interface CoberturaAseguranza {
  porcentaje_cobertura: number;
  monto_maximo: number | null;
  aplica_estudios: boolean;
  aplica_procedimientos: boolean;
}

export interface ConceptoCalculo {
  tipo_concepto: string;
  precio: number;
}

export interface ResultadoCobertura {
  subtotal: number;
  porcentaje_aplicable: number;
  monto_cobertura: number;
  total_paciente: number;
  desglose: Array<{
    tipo_concepto: string;
    precio: number;
    cubierto: number;
    paciente_paga: number;
    aplica: boolean;
  }>;
}

export function calcularCobertura(
  conceptos: ConceptoCalculo[],
  cobertura: CoberturaAseguranza | null,
): ResultadoCobertura {
  if (!cobertura || conceptos.length === 0) {
    const subtotal = conceptos.reduce((sum, c) => sum + c.precio, 0);
    return {
      subtotal,
      porcentaje_aplicable: 0,
      monto_cobertura: 0,
      total_paciente: subtotal,
      desglose: conceptos.map((c) => ({
        tipo_concepto: c.tipo_concepto,
        precio: c.precio,
        cubierto: 0,
        paciente_paga: c.precio,
        aplica: true,
      })),
    };
  }

  const desglose = conceptos.map((c) => {
    const aplica = c.tipo_concepto === 'ESTUDIO'
      ? cobertura.aplica_estudios
      : c.tipo_concepto === 'PROCEDIMIENTO'
        ? cobertura.aplica_procedimientos
        : true;

    const cubierto = aplica ? roundMoney(c.precio * cobertura.porcentaje_cobertura / 100) : 0;
    const pacientePaga = roundMoney(c.precio - cubierto);

    return {
      tipo_concepto: c.tipo_concepto,
      precio: c.precio,
      cubierto,
      paciente_paga: pacientePaga,
      aplica,
    };
  });

  const subtotal = conceptos.reduce((sum, c) => sum + c.precio, 0);
  const montoCoberturaTotal = desglose.reduce((sum, d) => sum + d.cubierto, 0);
  const montoFinal = cobertura.monto_maximo !== null
    ? Math.min(montoCoberturaTotal, cobertura.monto_maximo)
    : montoCoberturaTotal;
  const totalPaciente = roundMoney(subtotal - montoFinal);

  return {
    subtotal,
    porcentaje_aplicable: cobertura.porcentaje_cobertura,
    monto_cobertura: montoFinal,
    total_paciente: totalPaciente,
    desglose,
  };
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}
