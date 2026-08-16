-- Camada clinica estruturada complementar ao prontuario textual.
--
-- Nao altera nem migra automaticamente nutrition_records. Os campos em claro
-- sao apenas codigos normalizados necessarios para regras deterministicas; os
-- textos de label/evidencia permanecem cifrados pela aplicacao.
CREATE TABLE IF NOT EXISTS patient_clinical_markers (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'ALLERGY', 'INTOLERANCE', 'DIETARY_RESTRICTION', 'FOOD_AVOIDANCE',
    'CLINICAL_FLAG', 'PREGNANCY', 'BARIATRIC'
  )),
  normalized_code TEXT NOT NULL,
  label_encrypted TEXT,
  severity TEXT NOT NULL DEFAULT 'unknown' CHECK (severity IN ('unknown', 'mild', 'moderate', 'severe')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPECTED', 'RESOLVED')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai_suggestion_confirmed', 'import', 'system')),
  evidence_text_encrypted TEXT,
  created_by_admin_id TEXT,
  updated_by_admin_id TEXT,
  resolved_by_admin_id TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS patient_clinical_markers_client_idx
  ON patient_clinical_markers(client_id, status, type);
CREATE INDEX IF NOT EXISTS patient_clinical_markers_code_idx
  ON patient_clinical_markers(type, normalized_code, status);
CREATE UNIQUE INDEX IF NOT EXISTS patient_clinical_markers_open_unique_idx
  ON patient_clinical_markers(client_id, type, normalized_code)
  WHERE status IN ('ACTIVE', 'SUSPECTED');

CREATE TABLE IF NOT EXISTS patient_clinical_marker_events (
  id TEXT PRIMARY KEY,
  marker_id TEXT REFERENCES patient_clinical_markers(id) ON DELETE SET NULL,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'resolved', 'ai_suggestion_confirmed', 'ai_suggestion_rejected')),
  previous_snapshot_encrypted TEXT,
  next_snapshot_encrypted TEXT,
  admin_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS patient_clinical_marker_events_client_idx
  ON patient_clinical_marker_events(client_id, created_at);
CREATE INDEX IF NOT EXISTS patient_clinical_marker_events_marker_idx
  ON patient_clinical_marker_events(marker_id, created_at);
