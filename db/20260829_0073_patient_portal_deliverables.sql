-- R8.4 — patient-scoped publications and private file metadata.
-- Additive only. Defaults deliberately keep new content unavailable to patients.

CREATE TABLE IF NOT EXISTS patient_education_publications (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  education_card_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'REVOKED')),
  snapshot_title TEXT NOT NULL,
  snapshot_category TEXT NOT NULL,
  snapshot_summary TEXT NOT NULL DEFAULT '',
  snapshot_sections_json TEXT NOT NULL DEFAULT '{}',
  published_at TEXT,
  published_by_admin_id TEXT,
  revoked_at TEXT,
  revoked_by_admin_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES clients(id),
  FOREIGN KEY (education_card_id) REFERENCES patient_education_cards(id),
  FOREIGN KEY (published_by_admin_id) REFERENCES admin_users(id),
  FOREIGN KEY (revoked_by_admin_id) REFERENCES admin_users(id)
);

CREATE INDEX IF NOT EXISTS idx_patient_education_publications_patient_status
  ON patient_education_publications(patient_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_education_publications_card
  ON patient_education_publications(education_card_id);

CREATE TABLE IF NOT EXISTS patient_files (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  status TEXT NOT NULL DEFAULT 'PRIVATE'
    CHECK (status IN ('PRIVATE', 'PUBLISHED', 'REVOKED')),
  published_at TEXT,
  published_by_admin_id TEXT,
  revoked_at TEXT,
  revoked_by_admin_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES clients(id),
  FOREIGN KEY (published_by_admin_id) REFERENCES admin_users(id),
  FOREIGN KEY (revoked_by_admin_id) REFERENCES admin_users(id)
);

CREATE INDEX IF NOT EXISTS idx_patient_files_patient_status
  ON patient_files(patient_id, status, published_at DESC);
