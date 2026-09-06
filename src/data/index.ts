import type { Paciente, Doctor, Consulta, Cobro, Lente, Aseguranza, Proveedor, CategoriaLente } from '@/types';

export const pacientesData: Paciente[] = [
  { id: 1, nombre: 'Mateo Rodríguez', iniciales: 'MR', color: 'bg-primary-500', edad: 28, sexo: 'H', aseguradora: 'Seguros Monterrey', sx: '20/25', tipografia: 'Lion' },
  { id: 2, nombre: 'Sofía González', iniciales: 'SG', color: 'bg-purple-500', edad: 35, sexo: 'M', aseguradora: 'Particular', sx: '20/20', tipografia: 'Lion' },
  { id: 3, nombre: 'Carlos Mendoza', iniciales: 'CM', color: 'bg-emerald-500', edad: 52, sexo: 'H', aseguradora: 'AXA', sx: '20/30', tipografia: 'Lion' },
  { id: 4, nombre: 'Lucía Ortiz', iniciales: 'LO', color: 'bg-rose-500', edad: 67, sexo: 'M', aseguradora: 'MetLife', sx: '20/40', tipografia: 'Lion' },
  { id: 5, nombre: 'Roberto Vega', iniciales: 'RV', color: 'bg-sky-500', edad: 45, sexo: 'H', aseguradora: 'ISSSTECALI', sx: '20/20', tipografia: 'Lion' },
  { id: 6, nombre: 'Ana Luisa Pérez', iniciales: 'AP', color: 'bg-amber-500', edad: 41, sexo: 'M', aseguradora: 'GNP', sx: '20/25', tipografia: 'Lion' },
  { id: 7, nombre: 'Diego Herrera', iniciales: 'DH', color: 'bg-cyan-500', edad: 58, sexo: 'H', aseguradora: 'JORNADA', sx: '20/30', tipografia: 'Lion' },
  { id: 8, nombre: 'Valentina Cruz', iniciales: 'VC', color: 'bg-violet-500', edad: 33, sexo: 'M', aseguradora: 'ISSSTECALI', sx: '20/20', tipografia: 'Lion' },
];

export const doctoresData: Doctor[] = [
  { id: 1, nombre: 'Dra. Irina Pérez', especialidad: 'Oftalmología Pediátrica', cedula: '1234567890', aseguradoras: ['Seguros Monterrey', 'MetLife', 'GNP'], color: 'bg-primary-500', iniciales: 'IP', consultas: 98 },
  { id: 2, nombre: 'Dr. Bayardo Martínez', especialidad: 'Glaucoma', cedula: '0987654321', aseguradoras: ['GNP', 'AXA', 'Particular'], color: 'bg-emerald-500', iniciales: 'BM', consultas: 72 },
  { id: 3, nombre: 'Dra. Martha López', especialidad: 'Catarata y Cirugía Refractiva', cedula: '1122334455', aseguradoras: ['ISSSTECALI', 'JORNADA', 'Particular'], color: 'bg-purple-500', iniciales: 'ML', consultas: 45 },
  { id: 4, nombre: 'Dr. Sánchez K.', especialidad: 'Retina', cedula: '5566778899', aseguradoras: ['AXA', 'Seguros Monterrey'], color: 'bg-sky-500', iniciales: 'SK', consultas: 72 },
  { id: 5, nombre: 'Luis', especialidad: 'Optometría', cedula: '3344556677', aseguradoras: ['Particular'], color: 'bg-amber-500', iniciales: 'LU', consultas: 30 },
  { id: 6, nombre: 'Dr. Piloto', especialidad: 'Estrabismo', cedula: '7788990011', aseguradoras: ['ISSSTECALI', 'JORNADA'], color: 'bg-rose-500', iniciales: 'DP', consultas: 19 },
];

export const consultasData: Consulta[] = [
  { id: 'CON-2024-001', paciente: 'Mateo Rodríguez', iniciales: 'MR', color: 'bg-primary-500', doctor: 'Dra. Irina', fecha: '04 Sep 2026, 09:00 AM', tipo: 'Seguimiento', diagnostico: 'Miopía progresiva controlada', estado: 'COMPLETADA', cobro: '$1,080', horaFin: '09:45 AM', tipoVisita: 'Retorno', aseguradora: 'Seguros Monterrey', metodoPago: 'Tarjeta de Crédito', estudios: 'Agudeza visual, tonometría, fondo de ojo', procedimientos: 'Graduación ocular, adaptación de lentes', notas: 'Paciente refiere mejoría. Se ajusta graduación.' },
  { id: 'CON-2024-002', paciente: 'Sofía González', iniciales: 'SG', color: 'bg-purple-500', doctor: 'Dra. Irina', fecha: '04 Sep 2026, 10:15 AM', tipo: 'Primera Vez', diagnostico: 'Estrabismo divergente', estado: 'EN CURSO', cobro: '$1,800', horaFin: '—', tipoVisita: 'Nueva Visita', aseguradora: 'Particular', metodoPago: 'Efectivo', estudios: 'Queratometría, campimetría, biometría', procedimientos: 'Examen completo de estrabismo', notas: 'Paciente de 35 años con estrabismo desde infancia.' },
  { id: 'CON-2024-003', paciente: 'Carlos Mendoza', iniciales: 'CM', color: 'bg-emerald-500', doctor: 'Dr. Sánchez', fecha: '04 Sep 2026, 11:30 AM', tipo: 'Graduación', diagnostico: 'Astigmatismo miópico', estado: 'PENDIENTE', cobro: '$720', horaFin: '—', tipoVisita: 'Nueva Visita', aseguradora: 'AXA', metodoPago: 'Transferencia', estudios: 'Topografía corneal, agudeza visual', procedimientos: 'Graduación y toma de medidas', notas: 'Paciente solicita cambio de lentes progresivas.' },
  { id: 'CON-2024-004', paciente: 'Lucía Ortiz', iniciales: 'LO', color: 'bg-rose-500', doctor: 'Dra. Irina', fecha: '04 Sep 2026, 12:00 PM', tipo: 'Seguimiento', diagnostico: 'Glaucoma de ángulo abierto', estado: 'PENDIENTE', cobro: '$1,350', horaFin: '—', tipoVisita: 'Retorno', aseguradora: 'MetLife', metodoPago: 'Seguro', estudios: 'Tonometría, campimetría, OCT nervio óptico', procedimientos: 'Control de presión intraocular', notas: ' PIO estable. Continuar tratamiento con latanoprost.' },
  { id: 'CON-2024-005', paciente: 'Roberto Vega', iniciales: 'RV', color: 'bg-sky-500', doctor: 'Dra. Martha', fecha: '03 Sep 2026, 02:30 PM', tipo: 'Primera Vez', diagnostico: 'Catarata senil bilateral', estado: 'COMPLETADA', cobro: '$0', horaFin: '03:15 PM', tipoVisita: 'Nueva Visita', aseguradora: 'ISSSTECALI', metodoPago: 'Seguro', estudios: 'Biometría, topografía, OCT, agudeza visual', procedimientos: 'Exploración completa de catarata', notas: 'Catarata nuclear grade II. Se recomienda cirugía.' },
  { id: 'CON-2024-006', paciente: 'Ana Luisa Pérez', iniciales: 'AP', color: 'bg-amber-500', doctor: 'Dr. Bayardo', fecha: '03 Sep 2026, 10:00 AM', tipo: 'Seguimiento', diagnostico: 'Glaucoma primario', estado: 'COMPLETADA', cobro: '$1,440', horaFin: '10:40 AM', tipoVisita: 'Retorno', aseguradora: 'GNP', metodoPago: 'Tarjeta de Crédito', estudios: 'Tonometría, campimetría, OCT', procedimientos: 'Ajuste de medicación', notas: ' PIO controlada. Se ajusta dosis de timolol.' },
  { id: 'CON-2024-007', paciente: 'Diego Herrera', iniciales: 'DH', color: 'bg-cyan-500', doctor: 'Dra. Martha', fecha: '02 Sep 2026, 11:00 AM', tipo: 'Control', diagnostico: 'Catarata post-operatorio', estado: 'COMPLETADA', cobro: '$900', horaFin: '11:25 AM', tipoVisita: 'Retorno', aseguradora: 'JORNADA', metodoPago: 'Efectivo', estudios: 'Agudeza visual, tonometría, biomicroscopía', procedimientos: 'Control post-operatorio día 7', notas: 'Evolución favorable. Sin complicaciones.' },
  { id: 'CON-2024-008', paciente: 'Valentina Cruz', iniciales: 'VC', color: 'bg-violet-500', doctor: 'Dra. Irina', fecha: '01 Sep 2026, 09:30 AM', tipo: 'Primera Vez', diagnostico: 'Estrabismo convergente', estado: 'COMPLETADA', cobro: '$0', horaFin: '10:10 AM', tipoVisita: 'Nueva Visita', aseguradora: 'ISSSTECALI', metodoPago: 'Seguro', estudios: 'Queratometría, campimetría, cover test', procedimientos: 'Examen de estrabismo convergente', notas: 'Estrabismo convergente intermitente. Se inicia terapia visual.' },
];

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

export const lentesData: Lente[] = [
  { id: 'LIO-001', nombre: 'AcrySof IQ', modelo: 'SN60WF', categoria: 'Lente Intraocular (LIO)', esferico: '+21.00', cilindrico: '-2.00', eje: '90°', material: 'Acrílico hidrofóbico', proveedor: 'Alcon México', caducidad: '12/2028', costo: '$18,500 MXN', stock: 12, minimo: 5, estado: 'Disponible', color: 'bg-primary-500' },
  { id: 'LIO-002', nombre: 'Tecnis 1-Piece', modelo: 'ZCB00', categoria: 'Lente Intraocular (LIO)', esferico: '+19.50', cilindrico: '0.00', eje: '0°', material: 'Acrílico hidrofílico', proveedor: 'Johnson & Johnson Vision', caducidad: '09/2027', costo: '$21,000 MXN', stock: 4, minimo: 6, estado: 'Bajo', color: 'bg-purple-500' },
  { id: 'LIO-003', nombre: 'Sensar 1-Piece', modelo: 'AR40M', categoria: 'Lente Intraocular (LIO)', esferico: '+23.00', cilindrico: '-1.50', eje: '180°', material: 'Acrílico hidrofóbico', proveedor: 'Johnson & Johnson Vision', caducidad: '04/2026', costo: '$14,800 MXN', stock: 0, minimo: 4, estado: 'Sin Stock', color: 'bg-emerald-500' },
  { id: 'LIO-004', nombre: 'Clareon', modelo: 'CNA0T0', categoria: 'Lente Intraocular (LIO)', esferico: '+22.50', cilindrico: '-1.00', eje: '45°', material: 'Acrílico Clareon', proveedor: 'Alcon México', caducidad: '10/2029', costo: '$22,500 MXN', stock: 15, minimo: 5, estado: 'Disponible', color: 'bg-sky-500' },
];

export const aseguranzasData: Aseguranza[] = [
  { id: 1, nombre: 'ISSSTECALI', color: 'bg-sky-500', pacientes: 32, contacto: 'María González', telefono: '(664) 123-4567' },
  { id: 2, nombre: 'JORNADA', color: 'bg-emerald-500', pacientes: 18, contacto: 'Carlos Ruiz', telefono: '(664) 234-5678' },
  { id: 3, nombre: 'GNP', color: 'bg-primary-500', pacientes: 15, contacto: 'Ana López', telefono: '(664) 345-6789' },
  { id: 4, nombre: 'Seguros Monterrey', color: 'bg-purple-500', pacientes: 24, contacto: 'Pedro Sánchez', telefono: '(664) 456-7890' },
  { id: 5, nombre: 'AXA', color: 'bg-amber-500', pacientes: 12, contacto: 'Laura Martínez', telefono: '(664) 567-8901' },
  { id: 6, nombre: 'MetLife', color: 'bg-rose-500', pacientes: 18, contacto: 'Roberto Díaz', telefono: '(664) 678-9012' },
  { id: 7, nombre: 'Particular', color: 'bg-gray-500', pacientes: 55, contacto: '—', telefono: '—' },
];

export const proveedoresData: Proveedor[] = [
  { id: 1, nombre: 'Alcon México', productos: 'Lentes intraoculares, solutiones', contacto: 'Ing. Torres', telefono: '(800) 123-4567', email: 'ventas@alcon.com.mx', website: 'www.alcon.com', color: 'bg-primary-500', iniciales: 'AM' },
  { id: 2, nombre: 'Johnson & Johnson Vision', productos: 'Lentes intraoculares, lentes de contacto', contacto: 'Dra. Ruiz', telefono: '(800) 234-5678', email: 'info@jjvision.com', website: 'www.jjvision.com', color: 'bg-purple-500', iniciales: 'JJ' },
  { id: 3, nombre: 'Zeiss', productos: 'Equipos diagnósticos, lentes oftálmicos', contacto: 'Ing. Müller', telefono: '(800) 345-6789', email: 'ventas@zeiss.com.mx', website: 'www.zeiss.com', color: 'bg-sky-500', iniciales: 'ZE' },
  { id: 4, nombre: 'Hoya', productos: 'Lentes oftálmicos, lentes progresivos', contacto: 'Lic. Tanaka', telefono: '(800) 456-7890', email: 'info@hoya.com.mx', website: 'www.hoya.com', color: 'bg-emerald-500', iniciales: 'HO' },
  { id: 5, nombre: 'Essilor', productos: 'Lentes oftálmicos, tratamientos', contacto: 'Dr. Lambert', telefono: '(800) 567-8901', email: 'ventas@essilor.com.mx', website: 'www.essilor.com', color: 'bg-amber-500', iniciales: 'ES' },
  { id: 6, nombre: 'Rodenstock', productos: 'Lentes oftálmicos premium', contacto: 'Ing. Weber', telefono: '(800) 678-9012', email: 'info@rodenstock.com.mx', website: 'www.rodenstock.com', color: 'bg-rose-500', iniciales: 'RO' },
];

export const categoriasLentesData: CategoriaLente[] = [
  { id: 1, nombre: 'Lente Intraocular (LIO)', descripcion: 'Implante quirúrgico para catarata', stock: 28, estado: 'Activo' },
  { id: 2, nombre: 'Lente Monofocal', descripcion: 'Corrección de una distancia', stock: 12, estado: 'Activo' },
  { id: 3, nombre: 'Lente Bifocal', descripcion: 'Corrección de dos distancias', stock: 5, estado: 'Activo' },
  { id: 4, nombre: 'Lente Progresivo', descripcion: 'Corrección multifocal sin líneas', stock: 3, estado: 'Activo' },
  { id: 5, nombre: 'Lente de Contacto', descripcion: 'Contacto directo con córnea', stock: 45, estado: 'Activo' },
  { id: 6, nombre: 'Lente Tórico', descripcion: 'Corrección de astigmatismo', stock: 8, estado: 'Activo' },
  { id: 7, nombre: 'Lente Multifocal', descripcion: 'Múltiples distancias', stock: 6, estado: 'Inactivo' },
  { id: 8, nombre: 'Lente Filtrante', descripcion: 'Protección UV y luz azul', stock: 15, estado: 'Activo' },
];

export const aseguradoraOptions = ['Particular', 'ISSSTECALI', 'JORNADA', 'GNP', 'Seguros Monterrey', 'AXA', 'MetLife'] as const;
export const metodoPagoOptions = ['Efectivo', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Transferencia', 'Seguro'] as const;
export const monedaOptions = ['MXN - Peso Mexicano', 'USD - Dólar'] as const;
