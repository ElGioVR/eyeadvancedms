# Contexto para Asistentes de IA

## Proyecto

EyeAdvanced Medical Solutions - Sistema de gestión clínica oftalmológica.

## Stack tecnológico

- Next.js 14 (App Router)
- React 18
- TypeScript 5
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- TypeORM
- Vercel (deploy)

## Reglas importantes

1. **NO usar `any`** - Siempre tipar variables y parámetros
2. **NO crear archivos de documentación** - Solo si el usuario lo pide
3. **NO agregar comentarios** - Solo si el usuario lo pide
4. **SEGUIR la estructura existente** - No crear patrones nuevos
5. **USAR las utilidades existentes** - Verificar en `lib/` antes de crear
6. **MANTENER consistencia** - Seguir el estilo del código existente

## Estructura de carpetas

```
src/
├── app/              # Rutas y páginas (App Router)
│   ├── (auth)/       # Rutas de autenticación (layout sin sidebar)
│   └── (dashboard)/  # Rutas del dashboard (layout con sidebar)
├── components/       # Componentes React
│   ├── ui/           # Componentes genéricos (Button, Input, Card)
│   ├── layout/       # Sidebar, TopBar, etc.
│   ├── dashboard/    # Componentes del dashboard
│   ├── patients/     # Componentes de pacientes
│   ├── inventory/    # Componentes de inventario
│   └── consultations/# Componentes de consultas
├── entities/         # Entidades TypeORM (modelos de BD)
├── repositories/     # Repositorios TypeORM (queries)
├── services/         # Lógica de negocio
├── lib/              # Utilidades y configuración
│   └── supabase/     # Clientes de Supabase
├── hooks/            # Custom hooks de React
├── types/            # Tipos TypeScript compartidos
└── config/           # Configuración general
```

## Entidades principales

- `Usuario` - Usuarios del sistema con roles
- `Doctor` - Doctores de la clínica
- `Paciente` - Pacientes registrados
- `Consulta` - Consultas médicas realizadas
- `Cobro` - Cobros y facturación
- `Aseguranza` - Aseguranzas médicas
- `Lente` - Inventario de lentes con grados
- `CategoriaLente` - Categorías de lentes
- `Proveedor` - Proveedores de lentes
- `LenteXConsulta` - Relación lente-consulta

## Colores del sistema

```typescript
const colors = {
  primary: '#1b4d7a',    // Azul médico profundo
  secondary: '#2e86c1',  // Azul claro
  accent: '#00b4d8',     // Azul cristalino
  success: '#27ae60',    // Verde
  warning: '#f39c12',    // Naranja
  error: '#e74c3c',      // Rojo
  background: '#f8f9fa', // Fondo claro
  text: '#2c3e50',       // Texto principal
  textLight: '#7f8c8d',  // Texto secundario
};
```

## Roles de usuario

| Rol | Permisos |
|-----|----------|
| admin | Todo: config, usuarios, reportes, inventario completo |
| doctor | Ver pacientes, crear consultas, recetar lentes, ver historial |
| recepcionista | Agendar citas, cobrar, consultar inventario básico |

## Base de datos

- **Proveedor:** Supabase (PostgreSQL)
- **ORM:** TypeORM
- **Auth:** Supabase Auth con JWT
- **UUID:** Todas las tablas usan UUID como primary key

## Formato de datos

### Lentes (grados)
- Esférico: -20.00 a +20.00 (formato: `±XX.XX`)
- Cilíndrico: 0 a -6.00
- Eje: 0° a 180°

### Moneda
- Almacenar en DECIMAL(10,2)
- Mostrar con formato `$X,XXX.XX MXN`

### Fechas
- Almacenar en UTC
- Mostrar en timezone de México (America/Tijuana)

## API Routes

```
GET    /api/pacientes          - Listar pacientes
POST   /api/pacientes          - Crear paciente
GET    /api/pacientes/[id]     - Obtener paciente
PUT    /api/pacientes/[id]     - Actualizar paciente
DELETE /api/pacientes/[id]     - Eliminar paciente

GET    /api/consultas          - Listar consultas
POST   /api/consultas          - Crear consulta
GET    /api/consultas/[id]     - Obtener consulta

GET    /api/inventario         - Listar lentes
POST   /api/inventario         - Crear lente
PUT    /api/inventario/[id]    - Actualizar lente
GET    /api/inventario/scan    - Buscar por código de barras
```

## Dependencias clave

| Paquete | Uso |
|---------|-----|
| `next` | Framework React |
| `react` | UI library |
| `@supabase/supabase-js` | Cliente Supabase |
| `typeorm` | ORM para PostgreSQL |
| `zod` | Validación de schemas |
| `tailwindcss` | CSS utility-first |
| `lucide-react` | Iconos |
| `date-fns` | Manejo de fechas |
| `react-hook-form` | Formularios |
| `@tanstack/react-table` | Tablas de datos |
| `recharts` | Gráficas |

## Errores comunes a evitar

1. No usar `fetch` directo - Usar el cliente Supabase
2. No crear queries SQL crudas - Usar TypeORM repository
3. No hardcodear colores - Usar la paleta definida
4. No crear componentes monolíticos - Dividir en componentes pequeños
5. No ignorar errores - Siempre usar try/catch
6. No mutable state - Usar spread operator o immutable updates
