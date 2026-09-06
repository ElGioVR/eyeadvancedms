import type { Cobro } from '@/types';

export const cobrosData: Cobro[] = [
  { id: 'COB-2024-001', paciente: 'Mateo Rodríguez', doctor: 'Dra. Irina', fecha: '04 Sep 2026', concepto: 'Consulta de seguimiento', aseguradora: 'Seguros Monterrey', metodo: 'Tarjeta de Crédito', monto: '$1,200', coaseguro: '$120', total: '$1,080', estado: 'PAGADO', folio: 'FAC-28451' },
  { id: 'COB-2024-002', paciente: 'Sofía González', doctor: 'Dra. Irina', fecha: '04 Sep 2026', concepto: 'Consulta primera vez + estudios', aseguradora: 'Particular', metodo: 'Efectivo', monto: '$1,800', coaseguro: '—', total: '$1,800', estado: 'PAGADO', folio: 'FAC-28452' },
  { id: 'COB-2024-003', paciente: 'Carlos Mendoza', doctor: 'Dr. Sánchez', fecha: '04 Sep 2026', concepto: 'Graduación y cambio de micas', aseguradora: 'AXA', metodo: 'Tarjeta de Débito', monto: '$800', coaseguro: '$80', total: '$720', estado: 'PENDIENTE', folio: 'FAC-28453' },
  { id: 'COB-2024-004', paciente: 'Lucía Ortiz', doctor: 'Dra. Irina', fecha: '03 Sep 2026', concepto: 'Control de glaucoma + tonometría', aseguradora: 'MetLife', metodo: 'Transferencia', monto: '$1,500', coaseguro: '$150', total: '$1,350', estado: 'PAGADO', folio: 'FAC-28450' },
  { id: 'COB-2024-005', paciente: 'Roberto Vega', doctor: 'Dra. Martha', fecha: '03 Sep 2026', concepto: 'Consulta catarata + biometría', aseguradora: 'ISSSTECALI', metodo: 'Seguro', monto: '$2,200', coaseguro: '—', total: '$0', estado: 'PAGADO', folio: 'FAC-28449' },
  { id: 'COB-2024-006', paciente: 'Ana Luisa Pérez', doctor: 'Dr. Bayardo', fecha: '03 Sep 2026', concepto: 'Consulta glaucoma + campimetría', aseguradora: 'GNP', metodo: 'Tarjeta de Crédito', monto: '$1,600', coaseguro: '$160', total: '$1,440', estado: 'PENDIENTE', folio: 'FAC-28448' },
  { id: 'COB-2024-007', paciente: 'Diego Herrera', doctor: 'Dra. Martha', fecha: '02 Sep 2026', concepto: 'Seguimiento catarata', aseguradora: 'JORNADA', metodo: 'Efectivo', monto: '$900', coaseguro: '—', total: '$900', estado: 'CANCELADO', folio: 'FAC-28447' },
  { id: 'COB-2024-008', paciente: 'Valentina Cruz', doctor: 'Dra. Irina', fecha: '01 Sep 2026', concepto: 'Consulta pediátrica estrabismo', aseguradora: 'ISSSTECALI', metodo: 'Seguro', monto: '$1,400', coaseguro: '—', total: '$0', estado: 'PAGADO', folio: 'FAC-28446' },
];
