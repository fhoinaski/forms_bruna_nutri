CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  meal_group TEXT NOT NULL CHECK (meal_group IN ('cafe_da_manha', 'almoco', 'lanche', 'jantar', 'sobremesa', 'bebida')),
  servings INTEGER NOT NULL DEFAULT 1,
  portion_grams REAL,
  preparation_steps TEXT,
  ingredients_json TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_note TEXT,
  total_kcal REAL NOT NULL DEFAULT 0,
  total_protein_g REAL NOT NULL DEFAULT 0,
  total_carbs_g REAL NOT NULL DEFAULT 0,
  total_fat_g REAL NOT NULL DEFAULT 0,
  per_portion_kcal REAL NOT NULL DEFAULT 0,
  per_portion_protein_g REAL NOT NULL DEFAULT 0,
  per_portion_carbs_g REAL NOT NULL DEFAULT 0,
  per_portion_fat_g REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipes_group_active
ON recipes(meal_group, is_active);

CREATE INDEX IF NOT EXISTS idx_recipes_active_title
ON recipes(is_active, title);

ALTER TABLE meal_plan_meals ADD COLUMN source_recipe_id TEXT REFERENCES recipes(id);
