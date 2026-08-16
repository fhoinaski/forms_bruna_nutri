-- FASE 6 — Schema para USDA selecionado.
--
-- Cria catalogo USDA separado da TACO JSON. Esta migration nao importa
-- nenhum alimento; apenas prepara tabelas LONG para poucos milhares de
-- registros selecionados via dry-run/importador futuro.

CREATE TABLE IF NOT EXISTS food_catalog_usda_foods (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'USDA' CHECK (source = 'USDA'),
  source_id TEXT NOT NULL,
  upstream_source TEXT NOT NULL CHECK (upstream_source IN ('USDA_FOUNDATION', 'USDA_SR_LEGACY')),
  upstream_source_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  food_group TEXT NULL,
  data_quality TEXT NULL,
  source_url TEXT NULL,
  source_version TEXT NULL,
  import_run_id TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, source_id)
);

CREATE INDEX IF NOT EXISTS food_catalog_usda_foods_search_idx
  ON food_catalog_usda_foods(normalized_name, upstream_source, data_quality);

CREATE TABLE IF NOT EXISTS food_catalog_usda_nutrients (
  id TEXT PRIMARY KEY,
  food_id TEXT NOT NULL REFERENCES food_catalog_usda_foods(id) ON DELETE CASCADE,
  nutrient_code TEXT NOT NULL,
  value REAL NULL,
  unit TEXT NOT NULL CHECK (unit IN ('g', 'mg', 'mcg', 'kcal', 'kJ')),
  basis_amount REAL NOT NULL DEFAULT 100 CHECK (basis_amount > 0),
  basis_unit TEXT NOT NULL DEFAULT 'g' CHECK (basis_unit IN ('g', 'ml')),
  source TEXT NOT NULL DEFAULT 'USDA' CHECK (source = 'USDA'),
  provenance TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(food_id, nutrient_code)
);

CREATE INDEX IF NOT EXISTS food_catalog_usda_nutrients_food_idx
  ON food_catalog_usda_nutrients(food_id);
