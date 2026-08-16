-- FASE 9 — Search index para catalogo USDA selecionado.
--
-- Mantem o nome original intacto e adiciona estruturas minimas para comparar
-- contains, prefix e FTS sem indexar nutrientes.

CREATE INDEX IF NOT EXISTS food_catalog_usda_foods_normalized_name_idx
  ON food_catalog_usda_foods(normalized_name);

CREATE VIRTUAL TABLE IF NOT EXISTS food_catalog_usda_foods_fts USING fts5(
  food_id UNINDEXED,
  normalized_name,
  original_name,
  tokenize = 'unicode61'
);
