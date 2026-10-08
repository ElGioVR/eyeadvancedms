'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { ApiError, enviarJSON, fetchJSON, mensajeDeError } from '@/lib/fetcher';
import { ROLES_PERSONAL } from '@/lib/catalogos/cirugia';
import { ETIQUETAS_ROL } from '@/lib/catalogos/equipo-quirurgico';
import { Plus, X } from 'lucide-react';

/** C7 / C8: editor del equipo (médicos con rol y horario, personal de apoyo) desde el detalle. */

interface ParticipanteInicial {
  id: string;
  medico_id: string;
  rol_id: string;
  hora_inicio?: string | null;
  hora_fin?: string | null;
}

interface PersonalInicial {
  id: string;
  rol: string;
  nombre: string;
  hora_inicio?: string | null;
  hora_fin?: string | null;
}

interface DoctorOpcion { id: string; alias: string; tipo_personal?: string | null }
interface RolOpcion { id: string; clave: string; nombre: string }
interface PersonalOpcion { id: string; nombre: string; rol_principal?: string | null; activo?: boolean }

type MedicoFila = { key: string; medico_id: string; rol_id: string; hora_inicio: string; hora_fin: string };
type PersonalFila = { key: string; rol: string; personal_id: string; nombre?: string; hora_inicio: string; hora_fin: string };

const obtener = <T,>(url: string) => fetchJSON<T>(url);
const aHHMM = (v?: string | null) => (v ? v.slice(0, 5) : '');
const inputCls = 'w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-fg';

export default function EditarEquipoCirugia({
  cirugiaId,
  participantes,
  personal,
  onGuardado,
}: {
  cirugiaId: string;
  participantes: ParticipanteInicial[];
  personal: PersonalInicial[];
  onGuardado: () => void;
}) {
  const { data: doctores, mutate: recargarDoctores } = useSWR<DoctorOpcion[]>('/api/configuracion/doctores', obtener, { revalidateOnFocus: false });
  const { data: roles } = useSWR<RolOpcion[]>('/api/cirugias/roles', obtener, { revalidateOnFocus: false });
  const { data: personalCat, mutate: recargarPersonal } = useSWR<PersonalOpcion[]>('/api/catalogos/personal-clinico', obtener, { revalidateOnFocus: false });

  const personalActivo = (personalCat ?? []).filter((p) => p.activo !== false);
  const [medicos, setMedicos] = useState<MedicoFila[]>(() =>
    participantes.map((p) => ({ key: p.id, medico_id: p.medico_id, rol_id: p.rol_id, hora_inicio: aHHMM(p.hora_inicio), hora_fin: aHHMM(p.hora_fin) }))
  );
  const [apoyo, setApoyo] = useState<PersonalFila[]>(() =>
    personal.map((p) => ({
      key: p.id,
      rol: p.rol,
      // El detalle guarda el nombre, no el id: se resuelve con el catálogo (ver efecto abajo).
      personal_id: '',
      nombre: p.nombre,
      hora_inicio: aHHMM(p.hora_inicio),
      hora_fin: aHHMM(p.hora_fin),
    }))
  );
  // Cuando carga el catálogo, se resuelve el id de cada persona de apoyo por su nombre.
  useEffect(() => {
    if (!personalCat) return;
    setApoyo((prev) =>
      prev.map((a) => (a.personal_id || !a.nombre ? a : { ...a, personal_id: personalCat.find((c) => c.nombre === a.nombre)?.id ?? '' }))
    );
  }, [personalCat]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [nuevoMedico, setNuevoMedico] = useState<{ alias: string; tipo: string } | null>(null);
  const [nuevaPersona, setNuevaPersona] = useState<{ nombre: string; rol: string } | null>(null);

  const crearMedico = async () => {
    if (!nuevoMedico || !nuevoMedico.alias.trim()) return;
    try {
      const creado = await enviarJSON<{ id: string }>('/api/configuracion/doctores', 'POST', {
        alias: nuevoMedico.alias.trim(),
        tipo_personal: nuevoMedico.tipo,
      });
      await recargarDoctores();
      setMedicos((prev) => [...prev, { key: `nuevo-${creado.id}`, medico_id: creado.id, rol_id: '', hora_inicio: '', hora_fin: '' }]);
      setNuevoMedico(null);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo dar de alta el médico'));
    }
  };

  const crearPersona = async () => {
    if (!nuevaPersona || !nuevaPersona.nombre.trim()) return;
    try {
      const creada = await enviarJSON<{ id: string }>('/api/configuracion/personal-clinico', 'POST', {
        nombre: nuevaPersona.nombre.trim(),
        rol_principal: nuevaPersona.rol,
      });
      await recargarPersonal();
      setApoyo((prev) => [...prev, { key: `nuevo-${creada.id}`, rol: nuevaPersona.rol, personal_id: creada.id, hora_inicio: '', hora_fin: '' }]);
      setNuevaPersona(null);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo dar de alta a la persona'));
    }
  };

  const guardar = async () => {
    setError(null);
    setMensaje(null);
    const medicosValidos = medicos.filter((m) => m.medico_id && m.rol_id);
    if (medicosValidos.length === 0) return setError('Debe quedar al menos un médico con rol');
    if (medicos.some((m) => (m.medico_id && !m.rol_id) || (!m.medico_id && m.rol_id))) return setError('Cada médico necesita nombre y rol');
    const apoyoValidos = apoyo.filter((a) => a.personal_id || a.rol);
    if (apoyoValidos.some((a) => !a.personal_id || !a.rol || !a.hora_inicio || !a.hora_fin)) {
      return setError('Cada persona de apoyo necesita nombre, rol y horario');
    }
    if (medicosValidos.some((m) => (m.hora_inicio && !m.hora_fin) || (!m.hora_inicio && m.hora_fin))) {
      return setError('El horario de cada médico necesita inicio y fin, o dejarse vacío');
    }
    setGuardando(true);
    try {
      await enviarJSON(`/api/cirugias/${cirugiaId}/equipo`, 'PUT', {
        participantes: medicosValidos.map((m) => ({
          medico_id: m.medico_id,
          rol_id: m.rol_id,
          hora_inicio: m.hora_inicio || null,
          hora_fin: m.hora_fin || null,
        })),
        personal: apoyoValidos.map((a) => ({ rol: a.rol, personal_id: a.personal_id, hora_inicio: a.hora_inicio, hora_fin: a.hora_fin })),
      });
      setMensaje('Equipo guardado. La productividad se recalcula.');
      onGuardado();
    } catch (err) {
      const conflicto = err instanceof ApiError && err.status === 409;
      setError(conflicto ? mensajeDeError(err, 'Hay un conflicto de agenda con este equipo') : mensajeDeError(err, 'No se pudo guardar el equipo'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="sm:col-span-2 space-y-4 rounded-lg border border-line p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Equipo médico</p>

      <div className="space-y-2">
        {medicos.map((m) => (
          <div key={m.key} className="grid grid-cols-1 gap-2 rounded-lg bg-surface-2/40 p-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
            <select value={m.medico_id} onChange={(e) => setMedicos((prev) => prev.map((x) => (x.key === m.key ? { ...x, medico_id: e.target.value } : x)))} aria-label="Médico" className={inputCls}>
              <option value="">Médico…</option>
              {(doctores ?? []).map((d) => <option key={d.id} value={d.id}>{d.alias}</option>)}
            </select>
            <select value={m.rol_id} onChange={(e) => setMedicos((prev) => prev.map((x) => (x.key === m.key ? { ...x, rol_id: e.target.value } : x)))} aria-label="Rol del médico" className={inputCls}>
              <option value="">Rol…</option>
              {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.nombre || ETIQUETAS_ROL[r.clave] || r.clave}</option>)}
            </select>
            <input type="time" value={m.hora_inicio} onChange={(e) => setMedicos((prev) => prev.map((x) => (x.key === m.key ? { ...x, hora_inicio: e.target.value } : x)))} aria-label="Hora de inicio del médico" className={inputCls} />
            <input type="time" value={m.hora_fin} onChange={(e) => setMedicos((prev) => prev.map((x) => (x.key === m.key ? { ...x, hora_fin: e.target.value } : x)))} aria-label="Hora de fin del médico" className={inputCls} />
            <button type="button" onClick={() => setMedicos((prev) => prev.filter((x) => x.key !== m.key))} aria-label="Quitar médico" className="justify-self-start rounded p-1 text-muted hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setMedicos((prev) => [...prev, { key: `nuevo-${Date.now()}`, medico_id: '', rol_id: '', hora_inicio: '', hora_fin: '' }])} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-fg-2 hover:bg-surface-2">
          <Plus className="h-3.5 w-3.5" /> Agregar médico
        </button>
        {nuevoMedico ? (
          <div className="flex flex-wrap items-center gap-2">
            <input value={nuevoMedico.alias} onChange={(e) => setNuevoMedico({ ...nuevoMedico, alias: e.target.value })} placeholder="Alias (ej. DR PEREZ)" className={inputCls + ' w-44'} aria-label="Alias del nuevo médico" />
            <select value={nuevoMedico.tipo} onChange={(e) => setNuevoMedico({ ...nuevoMedico, tipo: e.target.value })} className={inputCls + ' w-40'} aria-label="Tipo de personal">
              <option value="MEDICO">Médico</option>
              <option value="ANESTESIOLOGO">Anestesiólogo</option>
              <option value="ENFERMERO">Enfermería</option>
            </select>
            <button type="button" onClick={crearMedico} className="rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-primary-700">Dar de alta</button>
            <button type="button" onClick={() => setNuevoMedico(null)} className="text-xs text-muted hover:text-fg">Cancelar</button>
          </div>
        ) : (
          <button type="button" onClick={() => setNuevoMedico({ alias: '', tipo: 'MEDICO' })} className="text-xs font-bold text-primary-600 hover:text-primary-700">+ Dar de alta un médico nuevo</button>
        )}
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Personal de apoyo</p>
        {apoyo.map((a) => (
          <div key={a.key} className="grid grid-cols-1 gap-2 rounded-lg bg-surface-2/40 p-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
            <select value={a.rol} onChange={(e) => setApoyo((prev) => prev.map((x) => (x.key === a.key ? { ...x, rol: e.target.value } : x)))} aria-label="Rol de apoyo" className={inputCls}>
              <option value="">Rol…</option>
              {ROLES_PERSONAL.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select value={a.personal_id} onChange={(e) => setApoyo((prev) => prev.map((x) => (x.key === a.key ? { ...x, personal_id: e.target.value } : x)))} aria-label="Persona de apoyo" className={inputCls}>
              <option value="">Persona…</option>
              {personalActivo.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <input type="time" value={a.hora_inicio} onChange={(e) => setApoyo((prev) => prev.map((x) => (x.key === a.key ? { ...x, hora_inicio: e.target.value } : x)))} aria-label="Hora de inicio de apoyo" className={inputCls} />
            <input type="time" value={a.hora_fin} onChange={(e) => setApoyo((prev) => prev.map((x) => (x.key === a.key ? { ...x, hora_fin: e.target.value } : x)))} aria-label="Hora de fin de apoyo" className={inputCls} />
            <button type="button" onClick={() => setApoyo((prev) => prev.filter((x) => x.key !== a.key))} aria-label="Quitar persona de apoyo" className="justify-self-start rounded p-1 text-muted hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setApoyo((prev) => [...prev, { key: `nuevo-${Date.now()}`, rol: '', personal_id: '', hora_inicio: '', hora_fin: '' }])} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-fg-2 hover:bg-surface-2">
            <Plus className="h-3.5 w-3.5" /> Agregar personal de apoyo
          </button>
          {nuevaPersona ? (
            <div className="flex flex-wrap items-center gap-2">
              <input value={nuevaPersona.nombre} onChange={(e) => setNuevaPersona({ ...nuevaPersona, nombre: e.target.value })} placeholder="Nombre completo" className={inputCls + ' w-48'} aria-label="Nombre de la nueva persona" />
              <select value={nuevaPersona.rol} onChange={(e) => setNuevaPersona({ ...nuevaPersona, rol: e.target.value })} className={inputCls + ' w-40'} aria-label="Rol de la nueva persona">
                <option value="instrumentista">Instrumentista</option>
                <option value="enfermero">Enfermero(a)</option>
                <option value="circulante">Circulante</option>
              </select>
              <button type="button" onClick={crearPersona} className="rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-primary-700">Dar de alta</button>
              <button type="button" onClick={() => setNuevaPersona(null)} className="text-xs text-muted hover:text-fg">Cancelar</button>
            </div>
          ) : (
            <button type="button" onClick={() => setNuevaPersona({ nombre: '', rol: 'instrumentista' })} className="text-xs font-bold text-primary-600 hover:text-primary-700">+ Dar de alta persona nueva</button>
          )}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-200">{error}</p>}
      {mensaje && <p className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{mensaje}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={guardar} disabled={guardando} className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
          {guardando ? 'Guardando equipo…' : 'Guardar equipo'}
        </button>
      </div>
    </div>
  );
}
