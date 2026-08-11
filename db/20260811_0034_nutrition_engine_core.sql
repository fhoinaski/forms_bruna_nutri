-- FASE 2 — Motor Nutricional / Plano Alimentar 2.0.
--
-- Tudo aditivo: nenhuma coluna existente muda de tipo ou e removida, nenhum
-- CHECK existente e alterado. Planos e itens antigos continuam funcionando
-- exatamente como hoje (colunas novas ficam NULL).
--
-- meal_plan_items.food (texto livre) continua sendo a fonte da verdade para
-- exibicao. food_source/food_ref_id sao um vinculo OPCIONAL a um alimento
-- estruturado (TACO por numero, ou um registro em custom_foods) — quando
-- ausentes, o calculo cai para o match aproximado por texto ja existente
-- (findBestFoodReference), igual ao comportamento atual.
ALTER TABLE meal_plan_items ADD COLUMN food_source TEXT NULL
  CHECK (food_source IS NULL OR food_source IN ('TACO', 'CUSTOM', 'MANUFACTURER'));
ALTER TABLE meal_plan_items ADD COLUMN food_ref_id TEXT NULL;

-- Metas nutricionais do plano (seçao 11 do pedido) — a nutricionista define
-- manualmente; nao ha calculo clinico automatico de necessidade energetica
-- no projeto hoje e nao inventamos um aqui (seçao 12 do pedido).
ALTER TABLE meal_plans ADD COLUMN target_energy_kcal REAL NULL;
ALTER TABLE meal_plans ADD COLUMN target_protein_g REAL NULL;
ALTER TABLE meal_plans ADD COLUMN target_carbohydrate_g REAL NULL;
ALTER TABLE meal_plans ADD COLUMN target_fat_g REAL NULL;

-- Alimentos personalizados (seçao 9 do pedido) — sem coluna de dono: clinica
-- de uma unica nutricionista, mesma decisao ja documentada no hardening
-- anterior para outras tabelas administrativas.
CREATE TABLE IF NOT EXISTS custom_foods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NULL,
  source TEXT NOT NULL CHECK (source IN ('CUSTOM', 'MANUFACTURER')),
  portion_base_grams REAL NOT NULL DEFAULT 100,
  energy_kcal REAL NULL,
  protein_g REAL NULL,
  carbohydrate_g REAL NULL,
  fat_g REAL NULL,
  fiber_g REAL NULL,
  sodium_mg REAL NULL,
  calcium_mg REAL NULL,
  iron_mg REAL NULL,
  potassium_mg REAL NULL,
  vitamin_c_mg REAL NULL,
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS custom_foods_name_idx ON custom_foods(name);

-- Medidas caseiras (seçao 6 do pedido) — arquitetura pronta para qualquer
-- alimento (TACO ou custom), populada apenas com um ponto de partida de
-- alimentos comuns nesta rodada (nao e cobertura completa da base TACO,
-- que exigiria uma fonte de dados que nao temos hoje — documentado no
-- relatorio final da FASE 2). Quando nao ha linha aqui para um alimento, o
-- calculo cai para a aproximacao generica por unidade ja existente em
-- lib/nutrition/macros.ts (quantityInGrams) — nunca inventamos um peso.
CREATE TABLE IF NOT EXISTS food_portions (
  id TEXT PRIMARY KEY,
  food_source TEXT NOT NULL CHECK (food_source IN ('TACO', 'CUSTOM')),
  food_ref_id TEXT NOT NULL,
  description TEXT NOT NULL,
  gram_equivalent REAL NOT NULL,
  source TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS food_portions_ref_idx ON food_portions(food_source, food_ref_id);

-- Seed inicial — numeros TACO conferidos contra
-- lib/nutrition/data/taco.json (179=Banana nanica crua, 488=Ovo de galinha
-- inteiro cozido, 53=Pao trigo frances, 3=Arroz tipo 1 cozido, 561=Feijao
-- carioca cozido, 458=Leite de vaca integral). Gramaturas sao referencias de
-- mercado comuns (peso medio de porcao), NAO um dado publicado pela propria
-- TACO (que so publica valores por 100g) — ponto de partida documentado,
-- nao cobertura completa da base.
INSERT INTO food_portions (id, food_source, food_ref_id, description, gram_equivalent, source, created_at) VALUES
  ('seed-taco-179-unidade', 'TACO', '179', '1 unidade media', 90, 'Referência de mercado comum', CURRENT_TIMESTAMP),
  ('seed-taco-488-unidade', 'TACO', '488', '1 unidade', 50, 'Referência de mercado comum', CURRENT_TIMESTAMP),
  ('seed-taco-53-unidade', 'TACO', '53', '1 unidade', 50, 'Referência de mercado comum', CURRENT_TIMESTAMP),
  ('seed-taco-3-colher-sopa', 'TACO', '3', '1 colher de sopa cheia', 20, 'Referência de mercado comum', CURRENT_TIMESTAMP),
  ('seed-taco-561-concha', 'TACO', '561', '1 concha media', 80, 'Referência de mercado comum', CURRENT_TIMESTAMP),
  ('seed-taco-458-copo', 'TACO', '458', '1 copo (200ml)', 200, 'Referência de mercado comum', CURRENT_TIMESTAMP);
