-- FASE 6.5 (itens 3/4) — expande food_source de meal_plan_items pra aceitar
-- os matches canonicos confiaveis da TBCA/IBGE_POF, sem quebrar nenhum
-- valor existente (TACO/CUSTOM/MANUFACTURER/USDA continuam identicos).
-- Reconstroi a tabela so pra ampliar o CHECK (SQLite/D1 nao suporta ALTER
-- de CHECK constraint) — MESMO padrao ja usado em 0046/0048, preservando
-- 100% das linhas e colunas existentes.
--
-- item 3 (source identity): alem de food_source (sourceType) e
-- food_ref_id (sourceFoodId, ja existentes), adiciona canonical_food_id —
-- a identidade COMPLETA do lado canonico (ex.: "tbca:medidas_caseiras:
-- BRC0001C"), nunca inferida por convencao de string. NULL pra todo item
-- legado (TACO/CUSTOM/MANUFACTURER/USDA) e pra qualquer linha historica —
-- nenhum dado existente e reescrito.
-- migration:allow-destructive

CREATE TABLE IF NOT EXISTS meal_plan_items_next (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL,
  food TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  food_source TEXT NULL CHECK (food_source IS NULL OR food_source IN ('TACO', 'CUSTOM', 'MANUFACTURER', 'USDA', 'TBCA', 'IBGE_POF')),
  food_ref_id TEXT NULL,
  canonical_food_id TEXT NULL,
  household_measure_id TEXT NULL,
  food_name_snapshot TEXT NULL,
  nutrition_snapshot TEXT NULL,
  resolved_grams_snapshot REAL NULL,
  quantity_resolution_snapshot TEXT NULL,
  FOREIGN KEY (meal_id) REFERENCES meal_plan_meals(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO meal_plan_items_next
  (id, meal_id, food, quantity, unit, notes, sort_order, created_at, updated_at,
   food_source, food_ref_id, household_measure_id, food_name_snapshot, nutrition_snapshot,
   resolved_grams_snapshot, quantity_resolution_snapshot)
SELECT
  id, meal_id, food, quantity, unit, notes, sort_order, created_at, updated_at,
  food_source, food_ref_id, household_measure_id, food_name_snapshot, nutrition_snapshot,
  resolved_grams_snapshot, quantity_resolution_snapshot
FROM meal_plan_items;

DROP TABLE meal_plan_items;
ALTER TABLE meal_plan_items_next RENAME TO meal_plan_items;

CREATE INDEX IF NOT EXISTS idx_meal_plan_items_meal
  ON meal_plan_items(meal_id, sort_order);
