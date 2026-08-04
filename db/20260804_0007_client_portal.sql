-- Portal do cliente

CREATE TABLE IF NOT EXISTS client_portal_access (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  session_version INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX IF NOT EXISTS idx_client_portal_access_client_id
ON client_portal_access(client_id);

CREATE INDEX IF NOT EXISTS idx_client_portal_access_active
ON client_portal_access(is_active);
