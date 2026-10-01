import { redirect } from 'next/navigation';

/** El personal de apoyo se unificó con los médicos en Configuración → Personal médico. */
export default function PersonalClinicoRedirect() {
  redirect('/configuracion/doctores?tipo=ENFERMERO');
}
