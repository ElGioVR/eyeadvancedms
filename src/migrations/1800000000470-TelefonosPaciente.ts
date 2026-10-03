import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Hasta 3 teléfonos por paciente con etiqueta y uno principal
 * ([{numero, etiqueta, principal}]). pacientes.telefono sigue guardando el
 * principal; telefonos_busqueda junta los dígitos de todos para la búsqueda.
 */
export class TelefonosPaciente1800000000470 implements MigrationInterface {
  name = 'TelefonosPaciente1800000000470';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pacientes
        ADD COLUMN IF NOT EXISTS telefonos jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS telefonos_busqueda text`);
    await queryRunner.query(`
      UPDATE pacientes
         SET telefonos = jsonb_build_array(jsonb_build_object('numero', telefono, 'etiqueta', 'Celular', 'principal', true)),
             telefonos_busqueda = regexp_replace(telefono, '\\D', '', 'g')
       WHERE telefono IS NOT NULL AND btrim(telefono) <> '' AND telefonos = '[]'::jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pacientes DROP COLUMN IF EXISTS telefonos_busqueda, DROP COLUMN IF EXISTS telefonos`);
  }
}
