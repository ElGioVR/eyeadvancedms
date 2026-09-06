import type { Doctor, ConfiguracionDoctor } from '@/types';

export const doctoresData: Doctor[] = [
  { id: 1, nombre: 'Dra. Irina Pérez', especialidad: 'Oftalmología Pediátrica', cedula: '1234567890', aseguradoras: ['Seguros Monterrey', 'MetLife', 'GNP'], color: 'bg-primary-500', iniciales: 'IP', consultas: 98 },
  { id: 2, nombre: 'Dr. Bayardo Martínez', especialidad: 'Glaucoma', cedula: '0987654321', aseguradoras: ['GNP', 'AXA', 'Particular'], color: 'bg-emerald-500', iniciales: 'BM', consultas: 72 },
  { id: 3, nombre: 'Dra. Martha López', especialidad: 'Catarata y Cirugía Refractiva', cedula: '1122334455', aseguradoras: ['ISSSTECALI', 'JORNADA', 'Particular'], color: 'bg-purple-500', iniciales: 'ML', consultas: 45 },
  { id: 4, nombre: 'Dr. Sánchez K.', especialidad: 'Retina', cedula: '5566778899', aseguradoras: ['AXA', 'Seguros Monterrey'], color: 'bg-sky-500', iniciales: 'SK', consultas: 72 },
  { id: 5, nombre: 'Luis', especialidad: 'Optometría', cedula: '3344556677', aseguradoras: ['Particular'], color: 'bg-amber-500', iniciales: 'LU', consultas: 30 },
  { id: 6, nombre: 'Dr. Piloto', especialidad: 'Estrabismo', cedula: '7788990011', aseguradoras: ['ISSSTECALI', 'JORNADA'], color: 'bg-rose-500', iniciales: 'DP', consultas: 19 },
];

export const doctoresConfigData: ConfiguracionDoctor[] = [
  { id: 1, nombre: 'Dra. Irina Rostova', especialidad: 'Oftalmología Pediátrica', cedula: '12345678', email: 'irina.rostova@eyeadvanced.com', telefono: '664-111-2222', consultas: 342, color: 'bg-primary-500', iniciales: 'IR', estado: 'ACTIVO', aseguranzas: ['ISSSTECALI', 'GNP', 'Particular'] },
  { id: 2, nombre: 'Dr. Héctor Sánchez', especialidad: 'Oftalmología General', cedula: '23456789', email: 'h.sanchez@eyeadvanced.com', telefono: '664-222-3333', consultas: 289, color: 'bg-sky-500', iniciales: 'HS', estado: 'ACTIVO', aseguranzas: ['AXA', 'MetLife', 'Particular'] },
  { id: 3, nombre: 'Dra. Martha López', especialidad: 'Cataratas y Cirugía Refractiva', cedula: '34567890', email: 'martha.lopez@eyeadvanced.com', telefono: '664-333-4444', consultas: 198, color: 'bg-emerald-500', iniciales: 'ML', estado: 'ACTIVO', aseguranzas: ['JORNADA', 'Seguros Monterrey'] },
  { id: 4, nombre: 'Dra. Sadia Khan', especialidad: 'Glaucoma y Retina', cedula: '45678901', email: 'sadia.khan@eyeadvanced.com', telefono: '664-444-5555', consultas: 156, color: 'bg-amber-500', iniciales: 'SK', estado: 'ACTIVO', aseguranzas: ['GNP', 'AXA', 'ISSSTECALI'] },
  { id: 5, nombre: 'Dr. Luis Morales', especialidad: 'Estrabismo', cedula: '56789012', email: 'luis.morales@eyeadvanced.com', telefono: '664-555-6666', consultas: 87, color: 'bg-purple-500', iniciales: 'LM', estado: 'ACTIVO', aseguranzas: ['Particular'] },
  { id: 6, nombre: 'Dr. Piloto García', especialidad: 'Cornea y Superficie Ocular', cedula: '67890123', email: 'piloto.garcia@eyeadvanced.com', telefono: '664-666-7777', consultas: 64, color: 'bg-rose-500', iniciales: 'PG', estado: 'ACTIVO', aseguranzas: ['MetLife', 'JORNADA'] },
];
