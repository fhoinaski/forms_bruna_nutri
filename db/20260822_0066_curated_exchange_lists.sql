-- FASE 9 — Curated Exchange Lists.
-- A lista curada define QUEM pode entrar como equivalente; as quantidades
-- continuam calculadas pelo Food Exchange/Substitution Engine existente.

CREATE TABLE IF NOT EXISTS exchange_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('SYSTEM', 'USER')),
  owner_admin_id TEXT,
  food_group TEXT NOT NULL,
  food_subgroup TEXT,
  nutritional_role TEXT,
  meal_context TEXT,
  culinary_role TEXT,
  default_profile TEXT NOT NULL DEFAULT 'BALANCED' CHECK (default_profile IN ('BALANCED', 'ENERGY', 'PROTEIN', 'CARBOHYDRATE', 'FAT', 'FIBER')),
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exchange_lists_context
ON exchange_lists(active, origin, food_group, nutritional_role, meal_context, culinary_role);

CREATE INDEX IF NOT EXISTS idx_exchange_lists_owner
ON exchange_lists(origin, owner_admin_id, active);

CREATE TABLE IF NOT EXISTS exchange_list_items (
  id TEXT PRIMARY KEY,
  exchange_list_id TEXT NOT NULL,
  food_source TEXT NOT NULL,
  food_ref_id TEXT NOT NULL,
  canonical_food_id TEXT,
  display_name TEXT NOT NULL,
  family TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (exchange_list_id) REFERENCES exchange_lists(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_exchange_list_items_identity
ON exchange_list_items(exchange_list_id, food_source, food_ref_id, COALESCE(canonical_food_id, ''));

CREATE INDEX IF NOT EXISTS idx_exchange_list_items_list
ON exchange_list_items(exchange_list_id, active, priority);

ALTER TABLE diet_template_slots ADD COLUMN exchange_list_id TEXT;
CREATE INDEX IF NOT EXISTS idx_diet_template_slots_exchange_list
ON diet_template_slots(exchange_list_id);

ALTER TABLE exchange_groups ADD COLUMN exchange_list_id TEXT;
ALTER TABLE exchange_groups ADD COLUMN exchange_list_version INTEGER;
ALTER TABLE exchange_groups ADD COLUMN exchange_generation_mode TEXT;

ALTER TABLE exchange_group_alternatives ADD COLUMN candidate_origin TEXT NOT NULL DEFAULT 'AUTOMATIC_ENGINE'
  CHECK (candidate_origin IN ('CURATED_TEMPLATE_LIST', 'CURATED_CONTEXT_LIST', 'AUTOMATIC_ENGINE', 'AI_REVIEWED'));

INSERT OR IGNORE INTO exchange_lists
  (id, name, slug, description, origin, owner_admin_id, food_group, food_subgroup, nutritional_role, meal_context, culinary_role, default_profile, active, version, created_at, updated_at)
VALUES
  ('exl-system-main-meal-starches', 'Carboidratos — refeição principal', 'MAIN_MEAL_STARCHES', 'Amidos culinariamente naturais para almoço e jantar.', 'SYSTEM', NULL, 'CARBOHYDRATE', NULL, 'STARCH_SOURCE', 'LUNCH,DINNER', 'STARCH_MAIN', 'CARBOHYDRATE', 1, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exl-system-breakfast-carbs', 'Carboidratos — café/lanche', 'BREAKFAST_CARBS', 'Bases de carboidrato para café da manhã e lanches.', 'SYSTEM', NULL, 'CARBOHYDRATE', NULL, 'STARCH_SOURCE', 'BREAKFAST,MORNING_SNACK,AFTERNOON_SNACK,SUPPER', 'BREAKFAST_CARB', 'BALANCED', 1, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exl-system-lean-main-proteins', 'Proteínas magras — refeição principal', 'LEAN_MAIN_PROTEINS', 'Proteínas principais para almoço e jantar.', 'SYSTEM', NULL, 'PROTEIN', NULL, 'LEAN_PROTEIN', 'LUNCH,DINNER', 'LEAN_PROTEIN_MAIN', 'PROTEIN', 1, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exl-system-fruit-portions', 'Frutas', 'FRUIT_PORTIONS', 'Porções de frutas para café e lanches.', 'SYSTEM', NULL, 'FRUIT', 'GENERIC_FRUIT', 'FRUIT_SOURCE', 'BREAKFAST,MORNING_SNACK,AFTERNOON_SNACK,SUPPER', 'FRUIT_PORTION', 'FIBER', 1, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exl-system-dairy-options', 'Laticínios', 'DAIRY_OPTIONS', 'Laticínios para lanches e complementos.', 'SYSTEM', NULL, 'DAIRY', NULL, 'DAIRY_SOURCE', 'BREAKFAST,MORNING_SNACK,AFTERNOON_SNACK,SUPPER', 'DAIRY_SNACK', 'PROTEIN', 1, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exl-system-legume-options', 'Leguminosas', 'LEGUME_OPTIONS', 'Leguminosas para refeições principais.', 'SYSTEM', NULL, 'PROTEIN', 'LEGUME', 'PLANT_PROTEIN', 'LUNCH,DINNER', 'LEGUME_SIDE', 'PROTEIN', 1, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exl-system-vegetable-sides', 'Vegetais', 'VEGETABLE_SIDES', 'Vegetais e acompanhamentos de baixo risco para refeições.', 'SYSTEM', NULL, 'VEGETABLE', 'GENERIC_VEGETABLE', 'VEGETABLE_SOURCE', 'LUNCH,DINNER', 'VEGETABLE_SIDE', 'FIBER', 1, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z');

INSERT OR IGNORE INTO exchange_list_items
  (id, exchange_list_id, food_source, food_ref_id, canonical_food_id, display_name, family, priority, active, created_at, updated_at)
VALUES
  ('exli-main-rice-white', 'exl-system-main-meal-starches', 'TACO', '3', NULL, 'Arroz, tipo 1, cozido', 'RICE', 10, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-main-rice-brown', 'exl-system-main-meal-starches', 'TACO', '1', NULL, 'Arroz, integral, cozido', 'RICE', 11, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-main-sweet-potato', 'exl-system-main-meal-starches', 'TACO', '88', NULL, 'Batata, doce, cozida', 'TUBER', 20, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-main-potato', 'exl-system-main-meal-starches', 'TACO', '91', NULL, 'Batata, inglesa, cozida', 'TUBER', 21, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-main-mandioca', 'exl-system-main-meal-starches', 'TACO', '129', NULL, 'Mandioca, cozida', 'ROOT', 30, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-main-cuscuz', 'exl-system-main-meal-starches', 'TACO', '533', NULL, 'Cuscuz, de milho, cozido com sal', 'COUSCOUS', 40, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),

  ('exli-breakfast-bread-integral', 'exl-system-breakfast-carbs', 'TACO', '52', NULL, 'Pão, trigo, forma, integral', 'BREAD', 10, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-breakfast-bread-french', 'exl-system-breakfast-carbs', 'TACO', '53', NULL, 'Pão, trigo, francês', 'BREAD', 11, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-breakfast-tapioca', 'exl-system-breakfast-carbs', 'TACO', '551', NULL, 'Tapioca, com manteiga', 'TAPIOCA', 20, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-breakfast-cuscuz', 'exl-system-breakfast-carbs', 'TACO', '533', NULL, 'Cuscuz, de milho, cozido com sal', 'COUSCOUS', 30, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-breakfast-oat', 'exl-system-breakfast-carbs', 'TACO', '7', NULL, 'Aveia, flocos, crua', 'OAT', 40, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-breakfast-toast', 'exl-system-breakfast-carbs', 'TACO', '63', NULL, 'Torrada, pão francês', 'TOAST', 50, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),

  ('exli-protein-chicken', 'exl-system-lean-main-proteins', 'TACO', '410', NULL, 'Frango, peito, sem pele, grelhado', 'POULTRY', 10, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-protein-fish', 'exl-system-lean-main-proteins', 'TACO', '312', NULL, 'Pintado, cru', 'FISH', 20, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-protein-beef', 'exl-system-lean-main-proteins', 'TACO', '368', NULL, 'Carne, bovina, maminha, grelhada', 'RED_MEAT', 30, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),

  ('exli-fruit-banana', 'exl-system-fruit-portions', 'TACO', '182', NULL, 'Banana, prata, crua', 'BANANA', 10, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-fruit-papaya', 'exl-system-fruit-portions', 'TACO', '226', NULL, 'Mamão, Papaia, cru', 'PAPAYA', 20, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-fruit-orange', 'exl-system-fruit-portions', 'TACO', '208', NULL, 'Laranja, baía, crua', 'ORANGE', 30, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-fruit-pineapple', 'exl-system-fruit-portions', 'TACO', '164', NULL, 'Abacaxi, cru', 'PINEAPPLE', 40, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),

  ('exli-dairy-milk', 'exl-system-dairy-options', 'TACO', '458', NULL, 'Leite, de vaca, integral', 'MILK', 10, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-dairy-yogurt', 'exl-system-dairy-options', 'TACO', '448', NULL, 'Iogurte, natural', 'YOGURT', 20, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-dairy-cheese', 'exl-system-dairy-options', 'TACO', '461', NULL, 'Queijo, minas, frescal', 'CHEESE', 30, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),

  ('exli-legume-beans', 'exl-system-legume-options', 'TACO', '561', NULL, 'Feijão, carioca, cozido', 'BEANS', 10, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-legume-lentil', 'exl-system-legume-options', 'TACO', '577', NULL, 'Lentilha, cozida', 'LENTIL', 20, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),

  ('exli-vegetable-broccoli', 'exl-system-vegetable-sides', 'TACO', '100', NULL, 'Brócolis, cozido', 'BROCCOLI', 10, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-vegetable-carrot', 'exl-system-vegetable-sides', 'TACO', '109', NULL, 'Cenoura, cozida', 'CARROT', 20, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('exli-vegetable-lettuce', 'exl-system-vegetable-sides', 'TACO', '77', NULL, 'Alface, americana, crua', 'LEAFY', 30, 1, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z');
