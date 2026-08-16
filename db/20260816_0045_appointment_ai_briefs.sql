CREATE TABLE IF NOT EXISTS appointment_ai_briefs (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'generating', 'ready', 'stale', 'failed')),
  input_version TEXT NOT NULL,
  source_snapshot_at TEXT NOT NULL,
  generated_at TEXT,
  expires_at TEXT,
  provider TEXT,
  model TEXT,
  brief_json TEXT,
  error_code TEXT,
  locked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointment_ai_briefs_appointment_id
ON appointment_ai_briefs(appointment_id);

CREATE INDEX IF NOT EXISTS idx_appointment_ai_briefs_client_id
ON appointment_ai_briefs(client_id);

CREATE INDEX IF NOT EXISTS idx_appointment_ai_briefs_status
ON appointment_ai_briefs(status);

CREATE INDEX IF NOT EXISTS idx_appointment_ai_briefs_expires_at
ON appointment_ai_briefs(expires_at);
