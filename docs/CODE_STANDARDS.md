# Estándares de Código — v2

## Convenciones generales

### Archivos
- Componentes React: `PascalCase.tsx` → `PatientCard.tsx`
- Utilidades: `camelCase.ts` → `formatDate.ts`
- Hooks: `useCamelCase.ts` → `useFetch.ts`
- API Routes: `route.ts` dentro de `app/api/[modulo]/`
- Migraciones: `YYYYMMDDN-Description.ts` en `src/migrations/`

### Carpetas
- Componentes: `kebab-case` → `inventario/`
- Rutas Next.js: `kebab-case` → `pacientes/`, `consultas/nueva/`

### Variables y funciones
- Variables: `camelCase` → `patientName`, `consultasCount`
- Funciones: `camelCase` → `getPatients()`, `consumirLIO()`
- Constantes: `SCREAMING_SNAKE_CASE` → `MAX_STOCK`, `API_TIMEOUT`
- Componentes: `PascalCase` → `PatientCard`, `LenteForm`
- Enums DB: `UPPER_SNAKE_CASE` → `PENDIENTE_PAGO`, `SALIDA_CIRUGIA`

## TypeScript

### Tipado estricto
```typescript
// ✅ Correcto
interface PacienteAPI {
  id: string;
  nombre_completo: string;
  aseguranza_id: string | null;
}

// ❌ Mal
const patient: any = { ... }
```

### Uso de interfaces vs types
- Interfaces para objetos y clases
- Types para unions, intersections y primitivos complejos

## React

### Componentes
```typescript
// Server Component (por defecto)
export default async function PatientsPage() {
  const patients = await getPatients();
  return <PatientList patients={patients} />;
}

// Client Component
'use client';
export function PatientCard({ patient }: { patient: PacienteAPI }) {
  return <div>{patient.nombre_completo}</div>;
}
```

### Autosave
```typescript
// Hook useAutosave con debounce
const { clearDraft } = useAutosave('mi-form', formData, 1500);
// clearDraft() al enviar exitosamente
```

## CSS/Tailwind

### Clases
- Usar utility classes de Tailwind
- Orden: layout → spacing → typography → colors → effects
- Dark mode: usar prefijos `dark:`

## API Routes

```typescript
// app/api/pacientes/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAuth, requireRole } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  
  const supabase = getSupabaseAdmin();
  const { data, error, count } = await supabase
    .from('pacientes')
    .select('id, nombre_completo, ...', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: errorTranslations[error.message] }, { status: 500 });
  }
  return NextResponse.json({ data: result, total: count, page, pageSize });
}
```

### Convenciones API
- **SELECT explícito**: Nunca `SELECT *`
- **Paginación**: Todas las listas usan `page` + `pageSize` con `range()`
- **errorTranslations**: Mapear errores de Supabase a mensajes en español
- **Zod**: Validar todos los inputs de entrada

## Autorización por Rol

### A nivel de servicio (no solo UI)
```typescript
// En cada endpoint, validar el alcance del doctor
if (auth.user.rol === 'doctor') {
  // Filtrar por session.doctor_id
  query = query.eq('doctor_id', session.doctor_id);
}
```

### Doctor-Jefe — Modo Focus
```typescript
// Si doctor_jefe tiene modo_focus activo, aplicar reglas de doctor normal
const userPrefs = JSON.parse(usuarios.preferencias || '{}');
if (userPrefs.modo_focus && auth.user.rol === 'doctor_jefe') {
  query = query.eq('doctor_id', session.doctor_id);
}
```

## Kardex (Inventario)

### Regla de oro
**NUNCA hacer UPDATE directo de stock.** Toda mutación de stock genera un movimiento en `inventario_movimientos`.

```typescript
// ✅ Correcto: consumirLIO() genera movimiento + actualiza stock
const result = await consumirLIO(inventarioItemId, cirugiaId, userId);

// ❌ Mal: UPDATE directo
await supabase.from('inventario_items').update({ stock: newStock }).eq('id', itemId);
```

### Tipos de movimiento
| Tipo | Uso |
|------|-----|
| ENTRADA | Compra, recepción |
| SALIDA | Venta, consumo |
| AJUSTE | Corrección de inventario |
| DEVOLUCION | Retorno por cancelación |
| SALIDA_CIRUGIA | Consumo por cirugía completada |

## Manejo de errores

```typescript
try {
  const result = await supabase.from('table').select(...);
  if (result.error) {
    return NextResponse.json(
      { error: errorTranslations[result.error.message] || 'Error interno del servidor' },
      { status: 500 }
    );
  }
  return NextResponse.json({ data: result.data });
} catch {
  return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
}
```

## Formateo de datos

### Fechas
- Almacenar en UTC en la base de datos
- Mostrar en timezone de México (America/Tijuana)

### Moneda
- Almacenar como DECIMAL(10,2)
- Formatear con `toLocaleString()`
- Mostrar símbolo de moneda

## Seguridad

- Nunca exponer API keys en cliente
- Usar variables de entorno
- Validar todos los inputs del servidor (Zod)
- Supabase RLS activo en todas las tablas
- Nunca commitear credenciales
