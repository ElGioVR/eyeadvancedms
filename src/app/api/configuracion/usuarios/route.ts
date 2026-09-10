import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';
import { errorTranslations } from '@/lib/supabase/errors';
import { z } from 'zod';

const usuarioCreateSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6),
  nombre: z.string().min(1).max(255),
  rol: z.enum(['admin', 'doctor', 'recepcionista']),
}).strict();

const usuarioUpdateSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().max(255).optional(),
  password: z.string().min(6).optional(),
  nombre: z.string().min(1).max(255).optional(),
  rol: z.enum(['admin', 'doctor', 'recepcionista']).optional(),
  activo: z.boolean().optional(),
}).strict();

async function checkLastAdmin(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
): Promise<NextResponse | null> {
  const { data: target, error: targetError } = await supabase
    .from('usuarios')
    .select('rol, activo')
    .eq('id', userId)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ error: 'No se pudo verificar el estado de administradores' }, { status: 500 });
  }

  if (target?.rol === 'admin' && target.activo === true) {
    const { count, error: countError } = await supabase
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('rol', 'admin')
      .eq('activo', true);

    if (countError || count === null) {
      return NextResponse.json({ error: 'No se pudo verificar el estado de administradores' }, { status: 500 });
    }

    if (count === 1) {
      return NextResponse.json({ error: 'No puedes desactivar al último administrador' }, { status: 409 });
    }
  }

  return null;
}

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  // List auth users
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  // Get active local user profiles
  const { data: profiles, error: profileError } = await supabase
    .from('usuarios')
    .select('id, email, nombre, rol, activo, created_at, updated_at')
    .eq('activo', true);
  if (profileError) {
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

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = usuarioCreateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;

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
    console.error('Error al insertar perfil de usuario');
  }

  return NextResponse.json({
    id: authData.user.id,
    email: data.email,
    nombre: data.nombre,
    rol: data.rol,
    activo: true,
  }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const validation = usuarioUpdateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;
  const { id, ...updates } = data;
  const isSelfService = id === auth.user.id;
  const hasAdministrativeFields = ['email', 'rol', 'activo'].some((field) => field in body);

  if (isSelfService && !hasAdministrativeFields) {
    const invalidFields = Object.keys(body).filter((field) => !['id', 'nombre', 'password'].includes(field));
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

  if (updates.activo === false) {
    const lastAdminError = await checkLastAdmin(supabase, id);
    if (lastAdminError) return lastAdminError;
  }

  // 1. Update auth user metadata
  const authUpdates: Record<string, any> = {};
  if (updates.nombre) authUpdates.user_metadata = { ...authUpdates.user_metadata, nombre: updates.nombre };
  if (updates.rol) authUpdates.user_metadata = { ...authUpdates.user_metadata, rol: updates.rol };
  if (updates.email) authUpdates.email = updates.email;

  if (Object.keys(authUpdates).length > 0) {
    const { error: authError } = await supabase.auth.admin.updateUserById(id, authUpdates);
    if (authError) {
      return NextResponse.json({ error: errorTranslations[authError.message] || 'Error interno del servidor' }, { status: 500 });
    }
  }

  // 2. Update profile
  const profileUpdates: Record<string, any> = {};
  if (updates.nombre) profileUpdates.nombre = updates.nombre;
  if (updates.rol) profileUpdates.rol = updates.rol;
  if (updates.email) profileUpdates.email = updates.email;
  if (updates.activo !== undefined) profileUpdates.activo = updates.activo;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await supabase
      .from('usuarios')
      .update(profileUpdates)
      .eq('id', id);
    if (profileError) {
      return NextResponse.json({ error: errorTranslations[profileError.message] || 'Error interno del servidor' }, { status: 500 });
    }
  }

  // 3. Reset password if provided
  if (updates.password) {
    const { error: pwError } = await supabase.auth.admin.updateUserById(id, {
      password: updates.password,
    });
    if (pwError) {
      return NextResponse.json({ error: errorTranslations[pwError.message] || 'Error interno del servidor' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const roleError = await requireRole(auth.user, ['admin']);
  if (roleError) return roleError;

  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
  }

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

  return NextResponse.json({ success: true });
}
