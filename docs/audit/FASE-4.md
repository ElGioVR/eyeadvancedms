# FASE 4 — LIMPIEZA E INYECCIÓN DE DATOS

**Fecha:** 2026-09-18
**Estado:** Datos ya importados — sin limpieza necesaria

## Hallazgo

Los datos del CSV (`ENTRADA_Y_SALIDA_2026_SEPTIEMBRE.csv`) **ya fueron importados** por el script `scripts/import-csv.ts` ejecutado en una sesión anterior.

## Perfil del CSV

| Métrica | Valor |
|---------|-------|
| Filas con fechas (consultas reales) | 31 |
| Filas catálogo (nombres de procedimientos) | 75 |
| Filas vacías | 172 |
| Filas parciales (quarentena) | 1 (fila 33) |
| Filas con overflow (segunda consulta) | 9 (quarentena) |
| Encoding | CP-1252 |
| Rango de fechas | 2026-09-01 a 2026-09-03 |
| Doctores únicos | 6 |
| Aseguradoras | ISSSTECALI (20), JORNADA (8) |
| Métodos de pago | NO APLICA (20), EFECTIVO (7), TARJETA (4) |
| Costo total | $22,375 MXN |

## Estado de la BD

| Tabla | Registros | Huérfanos FK |
|-------|-----------|--------------|
| pacientes | 31 | 0 |
| doctores | 6 | 0 |
| consultas | 55 (45 en Sept) | 0 |
| aseguranzas | 7 | 0 |
| cobros | 12 | 0 |
| eventos_honorario | 90 | 0 |

## Mapeo aprobado

- Doctores: DR BAYARDO, LUIS, DRA IRINA, DR PILOTO, DRA MARTHA, DRA SADIA
- Aseguranzas: ISSSTECALI, JORNADA, GNP, DOCTORALIA, BANCOS, PLAN SEGURO, Particular
- Correcciones aplicadas: fila 23 (sexo MASCULINO), fila 29 (hora 14:00), fila 33 (descartada)
- Overflow (filas 10-18): descartado (sin datos completos)

## Reglas de homologación documentadas

- Fechas: `Day, Month DD, YYYY` → ISO `YYYY-MM-DD`
- Horas: AM/PM → 24h, space removed, leading zero
- Teléfono: strip spaces → 10 dígitos
- Nombres: Title Case, trim, colapsar espacios, conservar acentos
- Sexo: MASCULINO | FEMENINO (ya normalizado)
- Edad: recalculada desde fecha_nacimiento
- Costo: strip $, commas → NUMERIC
- DEDUPE: `(nombre_norm, fecha_nacimiento)` — Jose Aguilar Regalado (filas 6, 19) es re-visita legítima

## Pendiente

- F4.1-4.5 completados (datos ya en BD, sin limpieza necesaria)
- Script `import-csv.ts` actualizado con las reglas de homologación
