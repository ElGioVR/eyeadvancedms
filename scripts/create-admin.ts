import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nnbvjoktulbmonaxjiks.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYnZqb2t0dWxibW9uYXhqaWtzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODU2MzUxNiwiZXhwIjoyMTA0MTM5NTE2fQ.If0xVo8gYKNJj5F2zJf7IJyDBEZMRu31wGPhzKX79so';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('🔧 Creando usuario admin...\n');

  // 1. Create user in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: 'admin@eyeadvanced.com',
    password: 'Admin123!',
    email_confirm: true,
  });

  if (authError) {
    console.error('❌ Error creando usuario en Auth:', authError.message);
    // Try to get existing user
    const { data: users } = await supabase.auth.admin.listUsers();
    const existing = users?.users?.find(u => u.email === 'admin@eyeadvanced.com');
    if (existing) {
      console.log('✅ Usuario ya existe en Auth:', existing.id);
      await createProfile(existing.id);
    }
    return;
  }

  console.log('✅ Usuario creado en Auth:', authData.user.id);
  await createProfile(authData.user.id);
}

async function createProfile(userId: string) {
  // 2. Create profile in usuarios table
  const { error: profileError } = await supabase
    .from('usuarios')
    .upsert({
      id: userId,
      email: 'admin@eyeadvanced.com',
      password_hash: '$2b$10$placeholder',
      nombre: 'Administrador',
      rol: 'admin',
      activo: true,
    });

  if (profileError) {
    console.error('❌ Error creando perfil:', profileError.message);
  } else {
    console.log('✅ Perfil creado en usuarios table');
  }

  console.log('\n📋 Credenciales:');
  console.log('   Email: admin@eyeadvanced.com');
  console.log('   Password: Admin123!');
}

main().catch(console.error);
