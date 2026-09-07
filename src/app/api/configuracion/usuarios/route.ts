import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/server';
import { z } from 'zod';

const usuarioCreateSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6),
  nombre: z.string().min(1).max(255),
  rol: z.enum(['admin', 'doctor', 'recepcionista']),
});

const usuarioUpdateSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().max(255).optional(),
  password: z.string().min(6).optional(),
  nombre: z.string().min(1).max(255).optional(),
  rol: z.enum(['admin', 'doctor', 'recepcionista']).optional(),
  activo: z.boolean().optional(),
});

const errorTranslations: Record<string, string> = {
  'Unable to validate email address: invalid format': 'El formato del correo electrónico no es válido',
  'A user with this email address has already been registered': 'Ya existe un usuario con este correo electrónico',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
  'New password should be different from the old password': 'La nueva contraseña debe ser diferente a la anterior',
  'User not found': 'Usuario no encontrado',
  'Missing user ID': 'Falta el ID del usuario',
};

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();

  // List auth users
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // Get local user profiles
  const { data: profiles, error: profileError } = await supabase
    .from('usuarios')
    .select('*');
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Merge auth users with profiles
  const profilesMap = new Map((profiles || []).map((p) => [p.id, p]));
  const result = authUsers.users.map((u) => {
    const profile = profilesMap.get(u.id);
    return {
      id: u.id,
      email: u.email || '',
      nombre: profile?.nombre || u.user_metadata?.nombre || '',
      rol: profile?.rol || u.user_metadata?.rol || 'recepcionista',
      activo: profile?.activo ?? true,
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

  const supabase = getSupabaseAdmin();
  const body = await request.json();

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
    return NextResponse.json({ error: errorTranslations[authError.message] || authError.message }, { status: 500 });
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
    console.error('Profile insert error (auth user still created):', profileError.message);
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
  const body = await request.json();

  const validation = usuarioUpdateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json({ error: firstError?.message || 'Datos inválidos' }, { status: 400 });
  }

  const data = validation.data;
  const { id, ...updates } = data;

  // 1. Update auth user metadata
  const authUpdates: Record<string, any> = {};
  if (updates.nombre) authUpdates.user_metadata = { ...authUpdates.user_metadata, nombre: updates.nombre };
  if (updates.rol) authUpdates.user_metadata = { ...authUpdates.user_metadata, rol: updates.rol };
  if (updates.email) authUpdates.email = updates.email;

  if (Object.keys(authUpdates).length > 0) {
    const { error: authError } = await supabase.auth.admin.updateUserById(id, authUpdates);
    if (authError) {
      return NextResponse.json({ error: errorTranslations[authError.message] || authError.message }, { status: 500 });
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
      return NextResponse.json({ error: errorTranslations[profileError.message] || profileError.message }, { status: 500 });
    }
  }

  // 3. Reset password if provided
  if (updates.password) {
    const { error: pwError } = await supabase.auth.admin.updateUserById(id, {
      password: updates.password,
    });
    if (pwError) {
      return NextResponse.json({ error: errorTranslations[pwError.message] || pwError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
  }

  // 1. Delete from usuarios table
  const { error: profileError } = await supabase
    .from('usuarios')
    .delete()
    .eq('id', id);

  if (profileError) {
    return NextResponse.json({ error: errorTranslations[profileError.message] || profileError.message }, { status: 500 });
  }

  // 2. Delete auth user
  const { error: authError } = await supabase.auth.admin.deleteUser(id);
  if (authError) {
    return NextResponse.json({ error: errorTranslations[authError.message] || authError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
