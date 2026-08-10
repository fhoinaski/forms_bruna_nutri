-- migration:allow-destructive
--
-- Adiciona os estados 'executing' e 'failed' a ai_action_proposals (0028 ja
-- foi aplicada em ambiente persistente — nao pode ser editada, por isso esta
-- migration nova). 'executing' e o estado intermediario usado para reivindicar
-- (claim) atomicamente uma proposta pending antes de executa-la, prevenindo
-- double-click, replay e confirmacoes concorrentes do mesmo proposalId.
--
-- SQLite nao permite ALTER de CHECK constraint diretamente. Mesmo padrao ja
-- usado em 20260804_0025/0026: recriar a tabela com a constraint atualizada,
-- copiar as linhas existentes, remover a antiga e renomear a nova.
--
-- Tambem adiciona:
--   - executing_at: quando a proposta foi reivindicada, para permitir
--     diagnosticar (nao recuperar automaticamente) uma proposta presa em
--     'executing' por crash/timeout do processo. Nao existe reclaim
--     automatico nesta versao: reivindicar de novo uma proposta 'executing'
--     sem um mecanismo de heartbeat/lease criaria uma nova janela de corrida
--     (o processo original pode nao ter morrido, so estar lento) — recuperacao
--     de proposta presa e sempre manual (ver docs/AI-ARCHITECTURE.md).
--   - tabela ai_proposal_executions: chave de idempotencia por proposal_id.
--     Se o handler grava no banco com sucesso mas o processo morre antes de
--     finalize(completed) rodar, uma futura tentativa (tipicamente apos
--     recuperacao manual voltando o status para 'pending') encontra o
--     registro de execucao ja gravado e NAO roda o handler de novo — so
--     finaliza e devolve o resultado ja obtido. Protege contra duplicar
--     agendamento/tarefa/cliente/receita/protocolo/post em caso de crash
--     apos o side effect.

PRAGMA foreign_keys=OFF;

CREATE TABLE ai_action_proposals_new (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  risk TEXT NOT NULL,
  client_id TEXT NULL REFERENCES clients(id) ON DELETE CASCADE,
  submission_id TEXT NULL,
  params_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'cancelled', 'expired', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  executing_at TEXT NULL,
  completed_at TEXT NULL,
  failed_reason TEXT NULL
);

INSERT INTO ai_action_proposals_new
  (id, admin_id, tool_name, kind, risk, client_id, submission_id, params_json, status, created_at, expires_at, executing_at, completed_at, failed_reason)
SELECT id, admin_id, tool_name, kind, risk, client_id, submission_id, params_json, status, created_at, expires_at, NULL, completed_at, NULL
FROM ai_action_proposals;

DROP TABLE ai_action_proposals;

ALTER TABLE ai_action_proposals_new RENAME TO ai_action_proposals;

CREATE INDEX IF NOT EXISTS ai_action_proposals_admin_status_idx
  ON ai_action_proposals (admin_id, status);

-- Chave de idempotencia: no maximo um registro de execucao por proposta,
-- gravado logo apos o handler concluir com sucesso e ANTES de finalize.
CREATE TABLE IF NOT EXISTS ai_proposal_executions (
  proposal_id TEXT PRIMARY KEY REFERENCES ai_action_proposals(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

PRAGMA foreign_keys=ON;
