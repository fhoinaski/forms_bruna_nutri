-- Resumo persistente e compacto de conversas do PATIENT_ASSISTANT (copiloto
-- do portal do paciente), isolado por client_id. Deliberadamente uma tabela
-- PROPRIA, separada de ai_conversation_summaries (memoria do admin): o
-- paciente e a nutricionista nunca compartilham memoria de chat, mesmo
-- conversando sobre o mesmo cliente/paciente. Guarda so fatos
-- deterministicos (topico, acao gerada) — nunca raciocinio do modelo.

CREATE TABLE IF NOT EXISTS patient_conversation_summaries (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
