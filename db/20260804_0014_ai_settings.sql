CREATE TABLE IF NOT EXISTS ai_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  provider TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai', 'anthropic', 'google')),
  api_key TEXT,
  model TEXT NOT NULL DEFAULT 'gpt-4o',
  protocol_system_prompt TEXT,
  chat_system_prompt TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ai_settings (id, provider, api_key, model, protocol_system_prompt, chat_system_prompt, updated_at)
VALUES ('default', 'openai', NULL, 'gpt-4o', NULL, NULL, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO NOTHING;
