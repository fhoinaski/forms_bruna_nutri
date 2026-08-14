-- Versionamento imutavel do prontuario clinico (P0).
--
-- nutrition_records          = estado ATUAL (leitura rapida, sem reconstruir).
-- nutrition_record_versions  = snapshots historicos IMUTAVEIS, cifrados com a
--                              finalidade "clinical" (nunca plaintext).
--
-- A coluna `version` em nutrition_records e a fonte da verdade do numero da
-- versao atual, usada no optimistic concurrency (UPDATE ... WHERE version = ?).

ALTER TABLE nutrition_records ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS nutrition_record_versions (
  id TEXT PRIMARY KEY,
  nutrition_record_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  encrypted_snapshot TEXT NOT NULL,
  changed_by_admin_id TEXT,
  source TEXT NOT NULL,
  consultation_session_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (nutrition_record_id, version),
  FOREIGN KEY (nutrition_record_id) REFERENCES nutrition_records(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_nutrition_record_versions_client
  ON nutrition_record_versions(client_id, version DESC);
