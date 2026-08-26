-- R1 Flexible Meal Structure Foundation.
-- Additive only: legacy meals have NULL meal_structure and are read as SIMPLE.

ALTER TABLE meal_plan_meals ADD COLUMN meal_structure TEXT NULL CHECK (meal_structure IS NULL OR meal_structure IN ('SIMPLE', 'OPTIONS', 'COMBINATION'));
ALTER TABLE meal_plan_meals ADD COLUMN patient_instruction TEXT NULL;

CREATE TABLE IF NOT EXISTS meal_plan_meal_options (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (meal_id) REFERENCES meal_plan_meals(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_meal_plan_meal_options_order
  ON meal_plan_meal_options(meal_id, sort_order);

CREATE TABLE IF NOT EXISTS meal_plan_choice_groups (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  min_selections INTEGER NOT NULL DEFAULT 1 CHECK (min_selections >= 0),
  max_selections INTEGER NOT NULL DEFAULT 1 CHECK (max_selections >= min_selections),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (meal_id) REFERENCES meal_plan_meals(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_meal_plan_choice_groups_order
  ON meal_plan_choice_groups(meal_id, sort_order);

-- A food item belongs to the fixed meal area, one complete option, or one
-- choice group. Application validation enforces mutually-exclusive ownership.
ALTER TABLE meal_plan_items ADD COLUMN meal_option_id TEXT NULL REFERENCES meal_plan_meal_options(id) ON DELETE CASCADE;
ALTER TABLE meal_plan_items ADD COLUMN choice_group_id TEXT NULL REFERENCES meal_plan_choice_groups(id) ON DELETE CASCADE;
ALTER TABLE meal_plan_items ADD COLUMN is_optional INTEGER NOT NULL DEFAULT 0 CHECK (is_optional IN (0, 1));
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_option_order ON meal_plan_items(meal_option_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_choice_group_order ON meal_plan_items(choice_group_id, sort_order);
