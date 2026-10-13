import { redirect } from 'next/navigation';

// La administración de aseguradoras vive ahora en Configuración → Conceptos.
export default function AseguranzasPage() {
  redirect('/configuracion/conceptos');
}
