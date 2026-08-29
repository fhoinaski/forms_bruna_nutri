-- R8.3 — patient portal credentials, one-time tokens, and revocable sessions.
-- Additive only: client_portal_access remains the sole patient-access aggregate.
-- Existing legacy access-code rows deliberately remain NO_ACCESS for the new
-- password flow until the professional explicitly invites or provisions them.

ALTER TABLE client_portal_access ADD COLUMN access_status TEXT NOT NULL DEFAULT 'NO_ACCESS'
  CHECK (access_status IN ('NO_ACCESS', 'INVITE_PENDING', 'ACTIVE', 'TEMP_PASSWORD', 'PASSWORD_CHANGE_REQUIRED', 'REVOKED', 'LOCKED'));
ALTER TABLE client_portal_access ADD COLUMN password_hash TEXT;
ALTER TABLE client_portal_access ADD COLUMN password_must_change INTEGER NOT NULL DEFAULT 0
  CHECK (password_must_change IN (0, 1));
ALTER TABLE client_portal_access ADD COLUMN password_expires_at TEXT;
ALTER TABLE client_portal_access ADD COLUMN last_login_at TEXT;
ALTER TABLE client_portal_access ADD COLUMN locked_until TEXT;

CREATE INDEX IF NOT EXISTS idx_client_portal_access_status
  ON client_portal_access(access_status);

CREATE INDEX IF NOT EXISTS idx_client_portal_access_locked_until
  ON client_portal_access(locked_until);

CREATE TABLE IF NOT EXISTS client_portal_tokens (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  access_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'password_reset')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (access_id) REFERENCES client_portal_access(id)
);

CREATE INDEX IF NOT EXISTS idx_client_portal_tokens_access_purpose_created
  ON client_portal_tokens(access_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_portal_tokens_expiry
  ON client_portal_tokens(expires_at);

CREATE TABLE IF NOT EXISTS client_portal_sessions (
  id TEXT PRIMARY KEY,
  session_id_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  access_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent_label TEXT,
  ip_hash TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (access_id) REFERENCES client_portal_access(id)
);

CREATE INDEX IF NOT EXISTS idx_client_portal_sessions_access_active
  ON client_portal_sessions(access_id, revoked_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_client_portal_sessions_session_id_hash
  ON client_portal_sessions(session_id_hash);

CREATE INDEX IF NOT EXISTS idx_client_portal_sessions_client_active
  ON client_portal_sessions(client_id, revoked_at, expires_at);
