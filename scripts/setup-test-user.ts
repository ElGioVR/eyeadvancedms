import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    const envVars: Record<string, string> = {};
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          envVars[key] = value;
        }
      }
    });
    return envVars;
  } catch (error) {
    console.error('Error al cargar .env.local:', error);
    return {};
  }
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function setupTestUser() {
  const email = 'test-doctor@eyeadvancedms.com';
  const password = 'TestDoctor123!';
  
  console.log('Setting up test user:', email);
  
  // Get the auth user
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const authUser = users.find(u => u.email === email);
  
  if (!authUser) {
    console.log('Creating auth user...');
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        alias: 'Doctor Test',
        rol: 'doctor'
      }
    });
    if (error) {
      console.error('Error creating auth user:', error);
      return;
    }
    console.log('Auth user created:', data.user?.id);
  } else {
    console.log('Auth user exists:', authUser.id);
  }
  
  // Create or update usuarios table record
  const userId = authUser?.id || (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === email)?.id;
  
  if (userId) {
    const { error } = await supabase
      .from('usuarios')
      .upsert({
        id: userId,
        alias: 'Doctor Test',
        email: email,
        rol: 'doctor',
        activo: true,
        telefono: null,
        
      }, { onConflict: 'id' });
    
    if (error) {
      console.error('Error upserting usuario:', error);
    } else {
      console.log('Usuario record created/updated');
    }
  }
  
  console.log('Test user setup complete');
  console.log('Email:', email);
  console.log('Password: TestDoctor123!');
}

setupTestUser().catch(console.error);