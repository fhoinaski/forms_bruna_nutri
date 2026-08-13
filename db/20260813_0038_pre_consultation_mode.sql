-- migration:allow-destructive
--
-- Controle administrativo do MODO público da pré-consulta (smart | traditional).
--
-- `patient_intake_mode` deixa de ser 'optional'/'default' (vestigial desde a
-- remoção do chooser) e passa a representar diretamente a escolha da
-- nutricionista:
--   'smart'        → formulário dinâmico/conversacional com IA;
--   'traditional'  → formulário tradicional (padrão seguro).
--
-- `patient_intake_ai_enabled` (INTEGER 0/1) é ABSORVIDO pelo modo. O valor
-- operativo que ele guardava (IA ligada/desligada) agora é 'smart'/'traditional'.
-- Mapeamento legado (baseado no flag que DE FATO decidia o público — ver
-- getIntakeAvailability anterior): patient_intake_ai_enabled = 1 → 'smart';
-- caso contrário → 'traditional'.
--
-- SQLite não permite ALTER de CHECK constraint; mesmo padrão de
-- 20260804_0026: recriar a tabela singleton (sem FK) e copiar a linha.

PRAGMA foreign_keys=OFF;

CREATE TABLE ai_settings_new (
  id TEXT PRIMARY KEY DEFAULT 'default',
  provider TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai', 'anthropic', 'google', 'deepseek', 'xai', 'groq', 'mistral')),
  api_key TEXT,
  model TEXT NOT NULL DEFAULT 'gpt-4o',
  protocol_system_prompt TEXT,
  chat_system_prompt TEXT,
  patient_intake_mode TEXT NOT NULL DEFAULT 'traditional' CHECK (patient_intake_mode IN ('smart', 'traditional')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ai_settings_new (id, provider, api_key, model, protocol_system_prompt, chat_system_prompt, patient_intake_mode, updated_at)
SELECT id, provider, api_key, model, protocol_system_prompt, chat_system_prompt,
       CASE WHEN patient_intake_ai_enabled = 1 THEN 'smart' ELSE 'traditional' END,
       updated_at
FROM ai_settings;

DROP TABLE ai_settings;

ALTER TABLE ai_settings_new RENAME TO ai_settings;

PRAGMA foreign_keys=ON;
