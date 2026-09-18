import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class MigrateLentesToInventarioItems1800000000050 implements MigrationInterface {
  name = 'MigrateLentesToInventarioItems1800000000050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create tipo_inventario enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE tipo_inventario AS ENUM ('LENTE_VISION', 'LENTE_INTRAOCULAR');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 2. Create tipo_lio enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE tipo_lio AS ENUM ('MONOFOCAL', 'MULTIFOCAL', 'TORICA', 'EDOF', 'OTRO');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 3. Rename lentes → inventario_items
    await queryRunner.query(`ALTER TABLE IF EXISTS "lentes" RENAME TO "inventario_items";`);

    // 4. Add tipo column (defaults to LENTE_VISION for existing data)
    await queryRunner.query(`
      ALTER TABLE inventario_items
        ADD COLUMN IF NOT EXISTS tipo tipo_inventario NOT NULL DEFAULT 'LENTE_VISION';
    `);

    // 5. Add LIO-specific columns (nullable, only used when tipo = LENTE_INTRAOCULAR)
    await queryRunner.query(`
      ALTER TABLE inventario_items
        ADD COLUMN IF NOT EXISTS potencia_dioptrias DECIMAL(5,2),
        ADD COLUMN IF NOT EXISTS tipo_lio tipo_lio,
        ADD COLUMN IF NOT EXISTS modelo_fabricante VARCHAR(255);
    `);

    // 6. Add RESERVADO to existing estado enum if needed
    //    Check if enum type exists and add value
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE inventario_estado ADD VALUE IF NOT EXISTS 'RESERVADO';
      EXCEPTION WHEN undefined_object THEN NULL;
      END $$;
    `);

    // 7. Create inventario_movimientos table (Kardex)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventario_movimientos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventario_item_id UUID NOT NULL REFERENCES inventario_items(id) ON DELETE CASCADE,
        tipo VARCHAR(30) NOT NULL,
        cantidad INTEGER NOT NULL,
        stock_resultante INTEGER NOT NULL,
        usuario_id UUID REFERENCES usuarios(id),
        referencia_tipo VARCHAR(30),
        referencia_id UUID,
        motivo TEXT,
        costo_unitario DECIMAL(10,2),
        proveedor_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 8. Indexes for Kardex performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_item_id
        ON inventario_movimientos(inventario_item_id);
      CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_tipo
        ON inventario_movimientos(tipo);
      CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_created_at
        ON inventario_movimientos(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inventario_items_tipo
        ON inventario_items(tipo);
    `);

    // 9. Seed initial Kardex entries for existing items with stock > 0
    await queryRunner.query(`
      INSERT INTO inventario_movimientos (inventario_item_id, tipo, cantidad, stock_resultante, motivo, created_at)
      SELECT id, 'ENTRADA', stock, stock, 'Stock inicial (migracion)', created_at
      FROM inventario_items
      WHERE stock > 0
      AND NOT EXISTS (
        SELECT 1 FROM inventario_movimientos m WHERE m.inventario_item_id = inventario_items.id
      );
    `);

    // 10. Update RLS policies for inventario_items (was lentes)
    //     Re-create policies that referenced the old table name
    await queryRunner.query(`
      DO $$ BEGIN
        -- Drop old policies on lentes if they still exist under old name
        DROP POLICY IF EXISTS lentes_admin_all ON lentes;
        DROP POLICY IF EXISTS lentes_recepcionista_all ON lentes;
        DROP POLICY IF EXISTS lentes_doctor_view ON lentes;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'inventario_items' AND policyname = 'inventario_items_admin_all'
        ) THEN
          CREATE POLICY inventario_items_admin_all ON inventario_items
            USING (
              EXISTS (
                SELECT 1 FROM usuarios
                WHERE usuarios.id = auth.uid() AND usuarios.rol = 'admin'
              )
            );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'inventario_items' AND policyname = 'inventario_items_recepcionista_all'
        ) THEN
          CREATE POLICY inventario_items_recepcionista_all ON inventario_items
            USING (
              EXISTS (
                SELECT 1 FROM usuarios
                WHERE usuarios.id = auth.uid() AND usuarios.rol = 'recepcionista'
              )
            );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'inventario_items' AND policyname = 'inventario_items_doctor_view'
        ) THEN
          CREATE POLICY inventario_items_doctor_view ON inventario_items
            FOR SELECT
            USING (
              EXISTS (
                SELECT 1 FROM usuarios
                WHERE usuarios.id = auth.uid() AND usuarios.rol = 'doctor'
              )
            );
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS inventario_movimientos;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_inventario_items_tipo;`);

    await queryRunner.query(`
      ALTER TABLE inventario_items
        DROP COLUMN IF EXISTS modelo_fabricante,
        DROP COLUMN IF EXISTS tipo_lio,
        DROP COLUMN IF EXISTS potencia_dioptrias,
        DROP COLUMN IF EXISTS tipo;
    `);

    await queryRunner.query(`ALTER TABLE IF EXISTS "inventario_items" RENAME TO "lentes";`);

    await queryRunner.query(`DROP TYPE IF EXISTS tipo_lio;`);
    await queryRunner.query(`DROP TYPE IF EXISTS tipo_inventario;`);
  }
}
