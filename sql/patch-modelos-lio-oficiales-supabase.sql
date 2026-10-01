-- Catalogo de LIO desde los sitios OFICIALES de cada fabricante (consultados el 1-oct-2026).
-- No se copia nada de ESCRS/IOLCon (sus terminos lo prohiben); la fuente de cada modelo queda en notas.
-- Idempotente. Pegar completo en el SQL Editor de Supabase.
BEGIN;

-- 1) Retira la lista general previa (patch-modelos-lio-comunes, armada sin fuente oficial).
UPDATE cat_modelos_lio SET activo = false, updated_at = now()
 WHERE origen = 'MANUAL' AND verificado = false
   AND notas = 'Precargado (lista general); verificar en ESCRS/IOLCon';

-- 2) Unifica nombres de fabricante (evita "Zeiss" y "Carl Zeiss Meditec" por separado).
UPDATE cat_modelos_lio m SET fabricante = 'Johnson & Johnson', updated_at = now()
 WHERE lower(trim(m.fabricante)) IN ('johnson & johnson vision', 'j&j', 'j&j vision', 'johnson&johnson', 'johnson and johnson', 'jnj', 'abbott', 'amo')
   AND NOT EXISTS (SELECT 1 FROM cat_modelos_lio o
                    WHERE lower(o.fabricante) = lower('Johnson & Johnson') AND lower(o.modelo) = lower(m.modelo) AND o.torico = m.torico);
UPDATE cat_modelos_lio m SET fabricante = 'Zeiss', updated_at = now()
 WHERE lower(trim(m.fabricante)) IN ('carl zeiss meditec', 'carl zeiss', 'zeiss meditec')
   AND NOT EXISTS (SELECT 1 FROM cat_modelos_lio o
                    WHERE lower(o.fabricante) = lower('Zeiss') AND lower(o.modelo) = lower(m.modelo) AND o.torico = m.torico);
UPDATE cat_modelos_lio m SET fabricante = 'Bausch + Lomb', updated_at = now()
 WHERE lower(trim(m.fabricante)) IN ('bausch & lomb', 'bausch+lomb', 'bausch and lomb', 'b+l')
   AND NOT EXISTS (SELECT 1 FROM cat_modelos_lio o
                    WHERE lower(o.fabricante) = lower('Bausch + Lomb') AND lower(o.modelo) = lower(m.modelo) AND o.torico = m.torico);
UPDATE cat_modelos_lio m SET fabricante = 'Hoya', updated_at = now()
 WHERE lower(trim(m.fabricante)) IN ('hoya surgical optics', 'hoya surgical', 'hoya vision', 'hoya vision care')
   AND NOT EXISTS (SELECT 1 FROM cat_modelos_lio o
                    WHERE lower(o.fabricante) = lower('Hoya') AND lower(o.modelo) = lower(m.modelo) AND o.torico = m.torico);
UPDATE cat_modelos_lio m SET fabricante = 'BVI', updated_at = now()
 WHERE lower(trim(m.fabricante)) IN ('bvi physiol', 'physiol', 'bvi medical')
   AND NOT EXISTS (SELECT 1 FROM cat_modelos_lio o
                    WHERE lower(o.fabricante) = lower('BVI') AND lower(o.modelo) = lower(m.modelo) AND o.torico = m.torico);
UPDATE cat_modelos_lio m SET fabricante = 'Teleon', updated_at = now()
 WHERE lower(trim(m.fabricante)) IN ('teleon surgical')
   AND NOT EXISTS (SELECT 1 FROM cat_modelos_lio o
                    WHERE lower(o.fabricante) = lower('Teleon') AND lower(o.modelo) = lower(m.modelo) AND o.torico = m.torico);
UPDATE cat_modelos_lio m SET fabricante = 'Hanita', updated_at = now()
 WHERE lower(trim(m.fabricante)) IN ('hanita lenses')
   AND NOT EXISTS (SELECT 1 FROM cat_modelos_lio o
                    WHERE lower(o.fabricante) = lower('Hanita') AND lower(o.modelo) = lower(m.modelo) AND o.torico = m.torico);

-- 2b) Si el mismo modelo ya existia con el nombre unificado, la variante sobrante se desactiva.
UPDATE cat_modelos_lio m SET activo = false, updated_at = now()
 WHERE m.activo
   AND lower(trim(m.fabricante)) IN ('johnson & johnson vision','j&j','j&j vision','johnson&johnson','johnson and johnson','jnj','abbott','amo',
                                     'carl zeiss meditec','carl zeiss','zeiss meditec','bausch & lomb','bausch+lomb','bausch and lomb','b+l',
                                     'hoya surgical optics','hoya surgical','hoya vision','hoya vision care','bvi physiol','physiol','bvi medical','teleon surgical','hanita lenses');

-- 3) Modelos oficiales (118). verificado = false solo donde el codigo debe revisarse.
INSERT INTO cat_modelos_lio (fabricante, modelo, diseno, torico, verificado, origen, notas)
SELECT v.fabricante, v.modelo, v.diseno, v.torico, v.verificado, 'MANUAL', v.notas
FROM (VALUES
  ('Alcon', 'Clareon PanOptix Pro', 'TRIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.myalcon.com/professional/cataract-surgery/iols/clareon-panoptix-pro/'),
  ('Alcon', 'Clareon PanOptix Pro Toric', 'TRIFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.myalcon.com/professional/cataract-surgery/iols/clareon-panoptix-pro/'),
  ('Alcon', 'Clareon PanOptix CNWTT0', 'TRIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.myalcon.com/professional/cataract-surgery/iols/clareon-iol/'),
  ('Alcon', 'Clareon PanOptix Toric', 'TRIFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.myalcon.com/professional/cataract-surgery/iols/clareon-iol/'),
  ('Alcon', 'Clareon Vivity CNWET0', 'EDOF', false, true, 'Catalogo oficial del fabricante: https://www.myalcon.com/professional/cataract-surgery/iols/clareon-vivity/'),
  ('Alcon', 'Clareon Vivity Toric', 'EDOF', true, true, 'Catalogo oficial del fabricante: https://www.myalcon.com/professional/cataract-surgery/iols/clareon-vivity/'),
  ('Alcon', 'Clareon TruPlus', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.myalcon.com/professional/cataract-surgery/iols/clareon-truplus/'),
  ('Alcon', 'Clareon TruPlus Toric', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.myalcon.com/professional/cataract-surgery/iols/clareon-truplus/'),
  ('Alcon', 'Clareon Monofocal', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.myalcon.com/professional/cataract-surgery/iols/clareon-iol/'),
  ('Alcon', 'Clareon Toric', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.myalcon.com/professional/cataract-surgery/iols/clareon-iol/'),
  ('Johnson & Johnson', 'TECNIS PureSee', 'EDOF', false, true, 'Catalogo oficial del fabricante: https://www.jnjvisionpro.com/en-us/products/tecnis-puresee/'),
  ('Johnson & Johnson', 'TECNIS Odyssey', 'MULTIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.jnjvisionpro.com/en-us/products/tecnis-odyssey/'),
  ('Johnson & Johnson', 'TECNIS Odyssey Toric II', 'MULTIFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.jnjvisionpro.com/en-us/products/tecnis-odyssey/'),
  ('Johnson & Johnson', 'TECNIS Eyhance', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.jnjvisionpro.com/en-us/products/tecnis-eyhance/'),
  ('Johnson & Johnson', 'TECNIS Eyhance Toric II', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.jnjvisionpro.com/en-us/products/tecnis-eyhance/'),
  ('Zeiss', 'AT ELANA 841P', 'TRIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/trifocal-iols/zeiss-at-elana-841p.html'),
  ('Zeiss', 'AT LISA tri 839MP', 'TRIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/trifocal-iols/at-lisa-tri-family.html'),
  ('Zeiss', 'AT LISA tri toric 949M/MP', 'TRIFOCAL', true, false, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/toric-iols/toric-iol-family.html (revisar codigo/diseno)'),
  ('Zeiss', 'AT LARA 829MP', 'EDOF', false, true, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/edof-iols/at-lara-family.html'),
  ('Zeiss', 'AT LARA toric 929M/MP', 'EDOF', true, true, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/toric-iols/toric-iol-family.html'),
  ('Zeiss', 'AT TORBI 719M/MP', 'MONOFOCAL', true, false, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/toric-iols/toric-iol-family.html (revisar codigo/diseno)'),
  ('Zeiss', 'AT LUCIA toric 721P', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/c/iols-optics-you-can-trust/zeiss-at-lucia-toric-721p.html'),
  ('Zeiss', 'CT LUCIA 621P/PY', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/monofocal-iols/lucia-family.html'),
  ('Zeiss', 'CT LUCIA 202 (3-piece)', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/monofocal-iols/3-piece-iols.html'),
  ('Zeiss', 'CT ASPHINA 404', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/monofocal-iols/ct-asphina-family.html'),
  ('Zeiss', 'CT ASPHINA 409M/MP', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/monofocal-iols/ct-asphina-family.html'),
  ('Zeiss', 'CT ASPHINA 509M/MP', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/monofocal-iols/ct-asphina-family.html'),
  ('Zeiss', 'CT ASPHINA 603', 'MONOFOCAL', false, false, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/monofocal-iols/ct-asphina-family.html (revisar codigo/diseno)'),
  ('Zeiss', 'CT SPHERIS 209M', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.zeiss.com/meditec/en/products/intraocular-lenses-iols/monofocal-iols/ct-spheris-family.html'),
  ('Bausch + Lomb', 'enVista EE', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/envista-and-envista-toric/'),
  ('Bausch + Lomb', 'enVista Toric ETE', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/envista-and-envista-toric/'),
  ('Bausch + Lomb', 'enVista Aspire EA', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/enVista-Aspire/'),
  ('Bausch + Lomb', 'enVista Aspire Toric ETA', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/enVista-Aspire/'),
  ('Bausch + Lomb', 'enVista Envy EN', 'TRIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/envista-envy/'),
  ('Bausch + Lomb', 'enVista Envy Toric ETN', 'TRIFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/envista-envy/'),
  ('Bausch + Lomb', 'IC-8 Apthera', 'EDOF', false, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/ic-8-apthera-iol/'),
  ('Bausch + Lomb', 'Crystalens AO AO1UV', 'OTRO', false, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/crystalens-and-trulign/'),
  ('Bausch + Lomb', 'Crystalens AO AO2UV', 'OTRO', false, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/crystalens-and-trulign/'),
  ('Bausch + Lomb', 'Trulign Toric', 'OTRO', true, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/crystalens-and-trulign/'),
  ('Bausch + Lomb', 'Akreos AO60', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/akreos/'),
  ('Bausch + Lomb', 'Akreos MI60L', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/akreos/'),
  ('Bausch + Lomb', 'SofPort LI61A0', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bauschsurgical.com/cataract/SofPort/'),
  ('Hoya', 'Vivinex Gemetric XY1-G / XY1-GP', 'TRIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.hoyasurgicaloptics.com/vivinex/gemetric'),
  ('Hoya', 'Vivinex Gemetric Plus', 'TRIFOCAL', false, false, 'Catalogo oficial del fabricante: https://www.hoyasurgicaloptics.com/vivinex/gemetric (revisar codigo/diseno)'),
  ('Hoya', 'Vivinex Gemetric Toric XY1-GT / XY1-GPT', 'TRIFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.hoyasurgicaloptics.com/vivinex/gemetric'),
  ('Hoya', 'Vivinex Gemetric Plus Toric', 'TRIFOCAL', true, false, 'Catalogo oficial del fabricante: https://www.hoyasurgicaloptics.com/vivinex/gemetric (revisar codigo/diseno)'),
  ('Hoya', 'Vivinex Impress XY1-EM', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.hoyasurgicaloptics.com/vivinex/impress'),
  ('Hoya', 'Vivinex multiSert XY1-SP', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.hoyasurgicaloptics.com/vivinex/iol'),
  ('Hoya', 'Vivinex multiSert XC1-SP', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.hoyasurgicaloptics.com/vivinex/iol'),
  ('Hoya', 'Vivinex Toric multiSert XY1A-SP', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.hoyasurgicaloptics.com/vivinex/toric/iol'),
  ('Hoya', 'Nanex multiSert+', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.hoyasurgicaloptics.com/nanex'),
  ('Rayner', 'RayOne Aspheric RAO600C', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://rayner.com/us/en/iol/monofocal/rayone-aspheric/'),
  ('Rayner', 'RayOne Spheric RAO100C', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://rayner.com/us/en/iol/monofocal/rayone-spheric/'),
  ('Rayner', 'RayOne Hydrophobic', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://rayner.com/global/en/iol/rayone-family/'),
  ('Rayner', 'RayOne Hydrophobic BLF', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://rayner.com/global/en/iol/rayone-family/'),
  ('Rayner', 'RayOne Toric', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://rayner.com/global/en/iol/rayone-family/'),
  ('Rayner', 'RayOne EMV', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://rayner.com/us/en/iol/rayone-emv/'),
  ('Rayner', 'RayOne EMV Toric RAO210T', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://rayner.com/us/en/iol/rayone-emv/'),
  ('Rayner', 'RayOne Trifocal', 'TRIFOCAL', false, true, 'Catalogo oficial del fabricante: https://rayner.com/global/en/iol/trifocal/'),
  ('Rayner', 'RayOne Trifocal Toric', 'TRIFOCAL', true, true, 'Catalogo oficial del fabricante: https://rayner.com/global/en/iol/trifocal/'),
  ('Rayner', 'RayOne Galaxy', 'MULTIFOCAL', false, true, 'Catalogo oficial del fabricante: https://rayner.com/global/en/iol/rayone-family/'),
  ('Rayner', 'RayOne Galaxy Toric', 'MULTIFOCAL', true, true, 'Catalogo oficial del fabricante: https://rayner.com/global/en/iol/rayone-family/'),
  ('BVI', 'FINEVISION HP (POD F GF)', 'TRIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bvimedical.com/trifocal-and-trifocal-toric-iols/'),
  ('BVI', 'FINEVISION HP TORIC (POD FT 49P)', 'TRIFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.bvimedical.com/trifocal-and-trifocal-toric-iols/'),
  ('BVI', 'FINEVISION (POD F)', 'TRIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bvimedical.com/trifocal-and-trifocal-toric-iols/'),
  ('BVI', 'FINEVISION Toric (POD FT)', 'TRIFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.bvimedical.com/trifocal-and-trifocal-toric-iols/'),
  ('BVI', 'FINEVISION (MICRO F)', 'TRIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bvimedical.com/trifocal-and-trifocal-toric-iols/'),
  ('BVI', 'ISOPURE', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bvimedical.com/premium-monofocal-and-premium-monofocal-toric-iols/'),
  ('BVI', 'ISOPURE SERENITY', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bvimedical.com/premium-monofocal-and-premium-monofocal-toric-iols/'),
  ('BVI', 'SERENITY TORIC', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.bvimedical.com/premium-monofocal-and-premium-monofocal-toric-iols/'),
  ('BVI', 'PODEYE', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bvimedical.com/monofocal-and-monofocal-toric-iols/'),
  ('BVI', 'MICROPURE', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.bvimedical.com/monofocal-and-monofocal-toric-iols/'),
  ('BVI', 'PODEYE TORIC', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.bvimedical.com/monofocal-and-monofocal-toric-iols/'),
  ('BVI', 'ANKORIS', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.bvimedical.com/monofocal-and-monofocal-toric-iols/'),
  ('Medicontur', 'Bi-Flex Liberty 677M / 677MY', 'TRIFOCAL', false, true, 'Catalogo oficial del fabricante: https://medicontur.com/professionals/products/intraocular-lenses/trifocal/liberty'),
  ('Medicontur', 'Bi-Flex Liberty Toric', 'TRIFOCAL', true, true, 'Catalogo oficial del fabricante: https://medicontur.com/professionals/products/intraocular-lenses/toric/liberty-toric'),
  ('Medicontur', 'Bi-Flex HL (AD)', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://medicontur.com/professionals/products/intraocular-lenses/monofocal/bi-flex-hl-ad'),
  ('Medicontur', 'Bi-Flex HB', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://medicontur.com/professionals/products/intraocular-lenses/monofocal/bi-flex-hb'),
  ('Medicontur', 'Bi-Flex Preloaded (PIL-MA)', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://medicontur.com/professionals/products/intraocular-lenses/monofocal/bi-flex-pil-ma'),
  ('Medicontur', 'Bi-Flex POB-MA', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://medicontur.com/professionals/products/intraocular-lenses/preloaded/bi-flex-pob-ma'),
  ('Medicontur', 'Bi-Flex T', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://medicontur.com/professionals/products/intraocular-lenses/toric/bi-flex-t'),
  ('Medicontur', 'Z-Flex HL (AD)', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://medicontur.com/professionals/products/intraocular-lenses/monofocal/z-flex-hl-ad'),
  ('Medicontur', 'Z-Flex HB', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://medicontur.com/professionals/products/intraocular-lenses/monofocal/z-flex-hb'),
  ('Medicontur', 'Z-Flex T 690TA / 690TAY', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://medicontur.com/professionals/products/intraocular-lenses/toric/z-flex-t'),
  ('Ophtec', 'Horizon Monofocal RS60AP-22 / RS60AP-26', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.ophtec.com/product-overview/cataract/horizon-monofocal'),
  ('Ophtec', 'Horizon Go 680', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.ophtec.com/product-overview/cataract/horizon-go'),
  ('Ophtec', 'Precizon Monofocal 560', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.ophtec.com/product-overview/cataract/precizon-monofocal'),
  ('Ophtec', 'Precizon Toric 565', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.ophtec.com/product-overview/cataract/precizon-toric'),
  ('Ophtec', 'Precizon Go 580', 'EDOF', false, true, 'Catalogo oficial del fabricante: https://www.ophtec.com/product-overview/cataract/precizon-go'),
  ('Ophtec', 'Precizon Go Toric 585', 'EDOF', true, true, 'Catalogo oficial del fabricante: https://www.ophtec.com/product-overview/cataract/precizon-go-toric'),
  ('Ophtec', 'Precizon Presbyopic NVA 570A1', 'MULTIFOCAL', false, false, 'Catalogo oficial del fabricante: https://www.ophtec.com/product-overview/cataract/precizon-presbyopic (revisar codigo/diseno)'),
  ('Ophtec', 'Precizon Presbyopic Toric 575', 'MULTIFOCAL', true, false, 'Catalogo oficial del fabricante: https://www.ophtec.com/product-overview/cataract/precizon-presbyopic-toric (revisar codigo/diseno)'),
  ('Ophtec', 'Artisan Aphakia 205', 'OTRO', false, true, 'Catalogo oficial del fabricante: https://www.ophtec.com/product-overview/cataract/artisan-aphakia'),
  ('Ophtec', 'Quadrimax 545', 'OTRO', false, true, 'Catalogo oficial del fabricante: https://www.ophtec.com/product-overview/cataract/quadrimax'),
  ('Ophtec', 'Precisal P302AC / P302A', 'OTRO', false, true, 'Catalogo oficial del fabricante: https://www.ophtec.com/product-overview/cataract/precisal'),
  ('Ophtec', 'Precisal 3-piece 300AC', 'OTRO', false, true, 'Catalogo oficial del fabricante: https://www.ophtec.com/product-overview/cataract/precisal-3-piece'),
  ('Teleon', 'LENTIS Quantum', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.teleon-surgical.com/en/international/products/lentis-iol/'),
  ('Teleon', 'LENTIS Quantum Toric', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.teleon-surgical.com/en/international/products/lentis-iol/'),
  ('Teleon', 'LENTIS Comfort', 'EDOF', false, true, 'Catalogo oficial del fabricante: https://www.teleon-surgical.com/en/international/products/lentis-iol/'),
  ('Teleon', 'LENTIS Mplus', 'MULTIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.teleon-surgical.com/en/international/products/lentis-iol/'),
  ('Teleon', 'LENTIS Mplus X Toric', 'MULTIFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.teleon-surgical.com/en/international/products/lentis-iol/'),
  ('Teleon', 'LENTIS Tplus X', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.teleon-surgical.com/en/international/products/lentis-iol/'),
  ('Lenstec', 'ClearView 3', 'MULTIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.lenstec.com/products/clearview-3/'),
  ('Lenstec', 'ClearView 2', 'MULTIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.lenstec.com/products/clearview-2/'),
  ('Lenstec', 'Softec I', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.lenstec.com/products/softec-i/'),
  ('Lenstec', 'Softec HD', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.lenstec.com/products/softec-hd-including-click-injector/'),
  ('Lenstec', 'Softec HDO', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.lenstec.com/products/softec-hdo/'),
  ('Lenstec', 'Softec HDY', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.lenstec.com/products/softec-hdy/'),
  ('Lenstec', 'Softec HD3', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.lenstec.com/products/softec-hd3/'),
  ('Hanita', 'Intensity HP (SL HP)', 'MULTIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.hanitalenses.com/intraocular-implants/multifocal/intensity/'),
  ('Hanita', 'Intensity Toric HP', 'MULTIFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.hanitalenses.com/intraocular-implants/multifocal/intensity/'),
  ('Hanita', 'Intensity (Pentafocal)', 'MULTIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.hanitalenses.com/intraocular-implants/multifocal/intensity-pentafocal/'),
  ('Hanita', 'FullRange', 'MULTIFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.hanitalenses.com/intraocular-implants/multifocal/fullrange/'),
  ('Hanita', 'Extend', 'EDOF', false, true, 'Catalogo oficial del fabricante: https://www.hanitalenses.com/intraocular-implants/extended-vision/extend/'),
  ('Hanita', 'Active', 'EDOF', false, true, 'Catalogo oficial del fabricante: https://www.hanitalenses.com/intraocular-implants/extended-vision/active/'),
  ('Hanita', 'Aspheric AF', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.hanitalenses.com/intraocular-implants/monofocal/aspheric-af/'),
  ('Hanita', 'Aspheric HP', 'MONOFOCAL', false, true, 'Catalogo oficial del fabricante: https://www.hanitalenses.com/intraocular-implants/monofocal/aspheric-hp/'),
  ('Hanita', 'VisTor', 'MONOFOCAL', true, true, 'Catalogo oficial del fabricante: https://www.hanitalenses.com/intraocular-implants/monofocal/vistor/')
) AS v(fabricante, modelo, diseno, torico, verificado, notas)
ON CONFLICT (lower(fabricante), lower(modelo), torico) DO UPDATE
   SET activo = true, diseno = EXCLUDED.diseno, verificado = EXCLUDED.verificado,
       notas = EXCLUDED.notas, updated_at = now()
 -- Solo reemplaza filas de la lista general previa; lo capturado por la clinica no se toca.
 WHERE cat_modelos_lio.notas = 'Precargado (lista general); verificar en ESCRS/IOLCon';

COMMIT;

-- Verificacion: modelos activos por fabricante
SELECT fabricante, count(*) AS modelos, count(*) FILTER (WHERE torico) AS toricos
  FROM cat_modelos_lio WHERE activo GROUP BY fabricante ORDER BY fabricante;
