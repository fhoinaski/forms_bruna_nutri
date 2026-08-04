import { d1Execute, d1Query } from "@/lib/d1/client";

let schemaReady: Promise<void> | null = null;

async function addColumnIfMissing(table: string, column: string, definition: string) {
  const columns = await d1Query<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    try {
      await d1Execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.toLowerCase().includes("duplicate column")) throw error;
    }
  }
}

async function initializeSecuritySchema() {
  await d1Execute(`CREATE TABLE IF NOT EXISTS consent_records (
    id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, form_version TEXT NOT NULL,
    policy_version TEXT NOT NULL, consent_scope TEXT NOT NULL, accepted_at TEXT NOT NULL,
    ip_hash TEXT, user_agent_hash TEXT,
    FOREIGN KEY (submission_id) REFERENCES form_submissions(id)
  )`);
  await d1Execute("CREATE INDEX IF NOT EXISTS idx_consent_records_submission_id ON consent_records(submission_id)");

  await d1Execute(`CREATE TABLE IF NOT EXISTS privacy_requests (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
    request_type TEXT NOT NULL, details TEXT, status TEXT NOT NULL DEFAULT 'recebida',
    verification_status TEXT NOT NULL DEFAULT 'pendente', admin_notes TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
  )`);
  await d1Execute("CREATE INDEX IF NOT EXISTS idx_privacy_requests_status ON privacy_requests(status)");
  await d1Execute("CREATE INDEX IF NOT EXISTS idx_privacy_requests_email ON privacy_requests(email)");

  await d1Execute(`CREATE TABLE IF NOT EXISTS privacy_settings (
    id TEXT PRIMARY KEY, retention_months INTEGER NOT NULL DEFAULT 60,
    updated_by TEXT, updated_at TEXT NOT NULL
  )`);
  await d1Execute(
    "INSERT OR IGNORE INTO privacy_settings (id, retention_months, updated_at) VALUES ('default', 60, ?1)",
    [new Date().toISOString()]
  );

  await d1Execute(`CREATE TABLE IF NOT EXISTS security_rate_limits (
    rate_key TEXT PRIMARY KEY, window_started_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, blocked_until TEXT, updated_at TEXT NOT NULL
  )`);
  await d1Execute("CREATE INDEX IF NOT EXISTS idx_security_rate_limits_updated_at ON security_rate_limits(updated_at)");

  await d1Execute(`CREATE TABLE IF NOT EXISTS backup_audit_logs (
    id TEXT PRIMARY KEY, action TEXT NOT NULL, filename TEXT, checksum TEXT,
    status TEXT NOT NULL, details TEXT, created_at TEXT NOT NULL
  )`);

  await addColumnIfMissing("admin_users", "mfa_enabled", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing("admin_users", "mfa_secret_encrypted", "TEXT");
  await addColumnIfMissing("admin_users", "mfa_pending_secret_encrypted", "TEXT");
  await addColumnIfMissing("admin_users", "recovery_codes_json", "TEXT");
  await addColumnIfMissing("admin_users", "session_version", "INTEGER NOT NULL DEFAULT 1");
  await addColumnIfMissing("admin_audit_logs", "admin_id", "TEXT");
  await addColumnIfMissing("admin_audit_logs", "entity_type", "TEXT");
  await addColumnIfMissing("admin_audit_logs", "entity_id", "TEXT");
  await addColumnIfMissing("admin_audit_logs", "ip_hash", "TEXT");
  await addColumnIfMissing("admin_audit_logs", "outcome", "TEXT NOT NULL DEFAULT 'success'");
}

export function ensureSecuritySchema() {
  if (!schemaReady) schemaReady = initializeSecuritySchema();
  return schemaReady.catch((error) => {
    schemaReady = null;
    throw error;
  });
}
