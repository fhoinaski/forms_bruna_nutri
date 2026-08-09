-- migration:allow-destructive
--
-- Expande protocol_templates.target_group para incluir BARIATRICO, RENAL
-- e ONCOLOGICO, e adiciona a nutrition_records a categoria de cuidado do
-- paciente (mesma taxonomia) mais os campos de acompanhamento bariatrico
-- (peso pre-cirurgico e data da cirurgia).
--
-- SQLite nao permite ALTER de CHECK constraint diretamente. O padrao
-- recomendado (documentado pelo proprio SQLite para mudancas de schema
-- nao suportadas por ALTER TABLE) e: desativar temporariamente a
-- verificacao de foreign keys, criar a tabela nova com a constraint
-- atualizada, copiar todos os dados, remover a tabela antiga e renomear a
-- nova para o nome original, e reativar foreign keys. Nenhuma linha e
-- perdida — os dados sao copiados integralmente antes do DROP.
--
-- Tabelas que referenciam protocol_templates(id) via FOREIGN KEY
-- (diet_template_meals, diet_template_substitutions,
-- diet_template_supplements) continuam validas: elas referenciam a tabela
-- pelo nome "protocol_templates", que e reocupado pela tabela nova no
-- mesmo lugar.

PRAGMA foreign_keys=OFF;

CREATE TABLE protocol_templates_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('DIETA', 'SUPLEMENTACAO', 'SUBSTITUICAO')),
  target_group TEXT NOT NULL CHECK (target_group IN ('EMAGRECIMENTO', 'HIPERTROFIA', 'IDOSO', 'GESTANTE', 'ADULTO_SAUDAVEL', 'CRIANCA', 'TEA', 'SOP', 'VEGETARIANO_ESTRITO', 'ENDURANCE', 'RESISTENCIA_INSULINA', 'BARIATRICO', 'RENAL', 'ONCOLOGICO')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  notes TEXT
);

INSERT INTO protocol_templates_new (id, type, target_group, title, content, is_active, created_at, updated_at, notes)
SELECT id, type, target_group, title, content, is_active, created_at, updated_at, notes FROM protocol_templates;

DROP TABLE protocol_templates;

ALTER TABLE protocol_templates_new RENAME TO protocol_templates;

CREATE INDEX IF NOT EXISTS idx_protocol_templates_group_type
ON protocol_templates(target_group, type);

CREATE INDEX IF NOT EXISTS idx_protocol_templates_active
ON protocol_templates(is_active);

PRAGMA foreign_keys=ON;

ALTER TABLE nutrition_records ADD COLUMN target_group TEXT;
ALTER TABLE nutrition_records ADD COLUMN pre_surgery_weight_kg TEXT;
ALTER TABLE nutrition_records ADD COLUMN bariatric_surgery_date TEXT;
