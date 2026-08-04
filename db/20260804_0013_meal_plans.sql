CREATE TABLE IF NOT EXISTS meal_plans (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  title TEXT NOT NULL,
  target_group TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  version INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_client_status
ON meal_plans(client_id, status);

CREATE TABLE IF NOT EXISTS meal_plan_meals (
  id TEXT PRIMARY KEY,
  meal_plan_id TEXT NOT NULL,
  name TEXT NOT NULL,
  suggested_time TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_meals_plan
ON meal_plan_meals(meal_plan_id, sort_order);

CREATE TABLE IF NOT EXISTS meal_plan_items (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL,
  food TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (meal_id) REFERENCES meal_plan_meals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_items_meal
ON meal_plan_items(meal_id, sort_order);

CREATE TABLE IF NOT EXISTS meal_plan_substitutions (
  id TEXT PRIMARY KEY,
  meal_plan_id TEXT NOT NULL,
  base_food TEXT NOT NULL,
  option_food TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_substitutions_plan
ON meal_plan_substitutions(meal_plan_id, sort_order);

CREATE TABLE IF NOT EXISTS meal_plan_supplements (
  id TEXT PRIMARY KEY,
  meal_plan_id TEXT NOT NULL,
  name TEXT NOT NULL,
  dosage TEXT,
  unit TEXT,
  instructions TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_supplements_plan
ON meal_plan_supplements(meal_plan_id, sort_order);
