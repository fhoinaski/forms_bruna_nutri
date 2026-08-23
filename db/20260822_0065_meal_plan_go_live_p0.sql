-- FASE A P0 — go-live controlado do Plano Alimentar.
-- Origem/default explicitos evitam inferir SYSTEM/USER por nome/id e impedem
-- selecao ambigua de template DIETA ativo por target_group.

ALTER TABLE protocol_templates ADD COLUMN template_origin TEXT NOT NULL DEFAULT 'SYSTEM' CHECK (template_origin IN ('SYSTEM', 'USER'));
ALTER TABLE protocol_templates ADD COLUMN owner_admin_id TEXT;
ALTER TABLE protocol_templates ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_protocol_templates_import_resolution
ON protocol_templates(target_group, type, is_active, template_origin, is_default, title);

CREATE UNIQUE INDEX IF NOT EXISTS ux_protocol_templates_one_system_default_diet
ON protocol_templates(target_group)
WHERE type = 'DIETA' AND is_active = 1 AND template_origin = 'SYSTEM' AND is_default = 1;

UPDATE protocol_templates
SET template_origin = CASE WHEN id LIKE 'tpl-%' THEN 'SYSTEM' ELSE 'USER' END,
    owner_admin_id = CASE WHEN id LIKE 'tpl-%' THEN NULL ELSE owner_admin_id END;

UPDATE protocol_templates
SET is_default = 1
WHERE type = 'DIETA'
  AND is_active = 1
  AND id = 'tpl-' || lower(target_group) || '-dieta-base';
