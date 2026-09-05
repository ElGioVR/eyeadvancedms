# Arquitectura del Sistema

## Visión general

Arquitectura monolito con Next.js App Router. Frontend y backend en el mismo proyecto, desplegado en Vercil.

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
│  │  │        TypeORM + Supabase      │  │  │
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
- Componentes React con Server Components y Client Components
- Tailwind CSS para estilos
- Layout con sidebar y topbar

### 2. API (`app/api/`)
- API Routes de Next.js
- Endpoints REST para CRUD
- Validación con Zod

### 3. Servicios (`services/`)
- Lógica de negocio
- Validaciones complejas
- Transformación de datos

### 4. Repositorios (`repositories/`)
- Consultas TypeORM
- Acceso a base de datos
- Abstracción de queries

### 5. Entidades (`entities/`)
- Modelos de datos TypeORM
- Relaciones entre tablas
- Decoradores de columnas

### 6. Datos (`lib/supabase/`)
- Cliente Supabase para browser
- Cliente Supabase para server
- Configuración de conexión

## Autenticación

```
Login → Supabase Auth → JWT Token → Middleware → Roles
```

Roles:
- `admin`: Acceso total
- `doctor`: Consultas, pacientes, inventario
- `recepcionista`: Citas, cobros, consulta inventario

## Flujo de datos

```
Usuario → Componente React → API Route → Service → Repository → TypeORM → Supabase → PostgreSQL
```

## Dependencias principales

| Paquete | Uso |
|---------|-----|
| next | Framework |
| react | UI |
| @supabase/supabase-js | Cliente Supabase |
| typeorm | ORM |
| zod | Validación |
| tailwindcss | Estilos |
| lucide-react | Iconos |
| date-fns | Fechas |
