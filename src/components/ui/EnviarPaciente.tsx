'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Mail, MessageCircle, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mensajeCitaConPlantilla, urlCorreo, urlWhatsApp, type DatosCita } from '@/lib/mensajes-paciente';
import { telefonosWhatsApp, type TelefonoPaciente } from '@/lib/telefonos-paciente';
import { useMensajesPaciente } from '@/hooks/useMensajesPaciente';

interface Props {
  cita: DatosCita;
  /** Teléfono principal (registros sin lista de teléfonos). */
  telefono: string | null | undefined;
  /** Todos los teléfonos del paciente (hasta 3, uno principal). */
  telefonos?: TelefonoPaciente[] | null;
  email: string | null | undefined;
  /** 'header' = botones de la cabecera (junto a Imprimir); 'compacto' = ventana rápida de la agenda. */
  variante?: 'header' | 'compacto';
  className?: string;
}

/**
 * Botones «WhatsApp» y «Correo» con el mensaje de la cita ya escrito.
 * WhatsApp abre wa.me (WhatsApp Web o la app). Con un solo número válido el
 * botón abre directo; con varios despliega la lista (principal primero) para
 * elegir a cuál enviar. Sin datos de contacto, el botón queda deshabilitado
 * con el motivo en el tooltip. El texto sale de la plantilla de
 * Configuración › Mensajes (si hay) o del mensaje por defecto mientras carga.
 */
export default function EnviarPaciente({ cita, telefono, telefonos, email, variante = 'header', className }: Props) {
  const plantillas = useMensajesPaciente();
  const { asunto, cuerpo } = mensajeCitaConPlantilla(cita, plantillas);
  const numeros = telefonosWhatsApp(telefonos, telefono);
  const correo = urlCorreo(email, asunto, cuerpo);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const base =
    variante === 'header'
      ? 'inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-fg-2 transition-colors sm:px-4 sm:py-2.5 sm:text-sm'
      : 'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-bold text-fg-2 transition-colors';
  const activo = 'hover:bg-surface-2';
  const inactivo = 'cursor-not-allowed opacity-50';
  const colorWa = 'hover:text-emerald-700 dark:hover:text-emerald-300';

  let botonWa: React.ReactNode;
  if (numeros.length === 0) {
    botonWa = (
      <span className={cn(base, inactivo)} title="El paciente no tiene un teléfono válido" aria-disabled="true">
        <MessageCircle className="h-4 w-4" /> WhatsApp
      </span>
    );
  } else if (numeros.length === 1) {
    botonWa = (
      <a href={urlWhatsApp(numeros[0].numero, cuerpo)!} target="_blank" rel="noopener noreferrer" className={cn(base, activo, colorWa)} title={`Enviar por WhatsApp al ${numeros[0].numero}`}>
        <MessageCircle className="h-4 w-4" /> WhatsApp
      </a>
    );
  } else {
    botonWa = (
      <div className="relative w-full" ref={ref}>
        <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu" className={cn(base, activo, colorWa)} title="Elegir a qué número enviar">
          <MessageCircle className="h-4 w-4" /> WhatsApp <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {menu && (
          <div role="menu" className="absolute left-0 top-full z-50 mt-1.5 w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-1.5 shadow-xl">
            <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">Enviar a</p>
            {numeros.map((t) => (
              <a
                key={t.numero}
                role="menuitem"
                href={urlWhatsApp(t.numero, cuerpo)!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenu(false)}
                className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-2 hover:bg-surface-2"
              >
                <span className="truncate">{t.numero}</span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
                  {t.principal && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                  {t.etiqueta}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('no-print flex items-center gap-2', variante === 'compacto' && '[&>*]:flex-1', className)}>
      {botonWa}
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
