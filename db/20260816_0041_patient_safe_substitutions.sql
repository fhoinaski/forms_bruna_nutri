-- Autonomia controlada para substituicoes alimentares no portal do paciente.
--
-- Flag default OFF: rollout seguro por configuracao administrativa.
ALTER TABLE ai_settings ADD COLUMN patient_safe_substitutions_enabled INTEGER NOT NULL DEFAULT 0;

-- Registro reaproveitavel para auditoria/observabilidade futura. Nao guarda
-- mensagem completa do paciente nem prontuario; apenas ids, resultado da
-- policy e valores calculados pela engine.
CREATE TABLE IF NOT EXISTS patient_food_substitution_events (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  meal_plan_id TEXT,
  meal_plan_version INTEGER,
  meal_id TEXT,
  item_id TEXT,
  source_food_name TEXT,
  target_food_name TEXT,
  source_quantity_g REAL,
  target_quantity_g REAL,
  substitution_status TEXT NOT NULL,
  policy_decision TEXT NOT NULL CHECK (policy_decision IN ('auto_safe', 'requires_review')),
  autonomy_level TEXT NOT NULL CHECK (autonomy_level IN ('SAFE_A', 'SAFE_B', 'REVIEW', 'BLOCKED')),
  policy_reasons_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS patient_food_substitution_events_client_idx
  ON patient_food_substitution_events(client_id, created_at);
CREATE INDEX IF NOT EXISTS patient_food_substitution_events_decision_idx
  ON patient_food_substitution_events(policy_decision, created_at);
