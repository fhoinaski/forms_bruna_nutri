-- Clinical/allergen food profile layer.
--
-- Additive and default-safe: existing foods are not altered, and foods without
-- traits remain UNKNOWN to the safety engine.
CREATE TABLE IF NOT EXISTS food_clinical_traits (
  id TEXT PRIMARY KEY,
  food_source TEXT NOT NULL CHECK (food_source IN ('TACO', 'CUSTOM', 'MANUFACTURER')),
  food_ref_id TEXT NOT NULL,
  trait_code TEXT NOT NULL CHECK (trait_code IN (
    'MILK', 'LACTOSE', 'EGG', 'PEANUT', 'TREE_NUTS',
    'SOY', 'WHEAT', 'GLUTEN', 'FISH', 'SHELLFISH'
  )),
  relation TEXT NOT NULL CHECK (relation IN ('contains', 'may_contain', 'free_from')),
  provenance TEXT NOT NULL CHECK (provenance IN (
    'SYSTEM_CURATED', 'PROFESSIONAL', 'MANUFACTURER_LABEL', 'AI_SUGGESTED_CONFIRMED'
  )),
  evidence_text TEXT NULL,
  created_by_admin_id TEXT NULL,
  updated_by_admin_id TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS food_clinical_traits_unique_idx
ON food_clinical_traits(food_source, food_ref_id, trait_code);

CREATE INDEX IF NOT EXISTS food_clinical_traits_food_idx
ON food_clinical_traits(food_source, food_ref_id);

CREATE TABLE IF NOT EXISTS food_clinical_trait_events (
  id TEXT PRIMARY KEY,
  food_source TEXT NOT NULL CHECK (food_source IN ('TACO', 'CUSTOM', 'MANUFACTURER')),
  food_ref_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'replaced')),
  previous_traits_json TEXT NULL,
  next_traits_json TEXT NULL,
  provenance TEXT NULL,
  admin_id TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS food_clinical_trait_events_food_idx
ON food_clinical_trait_events(food_source, food_ref_id, created_at DESC);
