'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import {
  Stethoscope, Bell, LogOut, Mail, Calendar, Shield, Loader2,
  Camera, X, Sun, Moon, Palette,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import Avatar from '@/components/ui/Avatar';
import ClientDate from '@/components/ui/ClientDate';
import { logout } from '@/app/actions/auth';

interface DoctorInfo {
  especialidad: string | null;
  activo: boolean;
}

// react-image-crop solo se descarga al elegir una foto
const AvatarCropModal = dynamic(() => import('@/components/ui/AvatarCropModal'), { ssr: false });

const notifEventos = [
  { key: 'PAGO_HONORARIOS', label: 'Pago de honorarios', desc: 'Cuando se registre un pago' },
  { key: 'RECORDATORIO_CONSULTA', label: 'Recordatorio', desc: '10 min antes de una consulta' },
  { key: 'ASIGNACION_SERVICIO', label: 'Asignación', desc: 'Estudio o procedimiento asignado' },
  { key: 'PROXIMA_CIRUGIA', label: 'Próxima cirugía', desc: 'Cirugía programada' },
  { key: 'CANCELACION', label: 'Cancelaciones', desc: 'Consulta o cirugía cancelada' },
  { key: 'REAGENDADO', label: 'Reagendados', desc: 'Cita pospuesta o reagendada' },
];

/**
 * Selector Claro / Oscuro. Hasta el montaje no se conoce el tema (solo cliente):
 * se renderiza sin opción marcada para no romper la hidratación.
 */
function SelectorTema() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const actual = mounted ? resolvedTheme : null;

  const opciones = [
    { id: 'light', label: 'Claro', Icon: Sun },
    { id: 'dark', label: 'Oscuro', Icon: Moon },
  ] as const;

  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
      {opciones.map(({ id, label, Icon }) => {
        const activo = actual === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => setTheme(id)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              activo ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function MiPerfilPage() {
  const { user, loading: userLoading } = useUser();
  const { toast } = useToast();
  const avatar = useAvatarUpload(user?.id, toast);
  const [doctorInfo, setDoctorInfo] = useState<DoctorInfo | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (!user) return;

    if (user.doctor_id) {
      fetch(`/api/consultas?pageSize=1`)
        .then(() => {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          if (supabaseUrl) {
            fetch(`${supabaseUrl}/rest/v1/doctores?id=eq.${user.doctor_id}&select=especialidad,activo`, {
              headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
            }).then(r => r.json()).then(data => { if (data?.[0]) setDoctorInfo(data[0]); }).catch(() => {});
          }
        })
        .catch(() => {});
    }

    fetch('/api/notificaciones/preferencias')
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          const prefs: Record<string, boolean> = {};
          for (const p of data.data) prefs[p.tipo_evento] = p.activo;
          setNotifPrefs(prefs);
        }
      })
      .catch(() => {});
  }, [user]);

  const togglePref = useCallback(async (tipo: string) => {
    const next = !notifPrefs[tipo];
    setNotifPrefs((p) => ({ ...p, [tipo]: next }));
    try {
      await fetch('/api/notificaciones/preferencias', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferencias: [{ tipo_evento: tipo, canal: 'IN_APP', activo: next }] }),
      });
    } catch {
      setNotifPrefs((p) => ({ ...p, [tipo]: !next }));
    }
  }, [notifPrefs]);

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!user) return null;

  const fotoActual = avatar.avatarPreview !== undefined ? avatar.avatarPreview : user.avatar_url;

  return (
    <div className="mx-auto max-w-[600px] space-y-5">
      {/* Profile Header */}
      <div className="rounded-2xl border border-line bg-surface p-6 flex items-center gap-4">
        <input
          ref={avatar.fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={avatar.onFileChange}
        />
        <button
          type="button"
          onClick={avatar.abrirSelector}
          disabled={avatar.uploading}
          aria-label="Cambiar foto de perfil"
          className="relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60"
        >
          <Avatar
            key={fotoActual || 'sin-foto'}
            initials={user.iniciales}
            src={fotoActual}
            className="h-16 w-16 text-xl bg-primary-500"
          />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-primary-600 text-white shadow-sm">
            {avatar.uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          </span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-extrabold text-fg truncate">{user.nombre || user.email}</h1>
          <p className="text-sm text-muted">Doctor</p>
          {doctorInfo?.especialidad && (
            <p className="text-xs text-primary-500 font-medium mt-0.5">{doctorInfo.especialidad}</p>
          )}
          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              onClick={avatar.abrirSelector}
              disabled={avatar.uploading}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 disabled:opacity-50"
            >
              {fotoActual ? 'Cambiar foto' : 'Agregar foto'}
            </button>
            {fotoActual && (
              <button
                type="button"
                onClick={avatar.eliminar}
                disabled={avatar.uploading}
                className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
                Eliminar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Info del doctor */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-line/70">
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-muted">Información</h2>
        </div>
        <div className="divide-y divide-line/60">
          <div className="flex items-center gap-3 px-5 py-3.5">
            <Mail className="h-4 w-4 text-muted shrink-0" />
            <span className="text-sm text-fg-2 truncate">{user.email}</span>
          </div>
          <div className="flex items-center gap-3 px-5 py-3.5">
            <Shield className="h-4 w-4 text-muted shrink-0" />
            <span className="text-sm text-fg-2">Doctor</span>
          </div>
          {doctorInfo && (
            <div className="flex items-center gap-3 px-5 py-3.5">
              <Stethoscope className="h-4 w-4 text-muted shrink-0" />
              <span className="text-sm text-fg-2">{doctorInfo.especialidad || 'Sin especialidad'}</span>
              <span className={`ml-auto h-2 w-2 rounded-full ${doctorInfo.activo ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            </div>
          )}
          <div className="flex items-center gap-3 px-5 py-3.5">
            <Calendar className="h-4 w-4 text-muted shrink-0" />
            <span className="text-sm text-fg-2">
               Miembro desde <ClientDate date={user.created_at} options={{ month: 'long', year: 'numeric' }} />
            </span>
          </div>
        </div>
      </div>

      {/* Notificaciones */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-line/70 flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary-500" />
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-muted">Notificaciones</h2>
        </div>
        <div className="divide-y divide-line/60">
          {notifEventos.map((item) => (
            <div key={item.key} className="flex items-center justify-between px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{item.label}</p>
                <p className="text-xs text-muted">{item.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!notifPrefs[item.key]}
                aria-label={item.label}
                onClick={() => togglePref(item.key)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${notifPrefs[item.key] ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                {/* translate-x-5.5 no existe en Tailwind: la bolita se quedaba siempre a la izquierda */}
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${notifPrefs[item.key] ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Apariencia */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-line/70 flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary-500" />
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-muted">Apariencia</h2>
        </div>
        <div className="px-5 py-4">
          <SelectorTema />
        </div>
      </div>

      {/* Acciones */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        <div className="divide-y divide-line/60">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-2 transition-colors"
          >
            <LogOut className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-600 dark:text-red-400">Cerrar sesión</span>
          </button>
        </div>
      </div>

      {/* Se monta solo al abrirse: así react-image-crop no se descarga al entrar al perfil */}
      {avatar.cropModal.isOpen && <AvatarCropModal {...avatar.cropModal} />}

      {/* Logout Confirm */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-surface rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-fg">Cerrar sesión</h3>
            <p className="text-sm text-muted mt-2">¿Estás seguro que deseas cerrar sesión?</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-fg-2">Cancelar</button>
              <form action={logout} className="flex-1">
                <button type="submit" className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">Cerrar</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
