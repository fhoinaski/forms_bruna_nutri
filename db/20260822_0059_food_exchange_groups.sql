-- FASE 7 (itens 2/6/24) — Food Exchange Groups: cada item do plano pode
-- ter um grupo de troca (alimento principal + alternativas aprovadas).
--
-- Vinculado por (meal_plan_id, primary_food_source, primary_food_ref_id)
-- — NUNCA por meal_plan_item_id — porque meal_plan_items é recriado do
-- zero a cada save (DELETE+INSERT com ids novos, ver
-- lib/repositories/meal-plans.ts#buildMealPlanDetailStatements), o MESMO
-- motivo pelo qual meal_plan_substitutions já usa identidade fonte+refId
-- em vez de item_id. meal_plans.id em si é estável entre saves.
--
-- exchange_group_alternatives.state (item 13): SUGGESTED/APPROVED/EDITED/
-- REJECTED — só APPROVED aparece ao paciente (item 22). A IA NUNCA grava
-- um estado diferente de SUGGESTED (aplicado em código, não no schema —
-- ver lib/repositories/exchange-groups.ts).

CREATE TABLE IF NOT EXISTS exchange_groups (
  id TEXT PRIMARY KEY,
  meal_plan_id TEXT NOT NULL,
  primary_food_source TEXT NOT NULL,
  primary_food_ref_id TEXT NOT NULL,
  primary_canonical_food_id TEXT NULL,
  primary_food_name TEXT NOT NULL,
  primary_quantity_grams REAL NOT NULL,
  food_group TEXT NOT NULL,
  food_subgroup TEXT NOT NULL,
  nutritional_role TEXT NOT NULL,
  -- item 6 — alvo nutricional CONGELADO no momento da geração (nunca
  -- recalculado automaticamente depois — se a nutricionista quiser um
  -- alvo novo, regenera o grupo explicitamente).
  target_energy_kcal REAL NULL,
  target_protein_g REAL NULL,
  target_carbohydrate_g REAL NULL,
  target_fat_g REAL NULL,
  target_fiber_g REAL NULL,
  -- item 18 — cross-group desligado por padrão.
  allow_cross_group INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exchange_groups_plan ON exchange_groups(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_exchange_groups_primary ON exchange_groups(meal_plan_id, primary_food_source, primary_food_ref_id);

CREATE TABLE IF NOT EXISTS exchange_group_alternatives (
  id TEXT PRIMARY KEY,
  exchange_group_id TEXT NOT NULL,
  food_source TEXT NOT NULL,
  food_ref_id TEXT NOT NULL,
  canonical_food_id TEXT NULL,
  food_name TEXT NOT NULL,
  quantity_grams REAL NOT NULL,
  energy_kcal REAL NULL,
  protein_g REAL NULL,
  carbohydrate_g REAL NULL,
  fat_g REAL NULL,
  fiber_g REAL NULL,
  score REAL NULL,
  quality TEXT NULL CHECK (quality IS NULL OR quality IN ('EXCELLENT', 'GOOD', 'REVIEW', 'UNSUITABLE')),
  same_subgroup INTEGER NOT NULL DEFAULT 0,
  same_group INTEGER NOT NULL DEFAULT 0,
  -- item 13 — máquina de estados de aprovação. Default SUGGESTED em toda
  -- linha nova, inclusive as vindas da IA (item 12: AI_CAN_APPROVE=false,
  -- aplicado no repositório — nunca insere já APPROVED vindo de sugestão
  -- automática).
  state TEXT NOT NULL DEFAULT 'SUGGESTED' CHECK (state IN ('SUGGESTED', 'APPROVED', 'EDITED', 'REJECTED')),
  ai_suggested INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exchange_group_id) REFERENCES exchange_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exchange_alternatives_group ON exchange_group_alternatives(exchange_group_id);
CREATE INDEX IF NOT EXISTS idx_exchange_alternatives_state ON exchange_group_alternatives(exchange_group_id, state);
