ALTER TABLE protocols ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE protocols ADD COLUMN client_id TEXT;
ALTER TABLE protocols ADD COLUMN copied_from_protocol_id TEXT;

ALTER TABLE client_protocols ADD COLUMN review_date TEXT;
ALTER TABLE client_protocols ADD COLUMN professional_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_protocols_kind_active
ON protocols(kind, is_active);

CREATE INDEX IF NOT EXISTS idx_protocols_client_id
ON protocols(client_id);

CREATE INDEX IF NOT EXISTS idx_client_protocols_client_status
ON client_protocols(client_id, status);

PRAGMA optimize;
