import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class EnhanceCatalogoEstudiosProcedimientos1800000000001 implements MigrationInterface {
  name = 'EnhanceCatalogoEstudiosProcedimientos1800000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enriquecer catalogo_estudios con codigo, categoria, precio_lista
    await queryRunner.query(`
      ALTER TABLE catalogo_estudios
        ADD COLUMN IF NOT EXISTS codigo VARCHAR(50),
        ADD COLUMN IF NOT EXISTS categoria VARCHAR(100) DEFAULT 'Diagnóstico',
        ADD COLUMN IF NOT EXISTS precio_lista DECIMAL(10,2);
    `);

    // Generar códigos para registros existentes
    await queryRunner.query(`
      WITH numerados AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, nombre) AS rn
        FROM catalogo_estudios
        WHERE codigo IS NULL
      )
      UPDATE catalogo_estudios ce
      SET codigo = 'EST-' || LPAD(n.rn::TEXT, 3, '0')
      FROM numerados n
      WHERE ce.id = n.id;
    `);

    // Poner precio_lista = costo para registros existentes
    await queryRunner.query(`
      UPDATE catalogo_estudios
      SET precio_lista = costo
      WHERE precio_lista IS NULL;
    `);

    // 2. Enriquecer catalogo_procedimientos con codigo, categoria, precio_lista, requiere_quirofano, duracion_estimada_min
    await queryRunner.query(`
      ALTER TABLE catalogo_procedimientos
        ADD COLUMN IF NOT EXISTS codigo VARCHAR(50),
        ADD COLUMN IF NOT EXISTS categoria VARCHAR(100) DEFAULT 'Quirúrgico',
        ADD COLUMN IF NOT EXISTS precio_lista DECIMAL(10,2),
        ADD COLUMN IF NOT EXISTS requiere_quirofano BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS duracion_estimada_min INTEGER;
    `);

    // Generar códigos para registros existentes
    await queryRunner.query(`
      WITH numerados AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, nombre) AS rn
        FROM catalogo_procedimientos
        WHERE codigo IS NULL
      )
      UPDATE catalogo_procedimientos cp
      SET codigo = 'PROC-' || LPAD(n.rn::TEXT, 3, '0')
      FROM numerados n
      WHERE cp.id = n.id;
    `);

    // Poner precio_lista = costo para registros existentes
    await queryRunner.query(`
      UPDATE catalogo_procedimientos
      SET precio_lista = costo
      WHERE precio_lista IS NULL;
    `);

    // Marcar procedimientos quirúrgicos conocidos
    await queryRunner.query(`
      UPDATE catalogo_procedimientos
      SET requiere_quirofano = true
      WHERE nombre ILIKE '%facoemulsificación%'
         OR nombre ILIKE '%vitrectomía%'
         OR nombre ILIKE '%cerclaje%'
         OR nombre ILIKE '%trabeculectomía%'
         OR nombre ILIKE '%facotrabeculectomía%'
         OR nombre ILIKE '%transplante%'
         OR nombre ILIKE '%implante%'
         OR nombre ILIKE '%retiro de lente%'
         OR nombre ILIKE '%cross-linking%';
    `);

    // Índices únicos para código
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_estudios_codigo
        ON catalogo_estudios(codigo) WHERE codigo IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_procedimientos_codigo
        ON catalogo_procedimientos(codigo) WHERE codigo IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_catalogo_procedimientos_codigo;
      DROP INDEX IF EXISTS idx_catalogo_estudios_codigo;
      ALTER TABLE catalogo_procedimientos
        DROP COLUMN IF EXISTS duracion_estimada_min,
        DROP COLUMN IF EXISTS requiere_quirofano,
        DROP COLUMN IF EXISTS precio_lista,
        DROP COLUMN IF EXISTS categoria,
        DROP COLUMN IF EXISTS codigo;
      ALTER TABLE catalogo_estudios
        DROP COLUMN IF EXISTS precio_lista,
        DROP COLUMN IF EXISTS categoria,
        DROP COLUMN IF EXISTS codigo;
    `);
  }
}
