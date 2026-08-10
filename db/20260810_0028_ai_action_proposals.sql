-- Propostas de acao (sensitive/clinical) geradas pelo assistente de IA,
-- persistidas server-side para impedir replay e permitir revalidacao no
-- momento da confirmacao (ex.: conflito de horario surgido entre a proposta
-- e a confirmacao). O frontend nunca envia os parametros de volta na
-- confirmacao — so o id; o servidor usa exclusivamente params_json.

CREATE TABLE IF NOT EXISTS ai_action_proposals (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  risk TEXT NOT NULL,
  client_id TEXT NULL REFERENCES clients(id) ON DELETE CASCADE,
  submission_id TEXT NULL,
  params_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'expired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  completed_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS ai_action_proposals_admin_status_idx
  ON ai_action_proposals (admin_id, status);
