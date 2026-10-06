import { NextResponse } from 'next/server';
import { invalidarDoctorDeUsuario } from '@/lib/auth-helpers';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { errorTranslations } from '@/lib/supabase/errors';
import { mensajeSeguro } from '@/lib/supabase/handle-error';
import { invalidarPerfil, requireAuth } from '@/lib/supabase/server';
import { leerJSON } from '@/lib/api/validar';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  // Perfil y vínculo doctor por usuario_id en paralelo (antes: 2-3 viajes en serie)
  const [perfilRes, doctorRes, authRes] = await Promise.all([
    supabase
      .from('usuarios')
      .select('id, email, nombre, rol, avatar_url, preferencias, activo')
      .eq('id', auth.user.id)
      .maybeSingle(),
    // Ficha de personal (médico o enfermería) con su bandera de honorarios;
    // si la BD aún no tiene esas columnas (mig. 390) se lee solo el id.
    (async () => {
      const r = await supabase
        .from('doctores')
        .select('id, tipo_personal, cobra_honorarios')
        .eq('usuario_id', auth.user.id)
        .maybeSingle();
      if (!r.error) return r as { data: { id: string; tipo_personal?: string; cobra_honorarios?: boolean } | null };
      return (await supabase.from('doctores').select('id').eq('usuario_id', auth.user.id).maybeSingle()) as {
        data: { id: string; tipo_personal?: string; cobra_honorarios?: boolean } | null;
      };
    })(),
    // Fechas de alta / último acceso (no vienen en el JWT); en paralelo
    supabase.auth.admin.getUserById(auth.user.id),
  ]);
  const { data, error } = perfilRes;

  if (error || !data) {
    return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });
  }
  if (data.activo === false) {
    return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 });
  }

  let doctor_id: string | null = null;
  if (data.rol === 'doctor' || data.rol === 'admin' || data.rol === 'enfermero') {
    if (doctorRes.data) {
      doctor_id = doctorRes.data.id;
    } else if (data.email) {
      // Fallback: coincidencia exacta por email (sin comodines de ILIKE)
      const emailEscapado = data.email.replace(/[\\%_]/g, (c: string) => `\\${c}`);
      const { data: doctorByEmail } = await supabase
        .from('doctores')
        .select('id')
        .ilike('email', emailEscapado)
        .is('usuario_id', null)
        .maybeSingle();

      if (doctorByEmail) {
        doctor_id = doctorByEmail.id;
        // Auto-vincula en servidor (solo doctores aún sin usuario)
        await supabase
          .from('doctores')
          .update({ usuario_id: auth.user.id })
          .eq('id', doctorByEmail.id)
          .is('usuario_id', null);
        invalidarDoctorDeUsuario(auth.user.id);
      }
    }
  }

  const { activo: _activo, ...perfil } = data;
  void _activo;
  return NextResponse.json({
    ...perfil,
    doctor_id,
    tipo_personal: doctorRes.data?.tipo_personal ?? (doctor_id ? 'MEDICO' : null),
    // Sin ficha de personal no hay honorarios propios que mostrar.
    cobra_honorarios: doctor_id ? doctorRes.data?.cobra_honorarios !== false : false,
    created_at: authRes.data?.user?.created_at ?? null,
    last_sign_in_at: authRes.data?.user?.last_sign_in_at ?? null,
    modo_focus: ((data.preferencias as Record<string, unknown> | null)?.modo_focus === true),
    iniciales: data.nombre
      ? data.nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
      : '?',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

// Preferencias permitidas (las claves desconocidas se ignoran en vez de corromper la config)
const preferenciasSchema = z.object({
  modo_focus: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  festividad: z.enum(['TOTAL', 'MEDIO', 'POCO', 'NADA']).optional(),
});

const patchSchema = z.object({
  preferencias: preferenciasSchema.optional(),
}).strict();

async function manejarPATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await leerJSON(request, patchSchema, { maxBytes: 8_000 });
  if (body instanceof NextResponse) return body;

  const update: Record<string, unknown> = {};

  if (body.preferencias) {
    const entradas = Object.entries(body.preferencias).filter(([, v]) => v !== undefined);
    if (entradas.length === 0) {
      return NextResponse.json({ error: 'Ninguna preferencia válida para actualizar' }, { status: 400 });
    }
    // Se relee de BD (no de la caché de sesión) para no pisar cambios recientes
    const supabase = getSupabaseAdmin();
    const { data: current, error: readError } = await supabase
      .from('usuarios')
      .select('preferencias')
      .eq('id', auth.user.id)
      .maybeSingle();
    if (readError) {
      return NextResponse.json({ error: mensajeSeguro(readError, 'usuarios.me.preferencias') }, { status: 500 });
    }

    const merged = {
      ...((current?.preferencias as Record<string, unknown>) ?? {}),
      ...Object.fromEntries(entradas),
    };
    update.preferencias = merged;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('usuarios')
    .update(update)
    .eq('id', auth.user.id);

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] || 'Error interno del servidor' }, { status: 500 });
  }

  invalidarPerfil(auth.user.id);
  return NextResponse.json({ ok: true });
}

export const GET = ruta('usuarios/me#GET', manejarGET);
export const PATCH = ruta('usuarios/me#PATCH', manejarPATCH);
