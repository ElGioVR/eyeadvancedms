import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Catálogo de modelos de LIO (Modificaciones agenda, punto I.2) y
 * agenda_cirugias.modelo_lio_id. Semilla: LIO distintos del inventario
 * (verificado = false). Mismo contenido que sql/patch-cat-modelos-lio.sql.
 */
export class CreateCatModelosLio1800000000360 implements MigrationInterface {
  name = 'CreateCatModelosLio1800000000360';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS cat_modelos_lio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fabricante TEXT NOT NULL CHECK (length(trim(fabricante)) > 0),
  modelo TEXT NOT NULL CHECK (length(trim(modelo)) > 0),
  diseno TEXT NOT NULL CHECK (diseno IN ('MONOFOCAL', 'TRIFOCAL', 'MULTIFOCAL', 'EDOF', 'OTRO')),
  torico BOOLEAN NOT NULL DEFAULT false,
  verificado BOOLEAN NOT NULL DEFAULT false,
  origen TEXT NOT NULL DEFAULT 'MANUAL' CHECK (origen IN ('MANUAL', 'INVENTARIO', 'CSV')),
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cat_modelos_lio_modelo
  ON cat_modelos_lio (lower(fabricante), lower(modelo), torico);
CREATE INDEX IF NOT EXISTS idx_cat_modelos_lio_tipo
  ON cat_modelos_lio (diseno, torico) WHERE activo;

ALTER TABLE cat_modelos_lio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cat_modelos_lio_select_authenticated ON cat_modelos_lio;
CREATE POLICY cat_modelos_lio_select_authenticated ON cat_modelos_lio
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cat_modelos_lio_admin_write ON cat_modelos_lio;
CREATE POLICY cat_modelos_lio_admin_write ON cat_modelos_lio
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'));

ALTER TABLE agenda_cirugias
  ADD COLUMN IF NOT EXISTS modelo_lio_id UUID REFERENCES cat_modelos_lio(id) ON DELETE SET NULL;

-- Semilla: LIO del inventario (se puede volver a correr; ver sql/patch-cat-modelos-lio-sembrar.sql)
CREATE OR REPLACE FUNCTION sembrar_cat_modelos_lio()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  cols      text[];
  e_fab     text;
  e_mod     text;
  e_filtro  text;
  e_tipo    text := 'NULL::text';
  e_cil     text := 'NULL::numeric';
  e_addi    text := 'NULL::numeric';
  e_addn    text := 'NULL::numeric';
  partes    text[] := '{}';
  n         integer := 0;
BEGIN
  IF to_regclass('public.inventario_items') IS NULL OR to_regclass('public.cat_modelos_lio') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT array_agg(column_name::text) INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'inventario_items';

  -- Fabricante: el esquema actual primero
  IF 'manufacturer' = ANY (cols) AND 'marca' = ANY (cols) THEN
    e_fab := 'COALESCE(NULLIF(trim(manufacturer), ''''), NULLIF(trim(marca::text), ''''))';
  ELSIF 'manufacturer' = ANY (cols) THEN
    e_fab := 'NULLIF(trim(manufacturer), '''')';
  ELSIF 'marca' = ANY (cols) THEN
    e_fab := 'NULLIF(trim(marca::text), '''')';
  ELSE
    RETURN 0;
  END IF;

  -- Modelo: "product_name model" sin repetir el código si ya viene en el nombre
  IF 'product_name' = ANY (cols) AND 'model' = ANY (cols) THEN
    partes := array_append(partes, 'CASE WHEN NULLIF(trim(product_name), '''') IS NULL THEN NULLIF(trim(model), '''') WHEN NULLIF(trim(model), '''') IS NULL OR product_name ILIKE (''%'' || trim(model) || ''%'') THEN trim(product_name) ELSE trim(product_name) || '' '' || trim(model) END');
  ELSIF 'model' = ANY (cols) THEN
    partes := array_append(partes, 'NULLIF(trim(model), '''')');
  END IF;
  IF 'modelo' = ANY (cols) THEN partes := array_append(partes, 'NULLIF(trim(modelo::text), '''')'); END IF;
  IF 'modelo_fabricante' = ANY (cols) THEN partes := array_append(partes, 'NULLIF(trim(modelo_fabricante::text), '''')'); END IF;
  IF array_length(partes, 1) IS NULL THEN
    RETURN 0;
  END IF;
  e_mod := 'COALESCE(' || array_to_string(partes, ', ') || ')';

  IF 'tipo_lio' = ANY (cols) THEN e_tipo := 'tipo_lio::text'; END IF;
  IF 'cylinder' = ANY (cols) THEN e_cil := 'cylinder::numeric'; END IF;
  IF 'add_intermediate' = ANY (cols) THEN e_addi := 'add_intermediate::numeric'; END IF;
  IF 'add_near' = ANY (cols) THEN e_addn := 'add_near::numeric'; END IF;

  -- Qué filas son LIO: marcadas como LENTE_INTRAOCULAR, o capturadas con el
  -- formulario actual de LIO (manufacturer). Los lentes de armazón antiguos
  -- (solo marca, tipo LENTE_VISION) quedan fuera.
  IF 'tipo' = ANY (cols) AND 'manufacturer' = ANY (cols) THEN
    e_filtro := '(tipo::text = ''LENTE_INTRAOCULAR'' OR NULLIF(trim(manufacturer), '''') IS NOT NULL)';
  ELSIF 'tipo' = ANY (cols) THEN
    e_filtro := 'tipo::text = ''LENTE_INTRAOCULAR''';
  ELSE
    e_filtro := 'true';
  END IF;

  EXECUTE format($q$
    INSERT INTO cat_modelos_lio (fabricante, modelo, diseno, torico, origen, verificado)
    SELECT DISTINCT ON (lower(f), lower(m), t) f, m, d, t, 'INVENTARIO', false
      FROM (
        SELECT f, m,
               CASE
                 WHEN tl = 'EDOF' THEN 'EDOF'
                 WHEN COALESCE(ai, 0) > 0 AND COALESCE(an, 0) > 0 THEN 'TRIFOCAL'
                 WHEN m ~* '(panoptix|trifocal|finevision|lisa tri|trinova)' THEN 'TRIFOCAL'
                 WHEN COALESCE(an, 0) > 0 OR tl = 'MULTIFOCAL' THEN 'MULTIFOCAL'
                 WHEN tl = 'OTRO' THEN 'OTRO'
                 ELSE 'MONOFOCAL'
               END AS d,
               (COALESCE(cil, 0) <> 0 OR COALESCE(tl, '') = 'TORICA' OR m ~* 'toric') AS t
          FROM (
            SELECT %1$s AS f, %2$s AS m, %3$s AS tl, %4$s AS cil, %5$s AS ai, %6$s AS an
              FROM inventario_items
             WHERE %7$s
          ) base
         WHERE f IS NOT NULL AND m IS NOT NULL
      ) s
    ON CONFLICT DO NOTHING
  $q$, e_fab, e_mod, e_tipo, e_cil, e_addi, e_addn, e_filtro);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$fn$;

SELECT sembrar_cat_modelos_lio() AS modelos_agregados;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
ALTER TABLE agenda_cirugias DROP COLUMN IF EXISTS modelo_lio_id;
DROP FUNCTION IF EXISTS sembrar_cat_modelos_lio();
DROP TABLE IF EXISTS cat_modelos_lio;
    `);
  }
}
