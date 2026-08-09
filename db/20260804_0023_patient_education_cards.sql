CREATE TABLE IF NOT EXISTS patient_education_cards (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('geral', 'patologia')),
  summary TEXT NOT NULL DEFAULT '',
  sections_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patient_education_cards_category
ON patient_education_cards(category, is_active);

CREATE INDEX IF NOT EXISTS idx_patient_education_cards_slug
ON patient_education_cards(slug);
