-- migration:allow-destructive
--
-- Expande ai_settings.provider para aceitar deepseek, xai (Grok), groq e
-- mistral, alem de openai/anthropic/google ja existentes.
--
-- SQLite nao permite ALTER de CHECK constraint diretamente. Mesmo padrao
-- ja usado em 20260804_0025_expand_target_groups_and_bariatric.sql: criar
-- a tabela nova com a constraint atualizada, copiar a linha existente,
-- remover a tabela antiga e renomear a nova para o nome original.
-- ai_settings e uma tabela singleton (uma unica linha, id = 'default') e
-- nao e referenciada por FOREIGN KEY em nenhuma outra tabela.

PRAGMA foreign_keys=OFF;

CREATE TABLE ai_settings_new (
  id TEXT PRIMARY KEY DEFAULT 'default',
  provider TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai', 'anthropic', 'google', 'deepseek', 'xai', 'groq', 'mistral')),
  api_key TEXT,
  model TEXT NOT NULL DEFAULT 'gpt-4o',
  protocol_system_prompt TEXT,
  chat_system_prompt TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ai_settings_new (id, provider, api_key, model, protocol_system_prompt, chat_system_prompt, updated_at)
SELECT id, provider, api_key, model, protocol_system_prompt, chat_system_prompt, updated_at FROM ai_settings;

DROP TABLE ai_settings;

ALTER TABLE ai_settings_new RENAME TO ai_settings;

PRAGMA foreign_keys=ON;
