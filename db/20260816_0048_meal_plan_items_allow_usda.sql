-- FASE 6 — Permite USDA como fonte estruturada em itens de plano.
-- Reconstroi meal_plan_items apenas para ampliar o CHECK de food_source,
-- preservando todos os campos adicionados nas fases anteriores.
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
  food_source TEXT NULL CHECK (food_source IS NULL OR food_source IN ('TACO', 'CUSTOM', 'MANUFACTURER', 'USDA')),
  food_ref_id TEXT NULL,
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
