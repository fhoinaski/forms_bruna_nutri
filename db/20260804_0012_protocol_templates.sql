CREATE TABLE IF NOT EXISTS protocol_templates (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('DIETA', 'SUPLEMENTACAO', 'SUBSTITUICAO')),
  target_group TEXT NOT NULL CHECK (target_group IN ('EMAGRECIMENTO', 'HIPERTROFIA', 'IDOSO', 'GESTANTE', 'ADULTO_SAUDAVEL', 'CRIANCA', 'TEA', 'SOP', 'VEGETARIANO_ESTRITO', 'ENDURANCE', 'RESISTENCIA_INSULINA')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_protocol_templates_group_type
ON protocol_templates(target_group, type);

CREATE INDEX IF NOT EXISTS idx_protocol_templates_active
ON protocol_templates(is_active);
