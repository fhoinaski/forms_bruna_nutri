-- FASE 8 — migração dos templates existentes (protocol_templates) para o
-- modelo estruturado por refeição/grupo/subgrupo/nutritionalRole/slot, sem
-- criar biblioteca paralela: os templates e IDs atuais são preservados,
-- só ganham uma camada adicional de estrutura (aditiva, backward-compatible).
--
-- diet_template_slots pendura de diet_template_meals (já existente) — cada
-- slot representa "que tipo de componente pode compor essa refeição" (item
-- 3/4 do pedido), nunca uma prescrição fixa. diet_template_slot_foods guarda
-- os alimentos específicos que já existiam em diet_template_items como
-- SUGESTÕES dentro do slot (item 7 — "não apagar informação sem análise"),
-- por isso quantity/unit aqui são OPCIONAIS (o alimento antigo vira dica,
-- não obrigação).
--
-- diet_template_items continua intocada — é o que a UI de CRUD de templates
-- (/dashboard/templates) já edita hoje; slots é uma camada nova ao lado,
-- não uma substituição (evita quebrar a UX existente, item 10).

CREATE TABLE IF NOT EXISTS diet_template_slots (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL,
  food_group TEXT NOT NULL CHECK (food_group IN ('CARBOHYDRATE', 'PROTEIN', 'DAIRY', 'FRUIT', 'VEGETABLE', 'FAT', 'MIXED_DISH', 'OTHER')),
  food_subgroup TEXT NOT NULL,
  nutritional_role TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  exchange_eligible INTEGER NOT NULL DEFAULT 1,
  min_items INTEGER NOT NULL DEFAULT 1,
  max_items INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (meal_id) REFERENCES diet_template_meals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_diet_template_slots_meal
ON diet_template_slots(meal_id, sort_order);

CREATE TABLE IF NOT EXISTS diet_template_slot_foods (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL,
  food TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  source_item_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (slot_id) REFERENCES diet_template_slots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_diet_template_slot_foods_slot
ON diet_template_slot_foods(slot_id, sort_order);

-- Metadados de versionamento/risco clínico do template (item 11/13). Default
-- conservador (risco baixo, sem exigência de revisão, versão 1, estrutura
-- "legacy") preserva o comportamento/leitura de todo template ainda não
-- migrado por este script.
ALTER TABLE protocol_templates ADD COLUMN clinical_risk_level TEXT NOT NULL DEFAULT 'low' CHECK (clinical_risk_level IN ('low', 'medium', 'high'));
ALTER TABLE protocol_templates ADD COLUMN requires_professional_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE protocol_templates ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE protocol_templates ADD COLUMN structure_version TEXT NOT NULL DEFAULT 'legacy' CHECK (structure_version IN ('legacy', 'v2'));

-- Proveniência do template usado para criar o plano (item 13). NULL em todo
-- plano já existente — planos históricos nunca mudam retroativamente.
ALTER TABLE meal_plans ADD COLUMN template_id TEXT;
ALTER TABLE meal_plans ADD COLUMN template_version INTEGER;

-- Proveniência de slot no item do plano (item 8, "criar food slots/grupos"
-- na refeição criada a partir do template) — aditivo, nulo pra todo item já
-- existente e para itens criados manualmente ou pela IA sem origem de slot.
ALTER TABLE meal_plan_items ADD COLUMN slot_food_group TEXT;
ALTER TABLE meal_plan_items ADD COLUMN slot_food_subgroup TEXT;
ALTER TABLE meal_plan_items ADD COLUMN slot_nutritional_role TEXT;
