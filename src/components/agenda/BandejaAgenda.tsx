'use client';

/**
 * Bandeja de la agenda: botón «Pendientes (N)» + panel lateral con
 *  - Por confirmar: citas de hoy/mañana → WhatsApp con el mensaje de
 *    confirmación (wa.me), «Confirmó», reagendar o cancelar.
 *  - Por cerrar: citas que ya terminaron y siguen abiertas → completar,
 *    reagendar (posponer), aplazar o cancelar.
 * Todo lo que depende de la hora lo calcula el servidor (sin Date en el render).
 */

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Bell, CalendarClock, CheckCircle2, ChevronDown, ExternalLink, MessageCircle, Send, Star, X, XCircle, PauseCircle, AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { enviarJSON, mensajeDeError } from '@/lib/fetcher';
import { useToast } from '@/components/ui/Toast';
import { useMensajesPaciente } from '@/hooks/useMensajesPaciente';
import { mensajeConfirmacionCita, urlWhatsApp } from '@/lib/mensajes-paciente';
import { telefonosWhatsApp } from '@/lib/telefonos-paciente';
import { tipoConfig, fmtTime } from '@/components/agenda/agenda-comun';
import { AccionRapidaModal, type AccionRapida } from '@/components/agenda/AccionesRapidasAgenda';
import type { AgendaCirugia } from '@/types';
import type { ItemBandeja } from '@/app/api/agenda/bandeja/route';

interface RespuestaBandeja {
  porConfirmar: ItemBandeja[];
  porCerrar: ItemBandeja[];
  total: number;
  migracionPendiente: boolean;
  diasAtras: number;
}

export const URL_BANDEJA = '/api/agenda/bandeja';
const ETIQUETA_TIPO: Record<ItemBandeja['tipo'], string> = { cirugia: 'Cirugía', consulta: 'Consulta', estudio: 'Estudio' };
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «7 oct» a partir de YYYY-MM-DD (determinista, sin zona horaria). */
function fechaCorta(f: string): string {
  const [, m, d] = f.split('-');
  return `${Number(d)} ${MESES_CORTOS[Number(m) - 1] || ''}`;
}

/** Evento mínimo que necesita el modal de aplazar/reagendar/cancelar. */
function comoEvento(i: ItemBandeja): AgendaCirugia {
  return {
    id: i.id,
    tipo: i.tipo,
    estado: i.estado as AgendaCirugia['estado'],
    fecha: i.fecha,
    hora: i.hora,
    duracion_min: i.duracion_min,
    nombre_paciente: i.paciente,
    paciente_id: i.paciente_id,
    doctor_id: i.doctor_id,
    doctor_nombre: i.doctor,
  } as unknown as AgendaCirugia;
}

/** Completa la cita con los endpoints de siempre (historial, LIO, devengo). */
async function completar(i: ItemBandeja): Promise<void> {
  if (i.tipo !== 'cirugia') {
    await enviarJSON(`/api/consultas/${i.id}`, 'PATCH', { estatus: 'COMPLETADA' });
    return;
  }
  // Máquina de estados: reagendada solo pasa a agendada; de ahí a completada.
  if (i.estado === 'reagendada') {
    await enviarJSON(`/api/agenda/${i.id}`, 'PATCH', { estado: 'agendada', motivo: 'Confirmada desde la bandeja de la agenda' });
  }
  await enviarJSON(`/api/agenda/${i.id}`, 'PATCH', { estado: 'completada', motivo: 'Completada desde la bandeja de la agenda' });
}

export default function BandejaAgenda({
  onCambio,
  botonClassName,
  soloIcono = false,
}: {
  /** Se llama tras cualquier cambio para refrescar la agenda. */
  onCambio: () => void;
  botonClassName?: string;
  soloIcono?: boolean;
}) {
  const { toast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<'confirmar' | 'cerrar'>('confirmar');
  const [accion, setAccion] = useState<{ item: ItemBandeja; accion: AccionRapida } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [porCompletar, setPorCompletar] = useState<string | null>(null);
  /** Cita cuyo selector de número de WhatsApp está abierto. */
  const [eligeNumero, setEligeNumero] = useState<string | null>(null);
  const plantillas = useMensajesPaciente();

  const { data, mutate, isLoading } = useSWR<RespuestaBandeja>(URL_BANDEJA, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
  const porConfirmar = data?.porConfirmar ?? [];
  const porCerrar = data?.porCerrar ?? [];
  const total = data?.total ?? 0;

  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !accion) setAbierto(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [abierto, accion]);

  const refrescar = () => { void mutate(); onCambio(); };

  const marcar = async (i: ItemBandeja, confirmacion: 'enviada' | 'confirmada' | null, silencioso = false) => {
    setOcupado(i.id);
    try {
      await enviarJSON(URL_BANDEJA, 'PATCH', { tipo: i.tipo, id: i.id, confirmacion });
      if (!silencioso) toast(confirmacion === 'confirmada' ? `${i.paciente}: asistencia confirmada` : 'Confirmación actualizada', 'success');
      void mutate();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const hacerCompletar = async (i: ItemBandeja) => {
    setOcupado(i.id);
    try {
      await completar(i);
      toast(`${ETIQUETA_TIPO[i.tipo]} de ${i.paciente} completada`, 'success');
      setPorCompletar(null);
      refrescar();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const lista = pestana === 'confirmar' ? porConfirmar : porCerrar;
  const urgentes = porCerrar.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={cn(botonClassName || 'btn-secondary', 'relative')}
        title="Citas por confirmar y por cerrar"
        aria-label={`Pendientes de la agenda: ${total}`}
      >
        <Bell className={soloIcono ? 'h-[18px] w-[18px]' : 'h-4 w-4'} />
        {!soloIcono && 'Pendientes'}
        {total > 0 && (
          <span
            className={cn(
              'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-5 text-white',
              urgentes > 0 ? 'bg-rose-600' : 'bg-primary-600',
              soloIcono && 'absolute -right-1.5 -top-1.5',
            )}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label="Pendientes de la agenda">
          <div className="absolute inset-0 bg-black/30" onClick={() => !accion && setAbierto(false)} />
          <aside className="relative flex h-full w-full max-w-md flex-col bg-surface shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-fg">Pendientes de la agenda</h2>
                <p className="text-xs text-muted">Confirma las citas de hoy y mañana y cierra las que ya terminaron.</p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="grid grid-cols-2 gap-1 border-b border-line p-2">
              {([
                ['confirmar', 'Por confirmar', porConfirmar.length],
                ['cerrar', 'Por cerrar', porCerrar.length],
              ] as const).map(([k, label, n]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPestana(k)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors',
                    pestana === k ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300' : 'text-fg-2 hover:bg-surface-2',
                  )}
                >
                  {label}
                  <span className={cn('rounded-full px-1.5 text-[11px]', n > 0 && k === 'cerrar' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-surface-2 text-muted')}>{n}</span>
                </button>
              ))}
            </div>

            {data?.migracionPendiente && (
              <p className="mx-3 mt-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Falta aplicar el SQL de confirmaciones: «Mensaje enviado» y «Confirmó» no se guardarán todavía.
              </p>
            )}

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {isLoading && !data && <p className="py-8 text-center text-sm text-muted">Cargando…</p>}
              {data && lista.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted">
                  <Inbox className="h-8 w-8 opacity-50" />
                  {pestana === 'confirmar' ? 'No hay citas de hoy o mañana pendientes de confirmar.' : `No hay citas por cerrar en los últimos ${data.diasAtras} días.`}
                </div>
              )}
              {lista.map((i) => {
                // Todos los números válidos del paciente (principal primero): se elige a cuál enviar.
                const numeros = telefonosWhatsApp(i.telefonos, i.telefono);
                const cuerpo = numeros.length
                  ? mensajeConfirmacionCita({
                      tipo: i.tipo === 'cirugia' ? 'cirugia' : 'consulta',
                      paciente: i.paciente,
                      fecha: i.fecha,
                      hora: i.hora,
                      doctor: i.doctor,
                      detalle: i.detalle,
                      folio: i.folio,
                    }, plantillas).cuerpo
                  : '';
                const alEnviar = () => { setEligeNumero(null); if (i.confirmacion !== 'enviada') void marcar(i, 'enviada', true); };
                const textoWa = i.confirmacion === 'enviada' ? 'Reenviar' : 'WhatsApp';
                const claseWa = 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10';
                const enUso = ocupado === i.id;
                const btn = 'inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-bold text-fg-2 transition-colors hover:bg-surface-2 disabled:opacity-50';
                return (
                  <article key={`${i.tipo}-${i.id}`} className={cn('rounded-xl border border-line bg-surface p-3 shadow-sm', enUso && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', tipoConfig[i.tipo].bg, tipoConfig[i.tipo].text)}>{ETIQUETA_TIPO[i.tipo]}</span>
                          <span className={cn('text-[11px] font-semibold', pestana === 'cerrar' ? 'text-rose-600 dark:text-rose-400' : 'text-muted')}>{i.tiempo}</span>
                        </div>
                        <p className="mt-1 truncate text-sm font-bold text-fg">{i.paciente || 'Sin nombre'}</p>
                        {i.detalle && <p className="truncate text-xs text-fg-2" title={i.detalle}>{i.detalle}</p>}
                        <p className="text-[11px] text-muted">
                          {fechaCorta(i.fecha)}{i.hora ? ` · ${fmtTime(i.hora)}` : ' · Sin hora'}{i.doctor ? ` · ${i.doctor}` : ''}
                        </p>
                      </div>
                      {pestana === 'confirmar' && (
                        <span className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                          i.confirmacion === 'enviada' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' : 'bg-surface-2 text-muted',
                        )}>
                          {i.confirmacion === 'enviada' ? 'Mensaje enviado' : 'Sin enviar'}
                        </span>
                      )}
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {pestana === 'confirmar' ? (
                        <>
                          {numeros.length === 1 ? (
                            <a
                              href={urlWhatsApp(numeros[0].numero, cuerpo)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={alEnviar}
                              className={cn(btn, claseWa)}
                              title={`Enviar confirmación al ${numeros[0].numero}`}
                            >
                              <MessageCircle className="h-3.5 w-3.5" /> {textoWa}
                            </a>
                          ) : numeros.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => setEligeNumero((v) => (v === i.id ? null : i.id))}
                              aria-expanded={eligeNumero === i.id}
                              className={cn(btn, claseWa)}
                              title="Elegir a qué número enviar"
                            >
                              <MessageCircle className="h-3.5 w-3.5" /> {textoWa} <ChevronDown className={cn('h-3 w-3 transition-transform', eligeNumero === i.id && 'rotate-180')} />
                            </button>
                          ) : (
                            <span className={cn(btn, 'cursor-not-allowed opacity-50')} title="El paciente no tiene un teléfono válido">
                              <MessageCircle className="h-3.5 w-3.5" /> Sin teléfono
                            </span>
                          )}
                          <button type="button" disabled={enUso} onClick={() => marcar(i, 'confirmada')} className={cn(btn, 'border-primary-300 text-primary-700 hover:bg-primary-50 dark:border-primary-500/40 dark:text-primary-300 dark:hover:bg-primary-500/10')}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Confirmó
                          </button>
                          {i.confirmacion === 'enviada' && (
                            <button type="button" disabled={enUso} onClick={() => marcar(i, null)} className={btn} title="Quitar «Mensaje enviado»">
                              <Send className="h-3.5 w-3.5" /> No se envió
                            </button>
                          )}
                          <button type="button" disabled={enUso} onClick={() => setAccion({ item: i, accion: 'reagendar' })} className={btn}>
                            <CalendarClock className="h-3.5 w-3.5" /> Reagendar
                          </button>
                          <button type="button" disabled={enUso} onClick={() => setAccion({ item: i, accion: 'cancelar' })} className={cn(btn, 'text-rose-700 dark:text-rose-300')}>
                            <XCircle className="h-3.5 w-3.5" /> Cancelar
                          </button>
                        </>
                      ) : porCompletar === i.id ? (
                        <>
                          <span className="self-center text-[11px] font-semibold text-fg-2">¿Marcar como completada?</span>
                          <button type="button" disabled={enUso} onClick={() => hacerCompletar(i)} className={cn(btn, 'border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700')}>
                            Sí, completar
                          </button>
                          <button type="button" disabled={enUso} onClick={() => setPorCompletar(null)} className={btn}>No</button>
                        </>
                      ) : (
                        <>
                          <button type="button" disabled={enUso} onClick={() => setPorCompletar(i.id)} className={cn(btn, 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10')}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Completar
                          </button>
                          <button type="button" disabled={enUso} onClick={() => setAccion({ item: i, accion: 'reagendar' })} className={btn}>
                            <CalendarClock className="h-3.5 w-3.5" /> Posponer
                          </button>
                          {(i.tipo === 'cirugia' ? i.estado === 'agendada' : true) && (
                            <button type="button" disabled={enUso} onClick={() => setAccion({ item: i, accion: 'aplazar' })} className={btn}>
                              <PauseCircle className="h-3.5 w-3.5" /> Aplazar
                            </button>
                          )}
                          {(i.tipo !== 'cirugia' || i.estado === 'agendada') && (
                            <button type="button" disabled={enUso} onClick={() => setAccion({ item: i, accion: 'cancelar' })} className={cn(btn, 'text-rose-700 dark:text-rose-300')}>
                              <XCircle className="h-3.5 w-3.5" /> Cancelar
                            </button>
                          )}
                          {i.tipo !== 'cirugia' && (
                            <Link href={`/consultas/${i.id}`} className={btn} title="Abrir la consulta para capturarla">
                              <ExternalLink className="h-3.5 w-3.5" /> Abrir
                            </Link>
                          )}
                        </>
                      )}
                    </div>

                    {pestana === 'confirmar' && eligeNumero === i.id && numeros.length > 1 && (
                      <div className="mt-2 rounded-lg border border-line bg-surface-2/60 p-1.5" role="menu" aria-label="Enviar a">
                        <p className="px-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Enviar a</p>
                        {numeros.map((t) => (
                          <a
                            key={t.numero}
                            role="menuitem"
                            href={urlWhatsApp(t.numero, cuerpo)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={alEnviar}
                            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-fg-2 hover:bg-surface"
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <MessageCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                              {t.numero}
                            </span>
                            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
                              {t.principal && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                              {t.etiqueta}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      {accion && (
        <AccionRapidaModal
          evento={comoEvento(accion.item)}
          accion={accion.accion}
          onClose={() => setAccion(null)}
          onDone={(_cambios, texto) => {
            setAccion(null);
            toast(texto, 'success');
            refrescar();
          }}
        />
      )}
    </>
  );
}
