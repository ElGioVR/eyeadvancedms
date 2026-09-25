# Análisis de Implementación — Módulos Reporte, Honorarios y Productividad

> **Fecha:** 2026-09-23 · **Requisito:** Eliminar módulos Reporte y Honorarios, conservar Productividad (solo admin), distribuir honorarios por consultas/cirugías, agregar botón Sync y flujo de pagos.

---

## 1. Estado Actual del Sistema

### 1.1 Módulos existentes en la interfaz

| Módulo | Ruta UI | Ruta API | Sidebar | Roles permitidos |
|--------|---------|----------|---------|-----------------|
| **Reportes** | `/reportes` | `/api/reportes` | ✅ (todos) | admin, doctor, recepcionista |
| **Honorarios** | `/honorarios` | `/api/honorarios/*` | ✅ (todos) | admin, doctor, recepcionista |
| **Productividad** | `/productividad` | `/api/productividad` | ✅ (adminOnly) | **solo admin** |

### 1.2 Estructura de archivos por módulo

#### Módulo Reportes (ELIMINAR)
```
src/app/(dashboard)/reportes/page.tsx          — UI principal (PDF/Excel)
src/app/api/reportes/route.ts                   — API: datos de pacientes, consultas, financiero, inventario
```

#### Módulo Honorarios (ELIMINAR)
```
UI:
src/app/(dashboard)/honorarios/page.tsx          — Dashboard principal
src/app/(dashboard)/honorarios/tarifas/page.tsx   — Configuración de tarifas
src/app/(dashboard)/honorarios/periodos/page.tsx   — Gestión de períodos
src/app/(dashboard)/honorarios/liquidaciones/page.tsx — Liquidaciones
src/app/(dashboard)/honorarios/doctores/[id]/page.tsx — Perfil de doctor
src/app/(dashboard)/honorarios/reportes/page.tsx    — Reportes de honorarios
src/app/(dashboard)/honorarios/reportes/doctor/[id]/page.tsx — Reporte por doctor
src/app/(dashboard)/mis-honorarios/page.tsx        — Honorarios del doctor logueado

API:
src/app/api/honorarios/reportes/route.ts           — Reporte global
src/app/api/honorarios/reportes/doctor/[id]/route.ts — Reporte por doctor
src/app/api/honorarios/tarifas/route.ts            — CRUD tarifas
src/app/api/honorarios/periodos/route.ts            — CRUD períodos
src/app/api/honorarios/periodos/[id]/cerrar/route.ts — Cerrar período
src/app/api/honorarios/liquidaciones/route.ts       — Listar liquidaciones
src/app/api/honorarios/liquidaciones/[id]/aprobar/route.ts — Aprobar liquidación
src/app/api/honorarios/liquidaciones/[id]/exportar/route.ts — Exportar liquidación
src/app/api/honorarios/metricas/ranking/route.ts    — Ranking de doctores
src/app/api/honorarios/doctores/[id]/metricas/route.ts — Métricas de doctor
src/app/api/honorarios/doctores/[id]/eventos/route.ts — Eventos de honorario

Services:
src/services/honorarios/index.ts                   — Barrel export
src/services/honorarios/HonorariosService.ts       — Reportes, reversión
src/services/honorarios/MotorDevengoService.ts     — Motor de devengo
src/services/honorarios/CierrePeriodoService.ts    — Cierre de períodos
src/services/honorarios/MetricasDoctorService.ts   — Métricas
src/services/honorarios/ReversionService.ts        — Reversiones

Types:
src/types/honorarios.ts                            — Tipos compartidos

UI Components:
src/components/honorarios/FiltrosReporte.tsx       — Filtros (reutilizado en Productividad)
```

#### Módulo Productividad (CONSERVAR — solo admin)
```
UI:
src/app/(dashboard)/productividad/page.tsx          — Dashboard admin (5 tabs)

API:
src/app/api/productividad/route.ts                   — API unificada (honorarios, cirugías, entradas, estudios)

Lib:
src/lib/productividad/index.ts                       — Barrel
src/lib/productividad/cirugia.ts                     — Re-exporta productividad-cirugia
src/lib/productividad/resumen.ts                     — RPC productividad_honorarios_resumen
src/lib/productividad-cirugia.ts                     — Reglas de productividad de cirugía
```

---

## 2. Dependencias Críticas — Lo que NO se puede eliminar sin romper

### 2.1 Tablas que se usan en múltiples módulos

| Tabla | Usada por Reportes | Usada por Honorarios | Usada por Productividad | Acción |
|-------|--------------------|-----------------------|------------------------|--------|
| `eventos_honorario` | ❌ | ✅ (HonorariosService) | ✅ (productividad_honorarios_resumen RPC) | **MANTENER** |
| `tarifas_doctor` | ❌ | ✅ (tarifas CRUD) | ❌ | **MANTENER** (productividad las necesita indirectamente) |
| `cirugia_productividad` | ❌ | ❌ | ✅ (API productividad tab cirugias) | **MANTENER** |
| `reglas_productividad_cirugia` | ❌ | ❌ | ✅ (calculo de montos) | **MANTENER** |
| `periodos_pago` | ❌ | ✅ (cierre de períodos) | ❌ | **MANTENER** (productividad usa estado de eventos) |
| `liquidaciones_doctor` | ❌ | ✅ (aprobación/exportación) | ❌ | **MANTENER** (flujo de pagos) |
| `bitacora_honorarios` | ❌ | ✅ (auditoría) | ❌ | **MANTENER** |
| `consultas` | ✅ (reportes) | ✅ (MotorDevengoService) | ✅ (entradas_salidas tab) | **MANTENER** |
| `consulta_conceptos` | ✅ (reportes) | ✅ (MotorDevengoService) | ✅ (estudios tab) | **MANTENER** |
| `agenda_cirugias` | ❌ | ✅ (MotorDevengoService.generarDesdeCirugia) | ✅ (cirugias tab) | **MANTENER** |
| `cirugia_participantes` | ❌ | ❌ | ✅ (cirugias tab join) | **MANTENER** |
| `cobros` | ✅ (reportes) | ✅ (eventos_honorario referencia) | ❌ | **MANTENER** |

### 2.2 Dependencias de servicios cruzados

- `MotorDevengoService.generarDesdeCirugia()` → lee `agenda_cirugia_doctores`, `tarifas_doctor`, `aseguranza_servicios`, crea `eventos_honorario`
- `productividad_honorarios_resumen()` RPC → lee `eventos_honorario` + `cirugia_productividad` → **es llamado por API productividad**
- `HonorariosService.reporteGlobal()` → lee `eventos_honorario` → **será eliminado**
- `HonorariosService.reporteDoctor()` → lee `eventos_honorario` → **será eliminado**

---

## 3. Requisitos del Nuevo Productividad (Módulo Único)

### 3.1 Lo que debe hacer el nuevo módulo Productividad

| Funcionalidad | Estado Actual | Requisito Nuevo |
|---------------|---------------|-----------------|
| **Distribución de honorarios** | `MotorDevengoService` genera eventos desde consultas/cirugías, pero NO distribuye automáticamente honorarios por estudios y cirugías | **CADA consulta debe repartir honorarios a los doctores** por cada estudio y cirugía que contenga |
| **Botón Sync** | No existe | Buscar en consultas, cirugías, verificar relación consulta-cirugía, generar eventos de honorario si faltan |
| **Pagos** | Existe `liquidaciones_doctor` + `aprobar` pero solo en módulo honorarios que se elimina | **Migrar flujo de pagos a Productividad**: admin puede otorgar pagos en honorarios y reportes |
| **Visibilidad** | Ya es admin-only | Mantener como admin-only |
| **Reportes** | Módulo Reportes separado con datos clínicos/financieros | **Eliminar módulo Reportes**. Los reportes de honorarios deben integrarse en Productividad |

### 3.2 Flujo de honorarios por consulta (Requisito clave)

Actualmente, `MotorDevengoService.generarDesdeConsulta()`:
1. Lee `consulta_conceptos` (estudios, procedimientos, consultas)
2. Para cada concepto, busca tarifa por `doctor_id + tipo_concepto + concepto_id + rol`
3. Crea un `evento_honorario` por concepto

**Problema:** No todas las consultas generan eventos automáticamente. Se necesita un mecanismo que **garantice** que cada consulta con estudios o cirugías reparta honorarios.

### 3.3 Relación Consulta ↔ Cirugía

```
consulta (tiene consulta_conceptos con ESTUDIO/PROCEDIMIENTO)
  └── consulta_id en agenda_cirugias (nullable)
       └── cirugia_id en cirugia_productividad (por participante)
```

- Una cirugía puede tener una `consulta_id` (origen)
- La `consulta_conceptos` puede tener `consulta_origen_id` (referencia a consulta raíz para estudios derivados)
- El RPC `crear_cirugia` ya persiste `consulta_id` en `agenda_cirugias`

---

## 4. Diseño del Botón Sync

### 4.1 ¿Qué debe hacer Sync?

1. **Buscar en consultas**: Iterar todas las consultas del rango de fechas seleccionado
2. **Para cada consulta**: Verificar si existen `eventos_honorario` asociados
3. **Buscar en cirugías**: Iterar cirugías, verificar si existen eventos de honorario
4. **Verificar relación**: Si una cirugía tiene `consulta_id`, comprobar que:
   - La consulta origen ya tiene sus honorarios generados
   - La cirugía tiene sus honorarios generados para cada participante
   - No hay duplicidad (una cirugía = un conjunto de honorarios, no múltiples)
5. **Generar faltantes**: Si algún evento de honorario falta, invocar `MotorDevengoService` para crearlo

### 4.2 Lógica de detección de cirugía-relación

```
SI consulta.tiene(cirugia_id en agenda_cirugias):
  → La cirugía pertenece a esa consulta
  → Los honorarios de la cirugía son "un solo honorario" compartido por participante
  → NO crear eventos duplicados desde la consulta para conceptos que ya están en la cirugía

SI cirugia.consulta_id existe:
  → La cirugía surgió de una consulta
  → Verificar que el evento de honorario de la cirugía no se generó dos veces
```

### 4.3 Endpoint API propuesto

```
POST /api/productividad/sync
Body: { fecha_desde: string, fecha_hasta: string }
Response: { sincronizados: number, creados: number, errores: string[] }
```

---

## 5. Flujo de Pagos en Productividad

### 5.1 Estado Actual del Flujo de Pagos

```
eventos_honorario (estado: DEVENGADO/LIQUIDADO/PAGADO)
  └── periodos_pago (ABIERTO → EN_REVISION → CERRADO → PAGADO)
       └── liquidaciones_doctor (BORRADOR → PENDIENTE_APROBACION → APROBADA → PAGADA)
            └── aprobado_por (admin)
```

### 5.2 Lo que se necesita migrar

| Funcionalidad | Ubicación Actual | Nueva Ubicación |
|---------------|-----------------|-----------------|
| Listar liquidaciones | `/honorarios/liquidaciones` | `/productividad` (tab nueva) |
| Aprobar liquidación | `/api/honorarios/liquidaciones/[id]/aprobar` | `/api/productividad/liquidaciones/[id]/aprobar` |
| Cerrar período | `/honorarios/periodos` | `/productividad` (tab nueva) |
| Configurar tarifas | `/honorarios/tarifas` | `/productividad` (tab nueva) |
| Reportes de honorarios | `/honorarios/reportes` | `/productividad` (tab "Honorarios") |
| Pagar/otorgar pagos | `/honorarios/liquidaciones` | `/productividad` (acción en tabla) |

### 5.3 Tab de Pagos en Productividad

El módulo Productividad debe incluir una nueva pestaña **"Pagos"** que permita al administrador:

1. Ver liquidaciones pendientes de aprobación
2. Aprobar liquidaciones (cambiar estado a APROBADA)
3. Registrar pago (cambiar estado a PAGADO)
4. Ver historial de pagos por doctor
5. Filtrar por período, doctor, estado

---

## 6. Archivos a Eliminar / Migrar / Conservar

### 6.1 ELIMINAR (Reportes + Honorarios UI/API)

```
ARCHIVOS A ELIMINAR:
├── src/app/(dashboard)/reportes/page.tsx
├── src/app/api/reportes/route.ts
├── src/app/(dashboard)/honorarios/page.tsx
├── src/app/(dashboard)/honorarios/tarifas/page.tsx
├── src/app/(dashboard)/honorarios/periodos/page.tsx
├── src/app/(dashboard)/honorarios/liquidaciones/page.tsx
├── src/app/(dashboard)/honorarios/doctores/[id]/page.tsx
├── src/app/(dashboard)/honorarios/reportes/page.tsx
├── src/app/(dashboard)/honorarios/reportes/doctor/[id]/page.tsx
├── src/app/(dashboard)/mis-honorarios/page.tsx
├── src/app/api/honorarios/reportes/historico/route.ts
├── src/app/api/honorarios/reportes/route.ts
├── src/app/api/honorarios/reportes/doctor/[id]/route.ts
├── src/app/api/honorarios/tarifas/route.ts
├── src/app/api/honorarios/periodos/route.ts
├── src/app/api/honorarios/periodos/[id]/cerrar/route.ts
├── src/app/api/honorarios/liquidaciones/route.ts
├── src/app/api/honorarios/liquidaciones/[id]/aprobar/route.ts
├── src/app/api/honorarios/liquidaciones/[id]/exportar/route.ts
├── src/app/api/honorarios/metricas/ranking/route.ts
├── src/app/api/honorarios/doctores/[id]/metricas/route.ts
├── src/app/api/honorarios/doctores/[id]/eventos/route.ts
├── src/services/honorarios/HonorariosService.ts
├── src/services/honorarios/MetricasDoctorService.ts
├── src/services/honorarios/ReversionService.ts
├── src/services/honorarios/CierrePeriodoService.ts
├── src/types/honorarios.ts
└── src/components/honorarios/FiltrosReporte.tsx (reutilizar en productividad)
```

### ⚠️ CRÍTICO: MotorDevengoService tiene dependiente externo

`src/app/api/consultas/route.ts:6` importa `MotorDevengoService` desde `@/services/honorarios`. Esto significa que MotorDevengoService **NO puede eliminarse** ni moverse a una ruta diferente sin actualizar este import. Opciones:
- Opción A: Mover MotorDevengoService a `src/services/productividad/` y actualizar el import en `src/app/api/consultas/route.ts`
- Opción B: Mantener MotorDevengoService en `src/services/honorarios/` (la ruta se queda como legado)

**Recomendación: Opción A** (mover a productividad, actualizar import)

### 6.2 MANTENER y MODIFICAR (Productividad)

```
ARCHIVOS A MANTENER Y MODIFICAR:
├── src/app/(dashboard)/productividad/page.tsx          ← AGREGAR tabs: Pagos, Tarifas, Períodos, Sync
├── src/app/api/productividad/route.ts                   ← AGREGAR endpoints: sync, pagos, liquidaciones, tarifas
├── src/lib/productividad-cirugia.ts                     ← MANTENER
├── src/lib/productividad/resumen.ts                     ← MANTENER
├── src/services/honorarios/MotorDevengoService.ts       ← MOVER a src/services/productividad/ (tiene dependiente en consultas/route.ts)
├── src/services/honorarios/index.ts                     ← MODIFICAR (quitar exportaciones muertas; mantener solo MotorDevengoService si se mueve)
└── src/lib/productividad/index.ts                       ← MANTENER

ARCHIVO A CREAR:
├── src/services/productividad/index.ts                  ← NUEVO barrel export
└── src/components/productividad/FiltrosReporte.tsx      ← COPIA de src/components/honorarios/FiltrosReporte.tsx
```

### 6.3 MANTENER SIN MODIFICAR (Tablas y Servicios Base)

```
ARCHIVOS A MANTENER SIN MODIFICAR:
├── src/migrations/1800000000022-CreateEventosHonorarioTable.ts
├── src/migrations/1800000000020-CreateTarifasDoctorTable.ts
├── src/migrations/1800000000220-CreateReglasProductividadCirugia.ts
├── src/migrations/1800000000170-CreateCirugiaHomologadaTables.ts (contiene cirugia_productividad)
├── src/migrations/1800000000230-AddProductividadColumns.ts
├── src/migrations/1800000000240-CreateProductividadHonorariosResumen.ts
├── src/migrations/1800000000021-CreatePeriodosPagoTable.ts
├── src/migrations/180000000023-CreateLiquidacionesDoctorTable.ts
├── src/migrations/180000000024-CreateAjustesLiquidacionTable.ts
├── src/migrations/1800000000025-CreateBitacoraHonorariosTable.ts
├── src/migrations/1800000000160-CreateCrearConsultaRPC.ts
├── src/migrations/1800000000180-CreateCrearCirugiaRPC.ts
├── src/components/layout/Sidebar.tsx                     ← QUITAR "Honorarios" y "Reportes" del menú
└── src/lib/productividad/cirugia.ts                      ← REEXPORTA desde productividad-cirugia.ts

ARCHIVO CON DEPENDENCIA CRÍTICA (actualizar import):
├── src/app/api/consultas/route.ts                        ← Tiene import de MotorDevengoService
```

---

## 7. Análisis de Riesgos y Dependencias

### 7.1 Riesgos Altos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| `MotorDevengoService` es importado por `src/app/api/consultas/route.ts:6` | Si se elimina o mueve sin actualizar el import, la API de consultas rompe | **Opción A**: Mover MotorDevengoService a `src/services/productividad/` y actualizar el import en consultas/route.ts |
| `eventos_honorario` se usa en `productividad_honorarios_resumen` RPC | Si se rompe el RPC, Productividad pierde tab "Honorarios" | Verificar que el RPC siga funcionando; no modificar la firma |
| `MotorDevengoService.generarDesdeCirugia()` usa `agenda_cirugia_doctores` legado | Si la tabla legada no tiene datos, no genera honorarios | El nuevo flujo usa `cirugia_participantes`; `generarDesdeCirugia` debe actualizarse para leer de ambas tablas |
| `tarifas_doctor` es referenciada solo por módulo Honorarios | Si se eliminan los servicios, las tarifas quedan huérfanas | Mantener tarifas_doctor como datos base; crear UI de tarifas dentro de Productividad |
| `periodos_pago` y `liquidaciones_doctor` son referenciadas por eventos_honorario | La FK de eventos_honorario a periodos_pago debe mantenerse | Mantener las tablas; migrar el CRUD a Productividad |
| `src/app/api/consultas/route.ts` importa `MotorDevengoService` | Roto si se mueve sin actualizar | Mover el servicio y actualizar este import |
| `HonorariosService.historicoDoctor()` se usa en `/api/honorarios/reportes/historico` | Endpoint que se elimina | No migrar; eliminar junto con el módulo |

### 7.2 Riesgos Medios

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| `FiltrosReporte` component se usa en Productividad | Si se elimina el archivo, Productividad pierde filtros | Copiar `FiltrosReporte.tsx` a `src/components/productividad/` |
| `Sidebar.tsx` tiene "Honorarios" y "Reportes" en menuItems | El usuario puede seguir viendo rutas antiguas | Eliminar del array, asegurar redirect 404 para rutas eliminadas |
| `src/types/honorarios.ts` puede ser importado por otros archivos | Errores de compilación | Buscar todos los imports y migrar a tipos locales o nueva ubicación |

### 7.3 Riesgos Bajos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| `mis-honorarios/page.tsx` accesible con enlace directo | Sin 404 (la ruta existe desde B22); el middleware de sesión ya redirige a `/login` | Hecho: ruta + endpoint de autoconsulta |

---

## 8. Esquema de Nuevo Módulo Productividad

### 8.1 Nuevas pestañas en `/productividad`

```
Tabs:
├── "Honorarios"     ← Reemplaza reportes/honorarios (eventos, montos, estado pago)
├── "Por doctor"     ← Agrupación por médico  
├── "Cirugías"       ← Productividad de cirugías (ya existe)
├── "Estudios"       ← Estudios y procedimientos (ya existe)
├── "Entradas/Salidas" ← Consultas y finanzas (ya existe)
├── "Pagos"          ← NUEVO: liquidaciones, aprobación, pagos
├── "Tarifas"        ← NUEVO: configuración de tarifas por doctor/concepto/rol
├── "Períodos"       ← NUEVO: gestión de períodos de pago
└── "Sync"           ← NUEVO: botón de sincronización + log de resultados
```

### 8.2 Nuevos endpoints API

```
EXISTENTES (conservar):
GET  /api/productividad?tab=...&desde=...&hasta=...&doctor_id=...&formato=json|csv

NUEVOS:
POST /api/productividad/sync              — Botón Sync: verificar y generar eventos faltantes
GET  /api/productividad/pagos             — Listar liquidaciones con estado
POST /api/productividad/pagos/[id]/aprobar — Aprobar liquidación
POST /api/productividad/pagos/[id]/pagar   — Registrar pago
GET  /api/productividad/pagos/[id]         — Detalle de liquidación
GET  /api/productividad/tarifas            — Listar tarifas de doctor
POST /api/productividad/tarifas            — Crear/actualizar tarifa
GET  /api/productividad/periodos           — Listar períodos
POST /api/productividad/periodos           — Crear período
POST /api/productividad/periodos/[id]/cerrar — Cerrar período
GET  /api/productividad/sync/log           — Historial de sincronizaciones
```

### 8.3 Flujo de honorarios por consulta (implementación)

El nuevo sistema debe garantizar que cada consulta con conceptos (ESTUDIO/PROCEDIMIENTO/CONSULTA) reparta honorarios:

```
1. Al crear una consulta → MotorDevengoService.generarDesdeConsulta() crea eventos
2. Al sincronizar (Sync) → Verificar que cada consulta tiene sus eventos
3. Si falta algún evento → Crearlo automáticamente
4. Si una cirugía está relacionada con la consulta → Verificar que el evento de la cirugía 
   NO se duplicó desde la consulta (la cirugía tiene su propio honorario)
5. Cada cirugía genera UN honorario por participante (agenda_cirugia_doctores / cirugia_participantes)
6. El honorario de la cirugía NO está ligado a los conceptos de la consulta original
```

---

## 9. Requisitos de Base de Datos

### 9.1 Tablas que se conservan

| Tabla | Motivo |
|-------|--------|
| `eventos_honorario` | Base de todo el sistema de honorarios |
| `tarifas_doctor` | Configuración de tarifas |
| `periodos_pago` | Cierre de períodos |
| `liquidaciones_doctor` | Aprobación y pagos |
| `ajustes_liquidacion` | Ajustes en liquidaciones |
| `bitacora_honorarios` | Auditoría |
| `cirugia_productividad` | Productividad de cirugías |
| `reglas_productividad_cirugia` | Reglas de cálculo |
| `configuracion_sistema` | Configuración general (incluye honorarios) |

### 9.2 Tablas que podrían necesitarse (evaluar)

| Tabla | Necesidad | Justificación |
|-------|-----------|---------------|
| `sync_log` | Alta | Registrar cada sync realizado, errores, resultados |
| `pago_honorario` | Media | Si se necesita historial de pagos independiente de liquidaciones |

---

## 10. Pasos de Implementación Ordenados

### Fase A: Preparación (sin cambios destructivos)

1. **Mover `MotorDevengoService.ts`** de `src/services/honorarios/` a `src/services/productividad/` y actualizar import en `src/app/api/consultas/route.ts`
2. **Crear copia de `FiltrosReporte.tsx`** en `src/components/productividad/`
3. **Crear nuevos tipos** en `src/types/productividad.ts` (tarifas, liquidaciones, pagos, sync)
4. **Crear servicio `ProductividadService`** que consolide: tarifas, liquidaciones, pagos, sync
5. **Crear endpoints API** para pagos, tarifas, períodos, sync
6. **Modificar `Sidebar.tsx`** para quitar "Honorarios" y "Reportes", mantener "Productividad"
7. **Redirigir rutas antiguas** (`/honorarios/*`, `/reportes`) a `/productividad` o 404
8. **Crear `src/services/productividad/index.ts`** barrel export

### Fase B: UI Productividad ampliada

7. **Agregar tabs** "Pagos", "Tarifas", "Períodos", "Sync" al page.tsx de productividad
8. **Migrar lógica** de liquidaciones/tarifas/periodos desde servicios honorarios a productividad
9. **Implementar botón Sync** con validación de relación consulta-cirugía
10. **Implementar flujo de pagos** (aprobar, pagar, historial)

### Fase C: Migración de honorarios automática

11. **Actualizar `MotorDevengoService.generarDesdeCirugia()`** para leer de `cirugia_participantes` (nuevo) y no solo `agenda_cirugia_doctores` (legado); mover el archivo a `src/services/productividad/`
12. **Verificar que cada consulta genera honorarios** — agregar validación en `generarDesdeConsulta` para asegurar que eventos se crean por cada concepto (ESTUDIO, PROCEDIMIENTO, CONSULTA)
13. **Crear endpoint `POST /api/productividad/sync`** que:
    - Itera consultas en rango de fechas
    - Para cada consulta: verifica si existen `eventos_honorario` asociados
    - Itera cirugías, verifica si existen eventos de honorario por participante
    - Verifica relación consulta↔cirugía (una cirugía = un honorario por participante, no duplicado desde consulta)
    - Genera eventos faltantes
    - Registra resultado en log
14. **Probar flujo completo**: crear consulta → Sync → verificar honorarios → crear cirugía → Sync → verificar relación → pago

### Fase D: Limpieza

15. **Eliminar archivos del módulo Reportes**
16. **Eliminar archivos del módulo Honorarios** (UI, API, services, types)
17. **Eliminar import de `FiltrosReporte`** de honorarios
18. **Ejecutar `npx tsc --noEmit`** y `npm run lint`
19. **Verificar que no haya referencias rotas**

---

## 11. Verificación Pre-Implementación

### 11.1 Comandos de verificación actuales

```bash
# Verificar imports que refieren a módulos eliminados
grep -r "from '@/services/honorarios'" src/app/ src/lib/ src/components/
grep -r "from '@/types/honorarios'" src/app/ src/lib/ src/components/
grep -r "from '@/components/honorarios/" src/app/ src/components/

# Verificar que Productividad no depende de archivos eliminables
grep -r "HonorariosService\|CierrePeriodoService\|ReversionService\|MetricasDoctorService" src/app/api/productividad/ src/lib/productividad/

# Verificar rutas en Sidebar
grep -r "honorarios\|reportes" src/components/layout/Sidebar.tsx
```

### 11.2 Criterios de aceptación

- [ ] `npx tsc --noEmit` → OK después de todos los cambios
- [ ] `npm run lint` → OK
- [ ] `/productividad` accesible solo para admin
- [ ] `/honorarios/*` → 404 o redirect a `/productividad`
- [ ] `/reportes` → 404
- [ ] Cada consulta con conceptos tiene al menos un evento de honorario
- [ ] Cada cirugía con participantes tiene eventos de honorario
- [ ] Botón Sync funciona y detecta/corre lagunas
- [ ] Admin puede aprobar y registrar pagos
- [ ] Tarifas configurables por admin
- [ ] Períodos de pago gestionables por admin
- [ ] Sin imports rotos
- [ ] Sin tablas huérfanas sin referencia

---

## 12. Decisiones y Supuestos

1. **MotorDevengoService se conserva** pero se mueve a `src/services/productividad/` para evitar confusión con el módulo eliminado.
2. **`tarifas_doctor`, `periodos_pago`, `liquidaciones_doctor`, `bitacora_honorarios` se conservan** porque son datos base del sistema de honorarios, no del módulo UI.
3. **El RPC `productividad_honorarios_resumen` NO se modifica** porque es el corazón de la tab "Honorarios" de Productividad.
4. **`agenda_cirugia_doctores` se mantiene** como tabla legada; el nuevo flujo usa `cirugia_participantes`. `MotorDevengoService.generarDesdeCirugia()` debe actualizarse para soportar ambas.
5. **Una cirugía = un honorario por participante**, no múltiples. La relación consulta-cirugía es de navegación, no de duplicación de honorarios.
6. **"Sync" no es una migración de datos**, es una validación + corrección que puede ejecutarse manualmente o programadamente.
7. **El módulo Productividad hereda toda la funcionalidad** de Honorarios + Reportes, pero solo expone lo que el admin necesita.
8. **El doctor ve sus honorarios** en `/mis-honorarios` (páginas propias, no redirige a `/productividad`): `GET /api/productividad/mis-honorarios` resuelve su `doctor_id` y devuelve la misma liga que el panel admin (B22).
