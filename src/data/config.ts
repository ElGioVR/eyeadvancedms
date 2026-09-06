import type { Aseguranza, Proveedor, CategoriaLente, ConfiguracionAseguranza, ConfiguracionProveedor, ConfiguracionCategoriaLente } from '@/types';

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

export const aseguranzasConfigData: ConfiguracionAseguranza[] = [
  { id: 1, nombre: 'ISSSTECALI', pacientes: 42, color: 'bg-blue-500', contacto: 'Lic. María Torres', telefono: '664-200-1000', email: 'contacto@issstecali.gob.mx', estado: 'ACTIVO' },
  { id: 2, nombre: 'JORNADA', pacientes: 18, color: 'bg-emerald-500', contacto: 'Lic. Roberto Díaz', telefono: '664-200-2000', email: 'atencion@jornada.com.mx', estado: 'ACTIVO' },
  { id: 3, nombre: 'GNP', pacientes: 28, color: 'bg-sky-500', contacto: 'Ana García', telefono: '664-200-3000', email: 'servicios@gnp.com.mx', estado: 'ACTIVO' },
  { id: 4, nombre: 'Seguros Monterrey', pacientes: 11, color: 'bg-rose-500', contacto: 'Pedro López', telefono: '664-200-4000', email: 'clinica@segurosmty.com', estado: 'ACTIVO' },
  { id: 5, nombre: 'AXA', pacientes: 22, color: 'bg-amber-500', contacto: 'Laura Sánchez', telefono: '664-200-5000', email: 'red.medica@axa.mx', estado: 'ACTIVO' },
  { id: 6, nombre: 'MetLife', pacientes: 18, color: 'bg-purple-500', contacto: 'Carlos Hernández', telefono: '664-200-6000', email: 'proveedores@metlife.com.mx', estado: 'ACTIVO' },
  { id: 7, nombre: 'Particular', pacientes: 35, color: 'bg-gray-500', contacto: '—', telefono: '—', email: '—', estado: 'ACTIVO' },
];

export const proveedoresConfigData: ConfiguracionProveedor[] = [
  { id: 1, nombre: 'Essilor', especialidad: 'Lentes oftálmicos y tratamientos', contactos: 12, email: 'ventas.mx@essilor.com', telefono: '800-123-4567', web: 'www.essilor.com', color: 'bg-blue-500', estado: 'ACTIVO' },
  { id: 2, nombre: 'Zeiss', especialidad: 'Lentes premium y progresivos', contactos: 8, email: 'proveedores@zeiss.com.mx', telefono: '800-234-5678', web: 'www.zeiss.com.mx', color: 'bg-sky-500', estado: 'ACTIVO' },
  { id: 3, nombre: 'Hoya', especialidad: 'Lentes y tratamientos antirreflejantes', contactos: 15, email: 'ventas@hoya.com.mx', telefono: '800-345-6789', web: 'www.hoya.com.mx', color: 'bg-emerald-500', estado: 'ACTIVO' },
  { id: 4, nombre: 'Rodenstock', especialidad: 'Lentes de alta precisión', contactos: 5, email: 'info@rodenstock.com.mx', telefono: '800-456-7890', web: 'www.rodenstock.com', color: 'bg-purple-500', estado: 'ACTIVO' },
  { id: 5, nombre: 'Johnson & Johnson', especialidad: 'Lentes de contacto Acuvue', contactos: 22, email: 'visión@jj.com', telefono: '800-567-8901', web: 'www.acuvue.com', color: 'bg-rose-500', estado: 'ACTIVO' },
  { id: 6, nombre: 'CooperVision', especialidad: 'Lentes de contacto', contactos: 10, email: 'ventas@coopervision.mx', telefono: '800-678-9012', web: 'www.coopervision.com', color: 'bg-amber-500', estado: 'ACTIVO' },
];

export const categoriasLentesConfigData: ConfiguracionCategoriaLente[] = [
  { id: 1, nombre: 'Lente Monofocal', descripcion: 'Corrige un solo punto visual (miopía o hipermetropía)', stock: 156, color: 'bg-sky-500', estado: 'ACTIVO' },
  { id: 2, nombre: 'Lente Bifocal', descripcion: 'Corrige visión de cerca y lejos con dos zonas', stock: 89, color: 'bg-primary-500', estado: 'ACTIVO' },
  { id: 3, nombre: 'Lente Progresivo', descripcion: 'Transición gradual sin líneas visibles', stock: 67, color: 'bg-purple-500', estado: 'ACTIVO' },
  { id: 4, nombre: 'Lente de Contacto', descripcion: 'Lente tórica y esférica de contacto', stock: 234, color: 'bg-emerald-500', estado: 'ACTIVO' },
  { id: 5, nombre: 'Mica Policarbonato', descripcion: 'Material resistente a impactos, ideal para niños', stock: 312, color: 'bg-amber-500', estado: 'ACTIVO' },
  { id: 6, nombre: 'Mica Trivex', descripcion: 'Ligera y resistente, mejor óptica que policarbonato', stock: 45, color: 'bg-rose-500', estado: 'ACTIVO' },
  { id: 7, nombre: 'Lente Fotocromático', descripcion: 'Se oscurece con la luz solar', stock: 78, color: 'bg-cyan-500', estado: 'ACTIVO' },
  { id: 8, nombre: 'Antirreflejante', descripcion: 'Tratamiento para reducir reflejos', stock: 0, color: 'bg-gray-400', estado: 'SIN STOCK' },
];
