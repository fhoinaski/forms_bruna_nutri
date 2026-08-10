-- Resumo persistente e compacto de conversas com o assistente de IA,
-- isolado por (admin_id, client_id). Guarda apenas fatos deterministicos
-- (topico, propostas geradas, navegacao) — nunca raciocinio do modelo
-- (chain-of-thought). client_id NULL representa conversa geral, sem
-- paciente especifico aberto.

CREATE TABLE IF NOT EXISTS ai_conversation_summaries (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  client_id TEXT NULL REFERENCES clients(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_conversation_summaries_admin_client_idx
  ON ai_conversation_summaries (admin_id, COALESCE(client_id, ''));
