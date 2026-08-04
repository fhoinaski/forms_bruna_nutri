CREATE TABLE IF NOT EXISTS lead_opportunities (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  stage TEXT NOT NULL DEFAULT 'novo',
  temperature TEXT NOT NULL DEFAULT 'morno',
  source TEXT NOT NULL DEFAULT 'pre_consulta',
  objective TEXT,
  service_interest TEXT,
  next_action_at TEXT,
  last_contacted_at TEXT,
  contact_attempts INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES form_submissions(id)
);

CREATE INDEX IF NOT EXISTS idx_lead_opportunities_stage
ON lead_opportunities(stage);

CREATE INDEX IF NOT EXISTS idx_lead_opportunities_temperature
ON lead_opportunities(temperature);

CREATE INDEX IF NOT EXISTS idx_lead_opportunities_next_action
ON lead_opportunities(next_action_at);
