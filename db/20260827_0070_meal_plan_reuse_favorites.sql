-- R4 — Meal Plan Reuse & Templates: recent foods, favorite foods, and
-- standalone saved meals (per-nutritionist, admin-scoped). Pure additions —
-- no existing table is altered, no versioning/concurrency impact on
-- meal_plans. Rollback is a plain DROP TABLE for each of the three (no data
-- from any other domain references these rows).
--
-- Nenhuma das três tabelas guarda um "nutrition_snapshot" como autoridade —
-- consistente com o princípio da fase (seção "PRINCÍPIO": reuse sempre
-- reaproveita estrutura + identidade canônica, nunca nutrição congelada).
-- A Nutrition Engine recalcula sempre que o alimento/refeição é reaplicado.

-- Alimentos usados recentemente por um profissional — identidade canônica
-- (food_source/food_ref_id), nunca texto livre. Upsert a cada seleção real
-- no Food Search/editor de itens (nunca em toda tecla digitada).
CREATE TABLE IF NOT EXISTS admin_food_usage (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  food_source TEXT NOT NULL CHECK (food_source IN ('TACO', 'CUSTOM', 'MANUFACTURER', 'USDA')),
  food_ref_id TEXT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (admin_id, food_source, food_ref_id),
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_food_usage_recent
ON admin_food_usage(admin_id, last_used_at DESC);

-- Alimentos favoritados/desfavoritados por um profissional — mesma
-- identidade canônica, sem ranking clínico embutido (a ordem de exibição é
-- só created_at, nunca uma pontuação inventada).
CREATE TABLE IF NOT EXISTS admin_food_favorites (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  food_source TEXT NOT NULL CHECK (food_source IN ('TACO', 'CUSTOM', 'MANUFACTURER', 'USDA')),
  food_ref_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (admin_id, food_source, food_ref_id),
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_food_favorites_admin
ON admin_food_favorites(admin_id, created_at DESC);

-- Refeição salva/reutilizável (MEAL_TEMPLATE) — distinta de PLAN_TEMPLATE,
-- que já existe em protocol_templates/diet_template_meals (nunca um blob
-- genérico único misturando os dois domínios). Guarda a ESTRUTURA
-- prescrita (mesmo formato de meal_plans.meals: items/options/choice_groups,
-- serializado em `content`), nunca um resultado nutricional como
-- autoridade — ao aplicar, os ids são regenerados e a nutrição é sempre
-- recalculada pela Nutrition Engine a partir de food_source/food_ref_id.
CREATE TABLE IF NOT EXISTS admin_saved_meals (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  name TEXT NOT NULL,
  meal_structure TEXT NOT NULL DEFAULT 'SIMPLE' CHECK (meal_structure IN ('SIMPLE', 'OPTIONS', 'COMBINATION')),
  content TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_saved_meals_admin
ON admin_saved_meals(admin_id, updated_at DESC);
