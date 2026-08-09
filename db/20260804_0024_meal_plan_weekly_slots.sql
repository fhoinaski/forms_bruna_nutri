CREATE TABLE IF NOT EXISTS meal_plan_weekly_slots (
  id TEXT PRIMARY KEY,
  meal_plan_id TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  meal_type TEXT NOT NULL CHECK (meal_type IN ('almoco', 'jantar')),
  title TEXT,
  notes TEXT,
  source_meal_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (source_meal_id) REFERENCES meal_plan_meals(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_weekly_slots_plan
ON meal_plan_weekly_slots(meal_plan_id, weekday, meal_type);
