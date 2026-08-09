CREATE TABLE IF NOT EXISTS diet_template_supplements (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  dosage TEXT,
  unit TEXT,
  instructions TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES protocol_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_diet_template_supplements_template
ON diet_template_supplements(template_id, sort_order);

ALTER TABLE protocol_templates ADD COLUMN notes TEXT;
