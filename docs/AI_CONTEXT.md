# Contexto para Asistentes de IA — v2

## Proyecto

EyeAdvanced Medical Solutions - Sistema de gestión clínica oftalmológica. **En producción real.**

## Stack tecnológico

- Next.js 14 (App Router)
- React 18 + TypeScript 5
- Tailwind CSS (dark/light mode)
- Supabase (PostgreSQL + Auth)
- Vercel (deploy)

> **NO se usa TypeORM en runtime.** Solo para migraciones via `node scripts/run-migrations.js`. El data layer usa `getSupabaseAdmin()` + Zod en API routes.

## Reglas importantes

1. **NO usar `any`** - Siempre tipar variables y parámetros
2. **NO crear archivos de documentación** - Solo si el usuario lo pide
3. **NO agregar comentarios** - Solo si el usuario lo pide
4. **SEGUIR la estructura existente** - No crear patrones nuevos
5. **USAR las utilidades existentes** - Verificar en `lib/` antes de crear
6. **MANTENER consistencia** - Seguir el estilo del código existente
7. **SELECT explícito** - Nunca `SELECT *` en queries Supabase
8. **Paginación obligatoria** - Toda lista requiere page + pageSize
9. **RLS en todas las tablas** - Admin full access + rol-based policies
10. **Kardex: nunca UPDATE directo de stock** - Toda mutación genera movimiento

## Módulos del sistema

### Consultas
- CRUD completo con campos: doctor, paciente, fecha, tipo, diagnóstico, estudios, procedimientos
- **Estatus**: BORRADOR → PROCESADA → PENDIENTE_ESTUDIO/PENDIENTE_CIRUGIA → FINALIZADA
- **Estatus pago**: PENDIENTE_PAGO → PAGADO (columna independiente, dispara honorarios)
- **Método de pago**: EFECTIVO, TARJETA, TRANSFERENCIA, SEGURO, NO_APLICA
- **Detalle como página**: `app/consultas/[id]/page.tsx` con línea de tiempo de `consulta_historial`
- **Historial**: `consulta_historial` registra CAMBIO_ESTATUS, EDICION, CANCELACION, REAGENDADO, PAGADO, FINALIZADO
- **Autosave**: Borrador automático en localStorage (1.5s debounce)

### Inventario Dual
- **Dual**: LENTE_VISION (esf/cil/eje/material) y LENTE_INTRAOCULAR (potencia/tipo LIO/modelo)
- **Kardex**: `inventario_movimientos` registra ENTRADA, SALIDA, AJUSTE, DEVOLUCION, SALIDA_CIRUGIA
- **Filtros**: búsqueda, categoría, proveedor, stock, tipo
- **Disponible**: `/api/inventario/disponible` con filtro `?tipo=LENTE_INTRAOCULAR`

### Agenda / Cirugías
- Calendario con vistas día/semana/mes, drag-and-drop
- **LIO desde inventario**: dropdown que auto-rellena potencia/marca
- **Consumo automático**: al completar cirugía → descuenta 1 LIO (SALIDA_CIRUGIA)
- **Liberación**: al cancelar cirugía → devuelve 1 LIO (DEVOLUCION)
- **Import CSV/XLSX**: con mapeo de columnas

### Honorarios
- **Cálculo automático**: al agregar servicio con doctor ejecutor → genera honorario PENDIENTE
- **Liquidación**: doctor-jefe aprueba y paga (individual o lote)
- **Períodos**: SEMANAL, QUINCENAL, MENSUAL, CUSTOM
- **Métricas**: honorarios pendientes, pagados, ganancias libres

### Pacientes
- CRUD con aseguradora dinámica (FK → aseguranzas)
- Número de póliza y afiliación
- Filtro por aseguradora

### Aseguranzas / Tarifario
- Tipo: PRIVADA, CONVENIO, PARTICULAR
- Coberturas: porcentaje + copago fijo
- Vigencia: desde/hasta

### Dashboard
- Estadísticas generales
- Gráficas de consultas, honorarios, inventario

### Reportes
- Kardex por producto/proveedor/categoría
- Uso de inventario LIO
- Rentabilidad por aseguradora

## Estructura de carpetas

```
src/
├── app/
│   ├── (auth)/              # Login (layout sin sidebar)
│   ├── (dashboard)/         # Rutas protegidas (layout con sidebar)
│   │   ├── agenda/          # Cirugías/calendario
│   │   ├── consultas/       # Consultas médicas
│   │   ├── inventario/      # Inventario dual
│   │   ├── pacientes/       # Pacientes
│   │   ├── honorarios/      # Honorarios doctors
│   │   ├── cobros/          # (ELIMINADO - deprecated)
│   │   ├── configuracion/   # Settings
│   │   ├── reportes/        # Reportes
│   │   └── dashboard/       # Dashboard principal
│   └── api/                 # API routes
│       ├── agenda/
│       ├── consultas/
│       ├── inventario/
│       ├── pacientes/
│       ├── honorarios/
│       └── configuracion/
├── components/
│   ├── ui/                  # Button, Input, Card, etc.
│   ├── inventario/          # LenteForm, BarcodeScanner
│   └── layout/              # Sidebar, TopBar
├── hooks/                   # useFetch, useAutosave, useDebounce
├── lib/
│   ├── supabase/            # admin.ts, server.ts
│   ├── inventario.ts        # consumirLIO, liberarLIO
│   ├── dashboard-data.ts    # Dashboard queries
│   └── utils.ts             # cn(), formatters
├── migrations/              # TypeORM migrations (solo para migraciones)
├── types/                   # TypeScript interfaces
├── data/                    # Mock data (hardcoded)
└── scripts/                 # run-migrations.js
```

## Entidades principales (tablas DB)

- `usuarios` — Usuarios con roles y preferencias (JSONB)
- `doctores` — Doctores con periodo_pago y honorarios
- `pacientes` — Pacientes con aseguranza_id, póliza, afiliación
- `consultas` — Consultas con estatus, estatus_pago, metodo_pago
- `consulta_historial` — Historial de eventos de consulta
- `consulta_conceptos` — Conceptos de consulta (estudios/procedimientos)
- `aseguranzas` — Aseguradoras con tipo y vigencia
- `coberturas_aseguranza` — Coberturas por aseguradora
- `inventario_items` — Inventario dual (visión + intraocular)
- `inventario_movimientos` — Kardex
- `agenda_cirugias` — Cirugías/agenda con inventario_item_id
- `agenda_cirugia_doctores` — Doctores asignados a cirugía
- `tarifas_doctor` — Tarifas por doctor/concepto
- `periodos_pago` — Períodos de pago
- `eventos_honorario` — Honorarios devengados
- `liquidaciones_doctor` — Liquidaciones
- `notificaciones` — Notificaciones
- `notificacion_preferencias` — Preferencias de notificación
- `configuracion_sistema` — Config clave-valor

## Errores comunes a evitar

1. No usar `fetch` directo para DB - Usar `getSupabaseAdmin()`
2. No crear queries SQL crudas
3. No hardcodear colores - Usar la paleta del sistema
4. No crear componentes monolíticos
5. No ignorar errores - Siempre usar try/catch
6. No mutable state - Usar spread operator
7. No SELECT * - Siempre especificar columnas
8. No crear endpoints sin paginación
9. No hacer UPDATE directo de stock - Usar Kardex
10. No asumir que un archivo existe - Verificar con glob/grep primero
