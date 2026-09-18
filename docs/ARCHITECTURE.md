# Arquitectura del Sistema — v2

## Visión general

Arquitectura monolito con Next.js App Router. Frontend y backend en el mismo proyecto, desplegado en Vercel.

```
┌─────────────────────────────────────────────┐
│              VERCEL (Hosting)                │
│  ┌───────────────────────────────────────┐  │
│  │           NEXT.JS 14                  │  │
│  │                                       │  │
│  │  ┌─────────────┐  ┌───────────────┐  │  │
│  │  │  Frontend   │  │  API Routes   │  │  │
│  │  │  (React)    │  │  (Server)     │  │  │
│  │  └──────┬──────┘  └───────┬───────┘  │  │
│  │         │                 │           │  │
│  │  ┌──────┴─────────────────┴───────┐  │  │
│  │  │     Supabase Client (lib/)     │  │  │
│  │  └───────────────┬────────────────┘  │  │
│  └──────────────────┼───────────────────┘  │
└─────────────────────┼──────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│           SUPABASE (Cloud)                  │
│  ┌──────────────┐  ┌────────────────────┐  │
│  │  PostgreSQL   │  │  Auth + Storage    │  │
│  └──────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Capas

### 1. Presentación (`app/`, `components/`)
- React Server Components por defecto
- Client Components con `'use client'` solo cuando se necesita interactividad
- Tailwind CSS para estilos, dark/light mode completo
- Layout con sidebar + topbar
- **Detalle de consultas y cirugías: página completa** (`app/consultas/[id]/page.tsx`, `app/agenda/[id]/page.tsx`)

### 2. API (`app/api/`)
- API Routes de Next.js
- Endpoints REST para CRUD
- Validación con Zod
- **Autorización a nivel de servicio** (no solo UI): cada endpoint valida permisos del rol

### 3. Servicios (`lib/`)
- Lógica de negocio (ej: `lib/inventario.ts`, `lib/dashboard-data.ts`)
- Consumo de inventario (Kardex), cálculo de honorarios
- **Regla Kardex**: Nunca UPDATE directo de stock; toda mutación genera movimiento

### 4. Datos (`lib/supabase/`)
- `getSupabaseAdmin()` para queries admin (server-side)
- `getSupabaseBrowser()` para cliente-side
- Queries con select explícito (nunca `SELECT *`), paginación obligatoria

### 5. Hooks (`hooks/`)
- `useFetch` — data fetching con paginación
- `useAutosave` — borrador automático en localStorage
- `useDebounce` — debounce genérico

## Autenticación

```
Login → Supabase Auth → JWT Token → Middleware (lib/supabase/server.ts) → Roles
```

## Roles y Permisos

| Rol | Lectura | Escritura | Alcance |
|-----|---------|-----------|---------|
| `admin` | Todo | Todo | Global |
| `doctor` | Solo su información | Solo consultas propias | `session.doctor_id` |
| `recepcionista` | Todo | Agenda, pacientes, inventario | Global |
| `doctor_jefe` | Todo (como admin) | Todo como admin | **Modo focus**: toggle "Ver como: Todos / Solo mi información" |

### Doctor-Jefe — Modo Focus

El doctor-jefe tiene permisos de admin pero puede activar **modo focus** para verse solo a sí mismo (como un doctor normal). Persistido en `usuarios.preferencias.modo_focus` (localStorage).

- **focus=ON**: Todos los queries se filtran por `session.doctor_id`
- **focus=OFF**: Permisos completos (incl. pagar honorarios)

## Notificaciones

```
Servicio (Consultas/Agenda) → INSERT notificaciones → UI polls /notificaciones/unread-count
```

- Eventos por rol: doctor (pago honorarios, recordatorio, asignación), recepcionista (cirugía, cancelación, reagendado)
- Preferencias por usuario: `notificacion_preferencias` (tipo_evento, canal, activo)
- No usa triggers SQL; los servicios disparan las notificaciones

## Flujo de datos

```
Usuario → Componente React → API Route → Zod validation → Supabase client → PostgreSQL
```

## Homologación de nombres

| Concepto | Nombre canónico interno | Nombre de módulo/vista |
|----------|------------------------|----------------------|
| Cirugía | `agenda_cirugia` | "Agenda" |
| Consulta | `consulta` | "Consultas" |
| Lente de inventario | `inventario_item` | "Inventario" |

## Eliminado

| Módulo | Razón |
|--------|-------|
| Cobros (`/cobros`) | Pago se registra como `estatus_pago = PAGADO` desde detalle de consulta |
| Matriz de costos (Config) | Coberturas viven en `coberturas_aseguranza` |
| Honorarios en Config | Se mueve a detalle de doctor dentro del módulo Honorarios |

## Dependencias principales

| Paquete | Uso |
|---------|-----|
| next | Framework |
| react | UI |
| @supabase/supabase-js | Cliente Supabase |
| zod | Validación |
| tailwindcss | Estilos |
| lucide-react | Iconos |
| date-fns | Fechas |
| recharts | Gráficas |
