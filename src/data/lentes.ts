import type { Lente } from '@/types';

export const lentesData: Lente[] = [
  { id: 'LIO-001', nombre: 'AcrySof IQ', modelo: 'SN60WF', categoria: 'Lente Intraocular (LIO)', esferico: '+21.00', cilindrico: '-2.00', eje: '90°', material: 'Acrílico hidrofóbico', proveedor: 'Alcon México', caducidad: '12/2028', costo: '$18,500 MXN', stock: 12, minimo: 5, estado: 'Disponible', color: 'bg-primary-500' },
  { id: 'LIO-002', nombre: 'Tecnis 1-Piece', modelo: 'ZCB00', categoria: 'Lente Intraocular (LIO)', esferico: '+19.50', cilindrico: '0.00', eje: '0°', material: 'Acrílico hidrofílico', proveedor: 'Johnson & Johnson Vision', caducidad: '09/2027', costo: '$21,000 MXN', stock: 4, minimo: 6, estado: 'Bajo', color: 'bg-purple-500' },
  { id: 'LIO-003', nombre: 'Sensar 1-Piece', modelo: 'AR40M', categoria: 'Lente Intraocular (LIO)', esferico: '+23.00', cilindrico: '-1.50', eje: '180°', material: 'Acrílico hidrofóbico', proveedor: 'Johnson & Johnson Vision', caducidad: '04/2026', costo: '$14,800 MXN', stock: 0, minimo: 4, estado: 'Sin Stock', color: 'bg-emerald-500' },
  { id: 'LIO-004', nombre: 'Clareon', modelo: 'CNA0T0', categoria: 'Lente Intraocular (LIO)', esferico: '+22.50', cilindrico: '-1.00', eje: '45°', material: 'Acrílico Clareon', proveedor: 'Alcon México', caducidad: '10/2029', costo: '$22,500 MXN', stock: 15, minimo: 5, estado: 'Disponible', color: 'bg-sky-500' },
];
