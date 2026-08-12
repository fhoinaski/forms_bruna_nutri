-- Pre-consulta guiada por IA (Intake Assistant).
--
-- 1. `patient_intake_sessions` guarda o estado estruturado da entrevista.
--    `state_json` é criptografado (mesma cadeia "clinical" de
--    lib/security/encrypted-fields) porque contém respostas de saúde.
--    Nenhum transcript integral é armazenado; só estado estruturado.
--    `version` protege contra escrita concorrente (idempotência otimista).
--
-- 2. `form_submissions.submission_source` marca a origem (analytics), sem
--    alterar o contrato clínico existente. NULL = legado/anterior.
--
-- 3. `ai_settings` ganha o flag da pré-consulta guiada + o modo de oferta.
--    O formulário tradicional segue sempre acessível.

CREATE TABLE IF NOT EXISTS patient_intake_sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'review', 'completed', 'expired', 'fallback')),
  state_json TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0,
  completed_submission_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS patient_intake_sessions_expires_idx ON patient_intake_sessions(expires_at);
CREATE INDEX IF NOT EXISTS patient_intake_sessions_status_idx ON patient_intake_sessions(status);
CREATE INDEX IF NOT EXISTS patient_intake_sessions_completed_submission_idx ON patient_intake_sessions(completed_submission_id);

ALTER TABLE form_submissions ADD COLUMN submission_source TEXT;
CREATE INDEX IF NOT EXISTS idx_form_submissions_submission_source ON form_submissions(submission_source);

ALTER TABLE ai_settings ADD COLUMN patient_intake_ai_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_settings ADD COLUMN patient_intake_mode TEXT NOT NULL DEFAULT 'optional' CHECK (patient_intake_mode IN ('optional', 'default'));