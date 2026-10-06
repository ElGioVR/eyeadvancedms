'use client';

import { type AgendaCirugia, type AgendaCirugiaEstado } from '@/types';
import { useState, useRef, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { enviarJSON, mensajeDeError } from '@/lib/fetcher';
import { StickyNote, Calendar, Clock, MapPin, User, Stethoscope, AlertTriangle, Eye, Timer, Building2, CheckCircle2, X, FileSpreadsheet, CalendarPlus } from 'lucide-react';
import { fmtDate, fmtTime, tipoConfig, estadoConfig, estadoLabels, fmtDateShort, urlAgendarConsulta } from '@/components/agenda/agenda-comun';
import { etiquetaOjo } from '@/lib/catalogos/cirugia';
import { cn } from '@/lib/utils';
import FichaPaciente from '@/components/ui/FichaPaciente';
import { agendaSoloPropia, puedeGestionarAgenda } from '@/lib/permisos-agenda';
import { type AccionRapida, accionesDisponibles, ETIQUETA_ACCION } from '@/components/agenda/AccionesRapidasAgenda';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { type TelefonoPaciente } from '@/lib/telefonos-paciente';
import EnviarPaciente from '@/components/ui/EnviarPaciente';

/* ───────── Detail Modal ───────── */
export function CirugiaDetailModal({ cirugia, userRol, onEdit, onClose, onRefetch }: { cirugia: AgendaCirugia; userRol: string; onEdit: () => void; onClose: () => void; onRefetch: () => void }) {
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();
  const updateEstado = async (s: AgendaCirugiaEstado) => {
    setUpdating(true);
    try {
      await enviarJSON(`/api/agenda/${cirugia.id}`, 'PATCH', { estado: s });
      onRefetch();
    } catch (err) {
      // Antes el fallo era silencioso: el estado parecía cambiar pero no se guardaba.
      toast(mensajeDeError(err, 'No se pudo cambiar el estado. Intenta de nuevo.'), 'error');
    } finally {
      setUpdating(false);
    }
  };

  const items = [
    cirugia.expediente && { Icon: StickyNote, label: 'Expediente', value: cirugia.expediente },
    cirugia.fecha && { Icon: Calendar, label: 'Fecha', value: fmtDate(cirugia.fecha) },
    cirugia.hora && { Icon: Clock, label: 'Hora', value: fmtTime(cirugia.hora) },
    cirugia.jornada && { Icon: MapPin, label: 'Jornada', value: cirugia.jornada },
    cirugia.doctor_nombre && { Icon: User, label: 'Cirujano', value: cirugia.doctor_nombre },
    cirugia.procedimiento && { Icon: Stethoscope, label: 'Procedimiento', value: cirugia.procedimiento },
    cirugia.diagnostico && { Icon: AlertTriangle, label: 'Diagnóstico', value: cirugia.diagnostico },
    cirugia.ojo && { Icon: Eye, label: 'Ojo', value: etiquetaOjo(cirugia.ojo) },
    cirugia.lio && { Icon: () => <div className="h-3 w-3 rounded-full border-2 border-current" />, label: 'LIO', value: cirugia.lio },
    cirugia.marca_lio && { Icon: () => <div className="h-3 w-3 rounded-full border-2 border-current" />, label: 'Marca LIO', value: cirugia.marca_lio },
    cirugia.tiempo_estimado && { Icon: Timer, label: 'Tiempo estimado', value: cirugia.tiempo_estimado },
    cirugia.tiempo_estancia && { Icon: Timer, label: 'Tiempo estancia', value: cirugia.tiempo_estancia },
    cirugia.procedencia && { Icon: Building2, label: 'Procedencia', value: cirugia.procedencia },
  ].filter(Boolean) as Array<{ Icon: React.ComponentType<{ className?: string }>; label: string; value: string }>;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center text-sm font-extrabold', tipoConfig[cirugia.tipo || 'cirugia'].bg, tipoConfig[cirugia.tipo || 'cirugia'].text)}>
          {cirugia.hora ? fmtTime(cirugia.hora) : '--:--'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-extrabold text-fg truncate">{cirugia.nombre_paciente}</h3>
          <FichaPaciente
            variante="linea"
            className="mt-0.5 text-xs"
            expediente={cirugia.paciente_expediente ?? cirugia.expediente}
            sexo={cirugia.paciente_sexo}
            fechaNacimiento={cirugia.paciente_fecha_nacimiento}
            edad={cirugia.paciente_edad}
          />
          <div className="flex items-center gap-2 mt-1">
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full', estadoConfig[cirugia.estado].lightBg, tipoConfig[cirugia.tipo || 'cirugia'].text)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', estadoConfig[cirugia.estado].dot)} />
              {estadoLabels[cirugia.estado]}
            </span>
            {cirugia.fecha && <span className="text-xs text-muted">{fmtDateShort(cirugia.fecha)}</span>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map(item => (
          <div key={item.label} className="rounded-lg border border-line/70 p-3 bg-gray-50/50 dark:bg-surface-2/50">
            <div className="flex items-center gap-1.5 mb-1">
              <item.Icon className="h-3 w-3 text-muted" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{item.label}</span>
            </div>
            <p className="text-sm font-bold text-fg">{item.value}</p>
          </div>
        ))}
      </div>
      {cirugia.notas && (
        <div className="rounded-lg bg-surface-2 border border-line/70 p-3">
          <div className="flex items-center gap-1.5 mb-1"><StickyNote className="h-3 w-3 text-gray-400" /><span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Notas</span></div>
          <p className="text-sm text-fg-2">{cirugia.notas}</p>
        </div>
      )}
      {!agendaSoloPropia(userRol) && (
        <div className="flex gap-2 pt-2 border-t border-line/70">
          {cirugia.estado === 'agendada' && (
            <>
              <button onClick={() => updateEstado('completada')} disabled={updating} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                <CheckCircle2 className="h-4 w-4" /> Completar
              </button>
              <button onClick={() => updateEstado('cancelada')} disabled={updating} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50">
                <X className="h-4 w-4" /> Cancelar
              </button>
            </>
          )}
          <button onClick={onEdit} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-bold text-fg-2 hover:bg-surface-2 transition-colors">
            Editar
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────── Detail Popover Card (Google Calendar style) ───────── */
export function DetailPopoverCard({ cirugia, position, userRol, onEdit, onClose, onEstado, onAccion }: {
  cirugia: AgendaCirugia; position: { x: number; y: number }; userRol: string;
  onEdit: () => void; onClose: () => void; onEstado: (s: AgendaCirugiaEstado) => Promise<void>;
  onAccion: (accion: AccionRapida) => void;
}) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState(position);
  const esCirugia = !cirugia.tipo || cirugia.tipo === 'cirugia';
  const acciones = accionesDisponibles(cirugia, userRol);
  // Contacto del paciente para WhatsApp/correo: solo al abrir la ventana (payload mínimo).
  const { data: contacto } = useSWR<{ telefono: string | null; telefonos?: TelefonoPaciente[]; email: string | null }>(
    cirugia.paciente_id && puedeGestionarAgenda(userRol) ? `/api/pacientes/${cirugia.paciente_id}/contacto` : null,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = position.x;
    let y = position.y;
    if (x + rect.width > vw - 16) x = vw - rect.width - 16;
    if (y + rect.height > vh - 16) y = position.y - rect.height - 10;
    if (x < 16) x = 16;
    if (y < 16) y = 16;
    setAdjustedPos({ x, y });
  }, [position]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const updateEstado = async (s: AgendaCirugiaEstado) => {
    if (updating) return;
    setUpdating(true);
    try {
      await onEstado(s); // optimista en la agenda; el error se muestra en un toast
    } finally { setUpdating(false); }
  };

  return (
    <div ref={cardRef}
      className="fixed z-50 w-[340px] rounded-2xl border border-line bg-surface shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className={cn('h-3 w-3 rounded-full shrink-0', estadoConfig[cirugia.estado].dot)} />
            <h3 className="text-base font-extrabold text-fg truncate">{cirugia.nombre_paciente}</h3>
          </div>
          <FichaPaciente
            variante="linea"
            className="mt-0.5 pl-6 text-xs"
            expediente={cirugia.paciente_expediente ?? cirugia.expediente}
            sexo={cirugia.paciente_sexo}
            fechaNacimiento={cirugia.paciente_fecha_nacimiento}
            edad={cirugia.paciente_edad}
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {acciones.includes('cancelar') && (
            <button onClick={() => onAccion('cancelar')} disabled={updating}
              className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors text-gray-400 hover:text-red-500"
              title="Cancelar cita" aria-label="Cancelar cita">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
            </button>
          )}
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-fg"
            title="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Subtitle */}
      <div className="px-4 pb-2">
        <p className="text-xs text-muted">
          {cirugia.fecha && fmtDate(cirugia.fecha)}
        </p>
      </div>

      {/* Details */}
      <div className="px-4 pb-3 space-y-2">
        {!esCirugia && (cirugia.especialidad || cirugia.tipo_consulta_label) && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <Stethoscope className="h-4 w-4 text-muted shrink-0" />
            <span>{[cirugia.especialidad, cirugia.tipo_consulta_label].filter(Boolean).join(' · ')}</span>
          </div>
        )}
        {cirugia.codigo && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <FileSpreadsheet className="h-4 w-4 text-muted shrink-0" />
            <span className="font-mono text-xs">{cirugia.codigo}</span>
          </div>
        )}
        {cirugia.procedimiento && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <Stethoscope className="h-4 w-4 text-muted shrink-0" />
            <span>{cirugia.procedimiento}</span>
          </div>
        )}
        {cirugia.doctor_nombre && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <User className="h-4 w-4 text-muted shrink-0" />
            <span>{cirugia.doctor_nombre}</span>
          </div>
        )}
        {cirugia.hora && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <Clock className="h-4 w-4 text-muted shrink-0" />
            <span>{fmtTime(cirugia.hora)}{cirugia.tiempo_estimado ? ` · ${cirugia.tiempo_estimado}` : ''}</span>
          </div>
        )}
        {cirugia.ojo && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <Eye className="h-4 w-4 text-muted shrink-0" />
            <span>{etiquetaOjo(cirugia.ojo)}</span>
          </div>
        )}
        {cirugia.jornada && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <MapPin className="h-4 w-4 text-muted shrink-0" />
            <span>{cirugia.jornada}</span>
          </div>
        )}
        {cirugia.expediente && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <FileSpreadsheet className="h-4 w-4 text-muted shrink-0" />
            <span>Exp. {cirugia.expediente}</span>
          </div>
        )}
        {cirugia.procedencia && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <Building2 className="h-4 w-4 text-muted shrink-0" />
            <span>{cirugia.procedencia}</span>
          </div>
        )}
        {cirugia.diagnostico && (
          <div className="flex items-start gap-2.5 text-sm text-fg-2">
            <Stethoscope className="h-4 w-4 text-muted shrink-0 mt-0.5" />
            <span className="line-clamp-2">{cirugia.diagnostico}</span>
          </div>
        )}
        {(cirugia.lio || cirugia.marca_lio) && (
          <div className="flex items-center gap-2.5 text-sm text-fg-2">
            <Eye className="h-4 w-4 text-muted shrink-0" />
            <span>{[cirugia.marca_lio, cirugia.lio].filter(Boolean).join(' — ')}</span>
          </div>
        )}
        {cirugia.notas && (
          <div className="flex items-start gap-2.5 text-sm text-fg-2">
            <StickyNote className="h-4 w-4 text-muted shrink-0 mt-0.5" />
            <span className="line-clamp-2">{cirugia.notas}</span>
          </div>
        )}
        {cirugia.motivo_aplazamiento && (
          <div className="flex items-start gap-2.5 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{cirugia.motivo_aplazamiento}</span>
          </div>
        )}
      </div>

      {/* Status + Actions */}
      <div className="px-4 pb-4 pt-2 border-t border-line/70 space-y-2">
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full', estadoConfig[cirugia.estado].lightBg, tipoConfig[cirugia.tipo || 'cirugia'].text)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', estadoConfig[cirugia.estado].dot)} />
            {estadoLabels[cirugia.estado]}
          </span>
          <div className="flex-1" />
          {esCirugia && !agendaSoloPropia(userRol) && cirugia.estado === 'agendada' && (
            <button onClick={() => updateEstado('completada')} disabled={updating}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
              Completar
            </button>
          )}
          {esCirugia && !agendaSoloPropia(userRol) && (
            <button onClick={onEdit}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-line text-fg-2 hover:bg-surface-2 transition-colors">
              Editar
            </button>
          )}
        </div>
        {acciones.length > 0 && (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${acciones.length}, minmax(0, 1fr))` }} role="group" aria-label="Acciones rápidas">
            {acciones.map((a) => (
              <button key={a} onClick={() => onAccion(a)} disabled={updating}
                className={cn(
                  'rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-50',
                  a === 'cancelar'
                    ? 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10'
                    : 'border-line text-fg-2 hover:bg-surface-2'
                )}>
                {ETIQUETA_ACCION[a]}
              </button>
            ))}
          </div>
        )}
        {cirugia.paciente_id && puedeGestionarAgenda(userRol) && (
          <EnviarPaciente
            variante="compacto"
            cita={{
              tipo: esCirugia ? 'cirugia' : 'consulta',
              paciente: cirugia.nombre_paciente,
              fecha: cirugia.fecha,
              hora: cirugia.hora,
              doctor: cirugia.doctor_nombre,
              detalle: esCirugia ? cirugia.procedimiento : (cirugia.tipo_consulta_label || cirugia.procedimiento),
            }}
            telefono={contacto?.telefono}
            telefonos={contacto?.telefonos}
            email={contacto?.email}
          />
        )}
        {cirugia.paciente_id && userRol !== 'enfermero' && (
          <button
            onClick={() => { onClose(); router.push(urlAgendarConsulta(cirugia)); }}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary-200 px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-50 dark:border-primary-500/30 dark:text-primary-300 dark:hover:bg-primary-500/10 transition-colors">
            <CalendarPlus className="h-3.5 w-3.5" />
            Agendar consulta
          </button>
        )}
        <button
          onClick={() => { onClose(); router.push(esCirugia ? `/cirugias/${cirugia.id}` : `/consultas/${cirugia.id}`); }}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700 transition-colors">
          Ver detalle completo
        </button>
      </div>
    </div>
  );
}
