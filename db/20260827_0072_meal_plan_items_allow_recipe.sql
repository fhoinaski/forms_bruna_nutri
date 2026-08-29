-- R6 (seções 33-34) — permite um item de refeição referenciar uma RECEITA
-- (food_source = 'RECIPE', food_ref_id = recipes.id) como uma identidade
-- de item de primeira classe, ao lado de TACO/CUSTOM/MANUFACTURER/USDA/
-- TBCA/IBGE_POF — nunca convertendo a receita num "alimento canônico
-- fake": ela continua sendo resolvida pelo motor de nutrição através da
-- composição real de ingredientes (lib/nutrition/recipe-item.ts), nunca
-- por um valor gravado manualmente no item.
--
-- SQLite/D1 não suporta ALTER de CHECK constraint — reconstrói as duas
-- tabelas só para ampliar o CHECK de food_source, MESMO padrão já usado
-- em 0046/0048/0058, preservando 100% das linhas e colunas existentes.
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
  food_source TEXT NULL CHECK (food_source IS NULL OR food_source IN ('TACO', 'CUSTOM', 'MANUFACTURER', 'USDA', 'TBCA', 'IBGE_POF', 'RECIPE')),
  food_ref_id TEXT NULL,
  canonical_food_id TEXT NULL,
  household_measure_id TEXT NULL,
  food_name_snapshot TEXT NULL,
  nutrition_snapshot TEXT NULL,
  resolved_grams_snapshot REAL NULL,
  quantity_resolution_snapshot TEXT NULL,
  slot_food_group TEXT,
  slot_food_subgroup TEXT,
  slot_nutritional_role TEXT,
  quantity_locked INTEGER NOT NULL DEFAULT 0,
  substitutions_locked INTEGER NOT NULL DEFAULT 0,
  template_slot_id TEXT,
  slot_exchange_eligible INTEGER,
  meal_option_id TEXT NULL REFERENCES meal_plan_meal_options(id) ON DELETE CASCADE,
  choice_group_id TEXT NULL REFERENCES meal_plan_choice_groups(id) ON DELETE CASCADE,
  is_optional INTEGER NOT NULL DEFAULT 0 CHECK (is_optional IN (0, 1)),
  FOREIGN KEY (meal_id) REFERENCES meal_plan_meals(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO meal_plan_items_next
  (id, meal_id, food, quantity, unit, notes, sort_order, created_at, updated_at,
   food_source, food_ref_id, canonical_food_id, household_measure_id, food_name_snapshot, nutrition_snapshot,
   resolved_grams_snapshot, quantity_resolution_snapshot, slot_food_group, slot_food_subgroup, slot_nutritional_role,
   quantity_locked, substitutions_locked, template_slot_id, slot_exchange_eligible,
   meal_option_id, choice_group_id, is_optional)
SELECT
  id, meal_id, food, quantity, unit, notes, sort_order, created_at, updated_at,
  food_source, food_ref_id, canonical_food_id, household_measure_id, food_name_snapshot, nutrition_snapshot,
  resolved_grams_snapshot, quantity_resolution_snapshot, slot_food_group, slot_food_subgroup, slot_nutritional_role,
  quantity_locked, substitutions_locked, template_slot_id, slot_exchange_eligible,
  meal_option_id, choice_group_id, is_optional
FROM meal_plan_items;

DROP TABLE meal_plan_items;
ALTER TABLE meal_plan_items_next RENAME TO meal_plan_items;

CREATE INDEX IF NOT EXISTS idx_meal_plan_items_meal
  ON meal_plan_items(meal_id, sort_order);

-- diet_template_items — mesma ampliação, para que um modelo de plano
-- (protocol template) também possa carregar um item de receita (R4).
CREATE TABLE IF NOT EXISTS diet_template_items_next (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL,
  food TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  food_source TEXT NULL CHECK (food_source IS NULL OR food_source IN ('TACO', 'CUSTOM', 'MANUFACTURER', 'USDA', 'TBCA', 'IBGE_POF', 'RECIPE')),
  food_ref_id TEXT NULL,
  canonical_food_id TEXT NULL,
  FOREIGN KEY (meal_id) REFERENCES diet_template_meals(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO diet_template_items_next
  (id, meal_id, food, quantity, unit, notes, sort_order, created_at, updated_at,
   food_source, food_ref_id, canonical_food_id)
SELECT
  id, meal_id, food, quantity, unit, notes, sort_order, created_at, updated_at,
  food_source, food_ref_id, canonical_food_id
FROM diet_template_items;

DROP TABLE diet_template_items;
ALTER TABLE diet_template_items_next RENAME TO diet_template_items;

CREATE INDEX IF NOT EXISTS idx_diet_template_items_meal
ON diet_template_items(meal_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_diet_template_items_identity
ON diet_template_items(food_source, food_ref_id);
