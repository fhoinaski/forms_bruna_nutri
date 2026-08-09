CREATE TABLE IF NOT EXISTS diet_template_meals (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  suggested_time TEXT,
  notes TEXT,
  source_recipe_id TEXT REFERENCES recipes(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES protocol_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_diet_template_meals_template
ON diet_template_meals(template_id, sort_order);

CREATE TABLE IF NOT EXISTS diet_template_items (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL,
  food TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (meal_id) REFERENCES diet_template_meals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_diet_template_items_meal
ON diet_template_items(meal_id, sort_order);

CREATE TABLE IF NOT EXISTS diet_template_substitutions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  base_food TEXT NOT NULL,
  option_food TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES protocol_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_diet_template_substitutions_template
ON diet_template_substitutions(template_id, sort_order);
