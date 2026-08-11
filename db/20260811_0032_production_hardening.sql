-- migration:allow-destructive
--
-- Hardening final para producao — 3 riscos conhecidos:
--
-- 1) clients.email / clients.phone nao tinham nenhuma garantia de unicidade
--    no banco. A checagem de duplicidade em executeNewClient (verifica ->
--    nao encontrou -> INSERT) e TOCTOU: duas propostas diferentes
--    confirmadas ao mesmo tempo podem ambas passar pela checagem antes de
--    qualquer INSERT (documentado e comprovado por teste em
--    tests/ai-proposal-cross-proposal-races.test.ts, secao 14). Auditoria
--    dos dados atuais (scripts/audit-duplicates.mjs, rodado antes desta
--    migration) nao encontrou nenhuma duplicidade existente por
--    lower(email) nem por telefone exato — seguro adicionar a constraint
--    sem estrategia de backfill/dedupe.
--
--    email_normalized/phone_normalized sao colunas calculadas pela
--    aplicacao (lib/clinical/client-identity.ts), nao expressoes de indice:
--    telefone precisa remover o DDI 55 quando presente (48999999999 e
--    +55 48 99999-9999 sao o mesmo numero), o que SQLite nao expressa
--    direto em indice sem uma funcao customizada. Guardar o valor calculado
--    permite indice UNIQUE parcial simples e mantem o valor original
--    (email/phone) exibido como o usuario digitou.
--
-- 2) ai_action_proposals ganha o estado 'requires_review': quando uma
--    proposta fica presa em 'executing' (processo morreu no meio) e nao ha
--    como provar com seguranca se o side effect aconteceu (nenhum registro
--    em ai_proposal_executions) para um kind que NAO e naturalmente
--    idempotente (ex.: INSERT sem chave de dedupe), o sistema nao deve
--    tentar de novo goto cegamente nem marcar completed sem certeza — fica
--    em requires_review ate a nutricionista verificar manualmente. Mesma
--    limitacao de SQLite ja documentada em 0029: CHECK constraint nao pode
--    ser alterado com ALTER TABLE, entao a tabela precisa ser recriada.

PRAGMA foreign_keys=OFF;

-- ── 1) clients: colunas normalizadas + unicidade parcial ──────────────────

ALTER TABLE clients ADD COLUMN email_normalized TEXT;
ALTER TABLE clients ADD COLUMN phone_normalized TEXT;

UPDATE clients SET email_normalized = lower(trim(email))
WHERE email IS NOT NULL AND trim(email) != '';

-- Backfill de telefone: remove tudo que nao for digito e, quando o
-- resultado tiver 12-13 digitos comecando com 55, remove o DDI — mesma
-- regra de lib/clinical/client-identity.ts. SQLite nao tem regex nativo
-- para "remover nao-digitos" em uma unica expressao, entao o backfill usa
-- replace() encadeado para os separadores comuns (espaco, hifen,
-- parenteses, mais) — cobre os dados reais ja cadastrados; numeros com
-- outros caracteres exoticos ficam como estavam e nao entram na unicidade
-- (email_normalized/phone_normalized permanecem NULL nesses casos raros,
-- que o proximo UPDATE feito pela aplicacao corrige na proxima edicao).
UPDATE clients SET phone_normalized = (
  CASE
    WHEN length(
      replace(replace(replace(replace(replace(trim(phone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')
    ) BETWEEN 12 AND 13
    AND substr(replace(replace(replace(replace(replace(trim(phone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), 1, 2) = '55'
    THEN substr(replace(replace(replace(replace(replace(trim(phone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), 3)
    ELSE replace(replace(replace(replace(replace(trim(phone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')
  END
)
WHERE phone IS NOT NULL AND trim(phone) != '';

CREATE UNIQUE INDEX IF NOT EXISTS clients_email_normalized_unique_idx
  ON clients(email_normalized) WHERE email_normalized IS NOT NULL AND email_normalized != '';

CREATE UNIQUE INDEX IF NOT EXISTS clients_phone_normalized_unique_idx
  ON clients(phone_normalized) WHERE phone_normalized IS NOT NULL AND phone_normalized != '';

-- ── 2) ai_action_proposals: novo estado 'requires_review' ─────────────────

CREATE TABLE ai_action_proposals_new (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  risk TEXT NOT NULL,
  client_id TEXT NULL REFERENCES clients(id) ON DELETE CASCADE,
  submission_id TEXT NULL,
  params_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'cancelled', 'expired', 'failed', 'requires_review')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  executing_at TEXT NULL,
  completed_at TEXT NULL,
  failed_reason TEXT NULL
);

INSERT INTO ai_action_proposals_new
  (id, admin_id, tool_name, kind, risk, client_id, submission_id, params_json, status, created_at, expires_at, executing_at, completed_at, failed_reason)
SELECT id, admin_id, tool_name, kind, risk, client_id, submission_id, params_json, status, created_at, expires_at, executing_at, completed_at, failed_reason
FROM ai_action_proposals;

DROP TABLE ai_action_proposals;

ALTER TABLE ai_action_proposals_new RENAME TO ai_action_proposals;

CREATE INDEX IF NOT EXISTS ai_action_proposals_admin_status_idx
  ON ai_action_proposals (admin_id, status);

-- Consulta de recovery (proposals presas ha muito tempo em executing, ou ja
-- classificadas como requires_review) filtra por status + executing_at.
CREATE INDEX IF NOT EXISTS ai_action_proposals_executing_at_idx
  ON ai_action_proposals (status, executing_at);

PRAGMA foreign_keys=ON;
