-- FASE 5 — Porcoes/medidas caseiras unificadas.
--
-- Corrige a constraint original de food_portions (0034) para aceitar
-- MANUFACTURER sem mentir como CUSTOM, preservando as linhas existentes.
-- Tambem congela a gramagem resolvida no item do plano para que historico
-- e versoes nao mudem silenciosamente se uma medida for corrigida depois.
-- migration:allow-destructive

CREATE TABLE IF NOT EXISTS food_portions_next (
  id TEXT PRIMARY KEY,
  food_source TEXT NOT NULL CHECK (food_source IN ('TACO', 'CUSTOM', 'MANUFACTURER')),
  food_ref_id TEXT NOT NULL,
  description TEXT NOT NULL,
  gram_equivalent REAL NOT NULL CHECK (gram_equivalent > 0),
  source TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_version TEXT NULL,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  is_active INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO food_portions_next
  (id, food_source, food_ref_id, description, gram_equivalent, source, created_at, source_version, confidence, is_active)
SELECT
  id,
  food_source,
  food_ref_id,
  description,
  gram_equivalent,
  source,
  created_at,
  source_version,
  confidence,
  is_active
FROM food_portions;

DROP TABLE food_portions;
ALTER TABLE food_portions_next RENAME TO food_portions;

CREATE INDEX IF NOT EXISTS food_portions_ref_idx ON food_portions(food_source, food_ref_id);
CREATE INDEX IF NOT EXISTS food_portions_active_idx ON food_portions(food_source, food_ref_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS food_portions_active_label_unique_idx
  ON food_portions(food_source, food_ref_id, description)
  WHERE is_active = 1;

ALTER TABLE meal_plan_items ADD COLUMN resolved_grams_snapshot REAL NULL;
ALTER TABLE meal_plan_items ADD COLUMN quantity_resolution_snapshot TEXT NULL;
