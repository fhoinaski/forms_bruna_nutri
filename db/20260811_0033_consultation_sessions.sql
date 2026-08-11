-- Modo Consulta (FASE 1) — sessao de consulta clinica explicita.
--
-- `appointments` nao ganha um estado "em atendimento": seu status hoje e
-- escopo de AGENDAMENTO (agendado/confirmado/realizado/cancelado), e uma
-- consulta em andamento precisa guardar notas livres, o brief gerado pela
-- IA e o resumo estruturado pos-consulta — dados que nao pertencem a uma
-- tabela de agendamento. `appointment_id` e opcional (a nutricionista pode
-- iniciar uma consulta avulsa, sem um agendamento formal previo).
--
-- O indice UNIQUE parcial abaixo garante, no nivel do banco, no maximo UMA
-- consulta em andamento por paciente ao mesmo tempo — mesmo padrao ja usado
-- para clients.email_normalized/phone_normalized na rodada de hardening
-- anterior (migration 20260811_0032).

CREATE TABLE IF NOT EXISTS consultation_sessions (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  appointment_id TEXT NULL REFERENCES appointments(id) ON DELETE SET NULL,
  admin_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  started_at TEXT NOT NULL,
  ended_at TEXT NULL,
  notes TEXT NULL,
  ai_brief_json TEXT NULL,
  summary_json TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS consultation_sessions_client_idx ON consultation_sessions(client_id);
CREATE INDEX IF NOT EXISTS consultation_sessions_status_idx ON consultation_sessions(status);
CREATE INDEX IF NOT EXISTS consultation_sessions_appointment_idx ON consultation_sessions(appointment_id);

CREATE UNIQUE INDEX IF NOT EXISTS consultation_sessions_one_active_idx
  ON consultation_sessions(client_id) WHERE status = 'in_progress';
