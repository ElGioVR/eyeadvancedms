import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { invalidarPerfil, requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations } from '@/lib/supabase/errors';
import { leerJSON } from '@/lib/api/validar';
import { idDeQuery } from '@/lib/api/configuracion';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ruta } from '@/lib/api/ruta';

function esUrlStoragePropio(v: string): boolean {
  try {
    const url = new URL(v);
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.local');
    return url.protocol === 'https:' && url.host === base.host && url.pathname.startsWith('/storage/v1/');
  } catch {
    return false;
  }
}

const usuarioCreateSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72),
  nombre: z.string().trim().min(1).max(255),
  rol: z.enum(['admin', 'doctor', 'recepcionista', 'enfermero']),
}).strict();

const usuarioUpdateSchema = z.object({
  id: z.string().uuid(),
  email: z.string().trim().email().max(255).optional(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72).optional(),
  // Obligatoria cuando el propio usuario cambia su contraseña (autoservicio)
  password_actual: z.string().min(1).max(128).optional(),
  nombre: z.string().trim().min(1).max(255).optional(),
  rol: z.enum(['admin', 'doctor', 'recepcionista', 'enfermero']).optional(),
  activo: z.boolean().optional(),
  // Solo URLs https del Storage del propio proyecto (evita rastreo / contenido externo)
  avatar_url: z
    .string()
    .max(2048)
    .refine((v) => v === '' || esUrlStoragePropio(v), 'URL de avatar no válida')
    .optional()
    .nullable(),
}).strict();

async function checkLastAdmin(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
): Promise<NextResponse | null> {
  // Usuario objetivo y conteo de admins activos en paralelo (antes: en serie)
  const [{ data: target, error: targetError }, { count, error: countError }] = await Promise.all([
    supabase
      .from('usuarios')
      .select('rol, activo')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('rol', 'admin')
      .eq('activo', true),
  ]);

  if (targetError) {
    return NextResponse.json({ error: 'No se pudo verificar el estado de administradores' }, { status: 500 });
  }

  if (target?.rol === 'admin' && target.activo === true) {
    if (countError || count === null) {
      return NextResponse.json({ error: 'No se pudo verificar el estado de administradores' }, { status: 500 });
    }

    if (count <= 1) {
      return NextResponse.json({ error: 'No puedes desactivar al último administrador' }, { status: 409 });
    }
  }

  return null;
}

/**
 * Verifica la contraseña actual con un cliente anónimo que NO persiste sesión
 * (no toca las cookies de la sesión en curso).
 */
async function passwordActualValida(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;
  try {
    const cliente = createSupabaseClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await cliente.auth.signInWithPassword({ email, password });
    const ok = !error && !!data.user;
    // Revoca la sesión auxiliar recién creada (no afecta la sesión del navegador)
    if (ok) void cliente.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return ok;
  } catch {
    return false;
  }
}

async function manejarGET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  // Usuarios de Auth y perfiles activos en paralelo (antes: en serie).
  // listUsers pagina de 50 en 50 por defecto: se pide una página amplia.
  const [{ data: authUsers, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase
      .from('usuarios')
      .select('id, nombre, rol, activo')
      .eq('activo', true)
      .limit(1000),
  ]);
  if (authError) {
    console.error('[configuracion.usuarios.listar] auth', authError.message);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
  if (profileError) {
    console.error('[configuracion.usuarios.listar] perfiles', profileError.message);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  // Merge auth users with active profiles only
  const profilesMap = new Map((profiles || []).map((p) => [p.id, p]));
  const result = authUsers.users
    .filter((u) => profilesMap.has(u.id))
    .map((u) => {
      const profile = profilesMap.get(u.id)!;
      return {
        id: u.id,
        email: u.email || '',
        nombre: profile.nombre,
        rol: profile.rol,
        activo: profile.activo,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
      };
    });

  return NextResponse.json(result);
}

async function manejarPOST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const data = await leerJSON(request, usuarioCreateSchema, { maxBytes: 16_000 });
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();

  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      nombre: data.nombre,
      rol: data.rol,
    },
  });

  if (authError) {
    return NextResponse.json({ error: errorTranslations[authError.message] || 'Error interno del servidor' }, { status: 500 });
  }

  // 2. Insert profile in usuarios table (best effort — auth user is already created)
  const { error: profileError } = await supabase
    .from('usuarios')
    .insert({
      id: authData.user.id,
      email: data.email,
      password_hash: 'managed_by_supabase_auth',
      nombre: data.nombre,
      rol: data.rol,
      activo: true,
    });

  if (profileError) {
    // Sin perfil el usuario no puede operar (requireAuth no encuentra rol) y el
    // correo quedaría ocupado: se revierte el alta en Auth y se informa el error.
    console.error('[configuracion.usuarios.crear] perfil', profileError.message);
    await supabase.auth.admin.deleteUser(authData.user.id).catch(() => undefined);
    return NextResponse.json(
      { error: errorTranslations[profileError.message] || 'No se pudo crear el perfil del usuario' },
      { status: 500 },
    );
  }

  // 3. Los doctores NO se crean automáticamente al crear un usuario.
  // El vínculo usuario↔doctor se gestiona desde la ficha del doctor
  // (Configuración → Doctores → Vincular usuario), aceptando roles
  // doctor o administrador.
  const doctorId: string | null = null;

  return NextResponse.json({
    id: authData.user.id,
    email: data.email,
    nombre: data.nombre,
    rol: data.rol,
    activo: true,
    doctor_id: doctorId,
  }, { status: 201 });
}

async function manejarPATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const data = await leerJSON(request, usuarioUpdateSchema, { maxBytes: 16_000 });
  if (data instanceof NextResponse) return data;

  const supabase = getSupabaseAdmin();
  const { id, password_actual: passwordActual, ...updates } = data;
  const isSelfService = id === auth.user.id;
  const hasAdministrativeFields = ['email', 'rol', 'activo'].some((field) => field in data);

  if (isSelfService && !hasAdministrativeFields) {
    const invalidFields = Object.keys(data).filter(
      (field) => !['id', 'nombre', 'password', 'password_actual', 'avatar_url'].includes(field),
    );
    if (invalidFields.length > 0) {
      return NextResponse.json({ error: 'Solo puedes actualizar nombre y password' }, { status: 400 });
    }
  } else {
    const roleError = await requireRole(auth.user, ['admin']);
    if (roleError) return roleError;

    if (isSelfService && updates.rol) {
      return NextResponse.json({ error: 'No puedes cambiar tu propio rol' }, { status: 409 });
    }
  }

  // Autoservicio: cambiar la propia contraseña exige la actual (una sesión
  // robada/abierta no basta). Un admin cambiando la de OTRO usuario no la necesita.
  if (isSelfService && updates.password) {
    const emailActual = auth.user.email || auth.perfil?.email;
    if (!passwordActual || !emailActual || !(await passwordActualValida(emailActual, passwordActual))) {
      return NextResponse.json({ error: 'La contraseña actual no es correcta' }, { status: 400 });
    }
  }

  if (updates.activo === false) {
    const lastAdminError = await checkLastAdmin(supabase, id);
    if (lastAdminError) return lastAdminError;
  }

  // 1. Auth: metadata, email y contraseña en UNA sola llamada (antes: dos)
  const authUpdates: { user_metadata?: Record<string, unknown>; email?: string; password?: string } = {};
  if (updates.nombre) authUpdates.user_metadata = { ...authUpdates.user_metadata, nombre: updates.nombre };
  if (updates.rol) authUpdates.user_metadata = { ...authUpdates.user_metadata, rol: updates.rol };
  if (updates.email) authUpdates.email = updates.email;
  if (updates.password) authUpdates.password = updates.password;

  if (Object.keys(authUpdates).length > 0) {
    const { error: authError } = await supabase.auth.admin.updateUserById(id, authUpdates);
    if (authError) {
      return NextResponse.json({ error: errorTranslations[authError.message] || 'Error interno del servidor' }, { status: 500 });
    }
  }

  // 2. Update profile
  const profileUpdates: Record<string, unknown> = {};
  if (updates.nombre) profileUpdates.nombre = updates.nombre;
  if (updates.rol) profileUpdates.rol = updates.rol;
  if (updates.email) profileUpdates.email = updates.email;
  if (updates.activo !== undefined) profileUpdates.activo = updates.activo;
  if (updates.avatar_url !== undefined) profileUpdates.avatar_url = updates.avatar_url || null;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await supabase
      .from('usuarios')
      .update(profileUpdates)
      .eq('id', id);
    if (profileError) {
      return NextResponse.json({ error: errorTranslations[profileError.message] || 'Error interno del servidor' }, { status: 500 });
    }
  }

  // Rol/estado/nombre cambian lo que autoriza cada request: olvidar la caché.
  // (El vínculo usuario↔doctor se gestiona desde Configuración → Doctores.)
  invalidarPerfil(id);

  return NextResponse.json({ success: true });
}

async function manejarDELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const id = idDeQuery(request, 'ID de usuario no válido');
  if (id instanceof NextResponse) return id;

  const supabase = getSupabaseAdmin();

  // Reuse last-admin protection (same as PATCH with activo=false)
  const lastAdminError = await checkLastAdmin(supabase, id);
  if (lastAdminError) return lastAdminError;

  // Soft-delete: deactivate instead of removing the row or Auth user
  const { error: updateError } = await supabase
    .from('usuarios')
    .update({ activo: false })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: errorTranslations[updateError.message] || 'Error interno del servidor' }, { status: 500 });
  }

  invalidarPerfil(id);
  return NextResponse.json({ success: true });
}

export const GET = ruta('configuracion/usuarios#GET', manejarGET);
export const POST = ruta('configuracion/usuarios#POST', manejarPOST);
export const PATCH = ruta('configuracion/usuarios#PATCH', manejarPATCH);
export const DELETE = ruta('configuracion/usuarios#DELETE', manejarDELETE);
