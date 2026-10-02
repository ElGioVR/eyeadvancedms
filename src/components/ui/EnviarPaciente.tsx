'use client';

import { Mail, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mensajeCitaConPlantilla, urlCorreo, urlWhatsApp, type DatosCita } from '@/lib/mensajes-paciente';
import { useMensajesPaciente } from '@/hooks/useMensajesPaciente';

interface Props {
  cita: DatosCita;
  telefono: string | null | undefined;
  email: string | null | undefined;
  /** 'header' = botones de la cabecera (junto a Imprimir); 'compacto' = ventana rápida de la agenda. */
  variante?: 'header' | 'compacto';
  className?: string;
}

/**
 * Botones «WhatsApp» y «Correo» con el mensaje de la cita ya escrito.
 * WhatsApp abre wa.me (WhatsApp Web o la app); correo abre el cliente de
 * correo del equipo. Sin datos de contacto, el botón queda deshabilitado con
 * el motivo en el tooltip. El texto sale de la plantilla de Configuración ›
 * Mensajes (si hay) o del mensaje por defecto mientras carga.
 */
export default function EnviarPaciente({ cita, telefono, email, variante = 'header', className }: Props) {
  const plantillas = useMensajesPaciente();
  const { asunto, cuerpo } = mensajeCitaConPlantilla(cita, plantillas);
  const wa = urlWhatsApp(telefono, cuerpo);
  const correo = urlCorreo(email, asunto, cuerpo);

  const base =
    variante === 'header'
      ? 'inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-fg-2 transition-colors sm:px-4 sm:py-2.5 sm:text-sm'
      : 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-bold text-fg-2 transition-colors';
  const activo = 'hover:bg-surface-2';
  const inactivo = 'cursor-not-allowed opacity-50';

  return (
    <div className={cn('no-print flex items-center gap-2', className)}>
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(base, activo, 'hover:text-emerald-700 dark:hover:text-emerald-300')} title="Enviar por WhatsApp">
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
      ) : (
        <span className={cn(base, inactivo)} title="El paciente no tiene un teléfono válido" aria-disabled="true">
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </span>
      )}
      {correo ? (
        <a href={correo} className={cn(base, activo, 'hover:text-primary-700 dark:hover:text-primary-300')} title="Enviar por correo">
          <Mail className="h-4 w-4" /> Correo
        </a>
      ) : (
        <span className={cn(base, inactivo)} title="El paciente no tiene correo registrado" aria-disabled="true">
          <Mail className="h-4 w-4" /> Correo
        </span>
      )}
    </div>
  );
}
