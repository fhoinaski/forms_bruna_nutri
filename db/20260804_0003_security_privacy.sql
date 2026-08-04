BEGIN TRANSACTION;

ALTER TABLE admin_users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN mfa_secret_encrypted TEXT;
ALTER TABLE admin_users ADD COLUMN mfa_pending_secret_encrypted TEXT;
ALTER TABLE admin_users ADD COLUMN recovery_codes_json TEXT;
ALTER TABLE admin_users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE admin_audit_logs ADD COLUMN admin_id TEXT;
ALTER TABLE admin_audit_logs ADD COLUMN entity_type TEXT;
ALTER TABLE admin_audit_logs ADD COLUMN entity_id TEXT;
ALTER TABLE admin_audit_logs ADD COLUMN ip_hash TEXT;
ALTER TABLE admin_audit_logs ADD COLUMN outcome TEXT NOT NULL DEFAULT 'success';

CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  form_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  consent_scope TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT,
  FOREIGN KEY (submission_id) REFERENCES form_submissions(id)
);
CREATE INDEX IF NOT EXISTS idx_consent_records_submission_id ON consent_records(submission_id);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  request_type TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'recebida',
  verification_status TEXT NOT NULL DEFAULT 'pendente',
  admin_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_status ON privacy_requests(status);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_email ON privacy_requests(email);

CREATE TABLE IF NOT EXISTS privacy_settings (
  id TEXT PRIMARY KEY,
  retention_months INTEGER NOT NULL DEFAULT 60,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO privacy_settings (id, retention_months, updated_at)
VALUES ('default', 60, CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS security_rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_rate_limits_updated_at ON security_rate_limits(updated_at);

CREATE TABLE IF NOT EXISTS backup_audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  filename TEXT,
  checksum TEXT,
  status TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);

COMMIT;
