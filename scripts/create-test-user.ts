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

async function createTestUser() {
  const email = 'test-doctor@eyeadvancedms.com';
  const password = 'TestDoctor123!';
  
  console.log('Creating test user:', email);
  
  // Check if user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers.users.find(u => u.email === email);
  
  if (existing) {
    console.log('User already exists:', existing.id);
    return existing;
  }
  
  // Create new user
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      nombre_completo: 'Doctor Test',
      rol: 'doctor'
    }
  });
  
  if (error) {
    console.error('Error creating user:', error);
    return null;
  }
  
  console.log('User created:', data.user?.id);
  return data.user;
}

createTestUser().catch(console.error);