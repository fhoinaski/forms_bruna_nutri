CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY,
  patient_name TEXT NOT NULL,
  patient_email TEXT,
  patient_phone TEXT,
  child_name TEXT,
  child_age TEXT,
  form_type TEXT NOT NULL DEFAULT 'pre_consulta',
  answers_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'novo',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at
ON form_submissions(created_at);

CREATE INDEX IF NOT EXISTS idx_form_submissions_status
ON form_submissions(status);

CREATE INDEX IF NOT EXISTS idx_form_submissions_patient_name
ON form_submissions(patient_name);

CREATE TABLE IF NOT EXISTS export_logs (
  id TEXT PRIMARY KEY,
  export_type TEXT NOT NULL,
  filters_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email
ON admin_users(email);

-- ── CRM: Clientes ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  birth_date TEXT,
  source_submission_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'ativo',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

-- ── IA: Pré-análise profissional ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS submission_pre_analyses (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  admin_id TEXT,
  summary TEXT,
  attention_points TEXT,
  main_goal TEXT,
  restrictions TEXT,
  professional_notes TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES form_submissions(id)
);

CREATE INDEX IF NOT EXISTS idx_pre_analyses_submission_id
ON submission_pre_analyses(submission_id);

-- ── IA: Rascunhos de protocolo ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_protocol_drafts (
  id TEXT PRIMARY KEY,
  submission_id TEXT,
  client_id TEXT,
  pre_analysis_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  ai_model TEXT,
  prompt_version TEXT,
  input_snapshot_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES form_submissions(id),
  FOREIGN KEY (pre_analysis_id) REFERENCES submission_pre_analyses(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_protocol_drafts_submission_id
ON ai_protocol_drafts(submission_id);

CREATE INDEX IF NOT EXISTS idx_ai_protocol_drafts_status
ON ai_protocol_drafts(status);
