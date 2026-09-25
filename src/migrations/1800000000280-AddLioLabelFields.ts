import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Campos nuevos del escáner de etiquetas de LIO (tarea de mejora del OCR).
 *
 * Razón del cambio de modelo: el catálogo `tipo_lio` no podía representar una
 * LIO que es a la vez multifocal y tórica (p. ej. Clareon PanOptix Toric), que
 * es exactamente lo que imprime la etiqueta. Se añade un único valor
 * combinado `MULTIFOCAL_TORICA` en lugar de duplicar la información en otra
 * columna. Los valores existentes y los registros previos no cambian: las
 * columnas nuevas quedan en NULL para los ítems antiguos (compatibles con el
 * resto de lectores: `mapLente`, `LIOSelector`, `listarLIOsDisponibles`).
 *
 * `codigo_barras` no se toca: el número de serie (SN) nunca se guarda como
 * código de barras; solo lo aporta el decoder de la foto.
 */
export class AddLioLabelFields1800000000280 implements MigrationInterface {
  name = 'AddLioLabelFields1800000000280';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventario_items
        ADD COLUMN IF NOT EXISTS cilindro_lio DECIMAL(5,2),
        ADD COLUMN IF NOT EXISTS add_intermedia DECIMAL(5,2),
        ADD COLUMN IF NOT EXISTS add_cercana DECIMAL(5,2),
        ADD COLUMN IF NOT EXISTS numero_serie VARCHAR(100),
        ADD COLUMN IF NOT EXISTS codigo_barras_tipo VARCHAR(20);
    `);

    await queryRunner.query(`
      ALTER TYPE tipo_lio ADD VALUE IF NOT EXISTS 'MULTIFOCAL_TORICA';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // El valor de enum no se elimina: PostgreSQL exige reconstruir el tipo
    // completo y el valor combinado no afecta a lecturas existentes.
    await queryRunner.query(`
      ALTER TABLE inventario_items
        DROP COLUMN IF EXISTS cilindro_lio,
        DROP COLUMN IF EXISTS add_intermedia,
        DROP COLUMN IF EXISTS add_cercana,
        DROP COLUMN IF EXISTS numero_serie,
        DROP COLUMN IF EXISTS codigo_barras_tipo;
    `);
  }
}
