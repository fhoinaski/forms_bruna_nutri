-- Substituições nutricionais equivalentes por item (evolução da tabela
-- meal_plan_substitutions já existente, que hoje só guarda pares de texto
-- livre base_food/option_food vindos de templates de "grupo de troca" —
-- nunca ligados a um item específico, sem identidade estruturada, sem score,
-- sem aprovação). Em vez de criar uma tabela nova (o pedido pede
-- explicitamente para evoluir, não duplicar), estende a mesma tabela.
--
-- Por que base_food_source/base_food_ref_id (não um item_id FK): os itens do
-- plano são recriados (DELETE + INSERT com novo id) a cada save
-- (buildMealPlanDetailStatements em lib/repositories/meal-plans.ts), então
-- um id de item nunca é estável entre salvamentos — é exatamente por isso
-- que a tabela original já usa base_food (texto) como chave de agrupamento
-- em vez de uma FK. Aqui generalizamos essa mesma ideia para incluir a
-- identidade estruturada do alimento-base (fonte+refId), quando existir,
-- o que é robusto a reordenação/re-save e evita ambiguidade entre dois itens
-- com o mesmo nome de exibição.
--
-- approved_by_professional default 1: linhas existentes (criadas por
-- templates SUBSTITUICAO ou digitação manual no editor) já eram, por
-- definição, curadoria humana — continuam aparecendo em impressão/portal
-- sem qualquer mudança de comportamento. Só sugestões novas vindas da IA
-- inserem explicitamente 0 (nunca aparecem até a nutricionista aprovar).

ALTER TABLE meal_plan_substitutions ADD COLUMN base_food_source TEXT NULL;
ALTER TABLE meal_plan_substitutions ADD COLUMN base_food_ref_id TEXT NULL;
ALTER TABLE meal_plan_substitutions ADD COLUMN option_food_source TEXT NULL;
ALTER TABLE meal_plan_substitutions ADD COLUMN option_food_ref_id TEXT NULL;
ALTER TABLE meal_plan_substitutions ADD COLUMN option_household_measure_id TEXT NULL;
ALTER TABLE meal_plan_substitutions ADD COLUMN option_nutrition_snapshot TEXT NULL;
ALTER TABLE meal_plan_substitutions ADD COLUMN equivalence_mode TEXT NULL;
ALTER TABLE meal_plan_substitutions ADD COLUMN equivalence_score REAL NULL;
ALTER TABLE meal_plan_substitutions ADD COLUMN equivalence_quality TEXT NULL;
ALTER TABLE meal_plan_substitutions ADD COLUMN approved_by_professional INTEGER NOT NULL DEFAULT 1;
ALTER TABLE meal_plan_substitutions ADD COLUMN ai_suggested INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_meal_plan_substitutions_base_identity
ON meal_plan_substitutions(meal_plan_id, base_food_source, base_food_ref_id);
