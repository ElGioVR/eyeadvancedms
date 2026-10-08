# Migraciones pendientes — comentarios de la clínica (oct 2026)

Ejecutar en Supabase (SQL Editor), en este orden. Todas son aditivas e idempotentes.

1. `sql/patch-cirugia-lentes-reservas-supabase.sql` — tabla `cirugia_lentes`, columnas `tipo_caso`, `reagenda_de_id`, `procedencia`, tiempos, `requiere_lio`. **Ejecutada.**
2. `sql/patch-cirugia-lentes-funciones-supabase.sql` — funciones `reservar_lente_cirugia` y `liberar_lentes_cirugia`. **Ejecutada.**
3. `sql/patch-crear-cirugia-reserva-lio-supabase.sql` — `crear_cirugia` reserva el LIO en vez de descontar stock. **Ejecutada.**
4. `sql/patch-requiere-lio-ojo-procedimientos-supabase.sql` — bandera `requiere_lio` con siembra por nombre (revisar el SELECT), y `ojo` en `cirugia_procedimientos`. **Pendiente de ejecutar.**

No hay migraciones nuevas en el último bloque: los cambios de reagenda, importación, lentes adicionales, exportación y vista móvil usan las columnas y funciones anteriores.

Prueba opcional (no es migración): `sql/verificar-cirugia-lentes-reserva.sql`, solo en una base de prueba desechable.

Pasos de software que no son SQL:
- `npm install` en la carpeta del proyecto (agrega la dependencia `docx` para exportar a Word). Sin esto, el compilador marca el módulo `docx` como no encontrado.
- Pruebas: `npm run test:unit`.
