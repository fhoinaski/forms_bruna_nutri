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
