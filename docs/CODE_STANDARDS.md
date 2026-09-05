# Estándares de Código

## Convenciones generales

### Archivos
- Componentes React: `PascalCase.tsx` → `PatientCard.tsx`
- Utilidades: `camelCase.ts` → `formatDate.ts`
- Entidades: `PascalCase.entity.ts` → `Patient.entity.ts`
- Repositorios: `PascalCase.repository.ts` → `Patient.repository.ts`
- Servicios: `PascalCase.service.ts` → `Patient.service.ts`
- Tipos: `camelCase.types.ts` → `patient.types.ts`
- Hooks: `useCamelCase.ts` → `usePatients.ts`

### Carpetas
- Componentes: `kebab-case` → `patient-card/`
- Rutas Next.js: `kebab-case` → `pacientes/`, `nueva-consulta/`

### Variables y funciones
- Variables: `camelCase` → `patientName`, `consultasCount`
- Funciones: `camelCase` → `getPatients()`, `createConsulta()`
- Constantes: `SCREAMING_SNAKE_CASE` → `MAX_STOCK`, `API_TIMEOUT`
- Componentes: `PascalCase` → `PatientCard`, `DashboardStats`
- Enums: `PascalCase` con valores `UPPER_SNAKE_CASE`

## TypeScript

### Tipado estricto
```typescript
// ✅ Correcto
interface Patient {
  id: string;
  nombreCompleto: string;
  telefono: string;
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
export function PatientCard({ patient }: { patient: Patient }) {
  return <div>{patient.nombreCompleto}</div>;
}
```

### Props
- Usar interfaces para props
- Desestructurar en el parámetro
- No usar `any`

## CSS/Tailwind

### Clases
- Usar utility classes de Tailwind
- No crear CSS personalizado除非 es necesario
- Orden de clases: layout → spacing → typography → colors → effects

```tsx
// ✅ Correcto
<div className="flex items-center gap-4 p-4 bg-white rounded-lg shadow-sm">

// ❌ Mal
<div className="p-4 flex bg-white rounded shadow items-center gap-4">
```

## API Routes

```typescript
// app/api/pacientes/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Lógica
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  // Validar con Zod
  return NextResponse.json(result, { status: 201 });
}
```

## Manejo de errores

```typescript
try {
  const result = await service.create(data);
  return NextResponse.json(result);
} catch (error) {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
```

## Formateo de datos

### Fechas
- Usar `date-fns` para formateo
- Almacenar en UTC en la base de datos
- Mostrar en timezone local del usuario

### Moneda
- Almacenar como centavos o DECIMAL
- Formatear con `Intl.NumberFormat`
- Mostrar símbolo de moneda

## Seguridad

- Nunca exponer API keys en cliente
- Usar variables de entorno
- Validar todos los inputs del servidor
- Sanitizar datos de usuario
- Usar HTTPS siempre
