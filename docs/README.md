# EyeAdvanced Medical Solutions - Sistema de Gestión Clínica

## Descripción

Sistema integral de gestión para clínica oftalmológica. Desarrollado con Next.js 14, Supabase y TypeScript.

## Módulos

| Módulo | Descripción |
|--------|-------------|
| Dashboard | Panel principal con métricas en tiempo real |
| Pacientes | CRUD, búsqueda, historial médico |
| Consultas | Registro con autocomplete, diagnósticos, procedimientos |
| Inventario | Lentes por grados, código de barras, alertas stock |
| Cobros | Aseguranzas, métodos de pago, ticket |
| Reportes | Estadísticas, gráficas, exportación PDF/Excel |
| Configuración | Usuarios, roles, doctores, catálogos |

## Stack

- **Frontend:** Next.js 14 (App Router) + React 18 + TypeScript
- **Estilos:** Tailwind CSS
- **Base de datos:** PostgreSQL (Supabase)
- **ORM:** TypeORM
- **Auth:** Supabase Auth
- **Deploy:** Vercel

## Inicio rápido

```bash
# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env.local

# Ejutar en desarrollo
npm run dev

# Build producción
npm run build
```

## Estructura

```
src/
├── app/              # App Router (rutas y páginas)
├── components/       # Componentes React reutilizables
├── entities/         # Entidades TypeORM
├── repositories/     # Repositorios TypeORM
├── services/         # Lógica de negocio
├── lib/              # Utilidades y configuración
├── hooks/            # Custom hooks de React
├── types/            # Tipos TypeScript
└── config/           # Configuración general
```

## Documentación

- [Arquitectura](./ARCHITECTURE.md)
- [Modelo de datos (ERD)](./ERD.md)
- [Estándares de código](./CODE_STANDARDS.md)
- [Contexto para IA](./AI_CONTEXT.md)
