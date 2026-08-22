-- FASE 6 (item 8/9) — feedback da nutricionista sobre a sugestao do
-- piloto de busca canonica (admin_food_search). Registra SO metadados de
-- identidade (query_hash, ids de alimento, outcome) — nunca texto clinico
-- livre. NUNCA lido por nenhum processo automatico de recalibracao nesta
-- fase (item 9: "nao auto-aprender") — so uma tabela de leitura manual
-- futura, sem trigger/job que altere alias/ranking/policy a partir dela.
CREATE TABLE IF NOT EXISTS canonical_resolution_feedback (
  id TEXT PRIMARY KEY,
  query_hash TEXT NOT NULL,
  suggested_canonical_food_id TEXT NULL,
  suggested_match_class TEXT NULL,
  chosen_source TEXT NULL,
  chosen_source_id TEXT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('CORRECT', 'WRONG', 'CHANGED_SELECTION')),
  admin_id TEXT NULL REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS canonical_resolution_feedback_query_idx ON canonical_resolution_feedback(query_hash);
CREATE INDEX IF NOT EXISTS canonical_resolution_feedback_food_idx ON canonical_resolution_feedback(suggested_canonical_food_id);
