-- FASE 8 (item 11) — marca os templates de grupos clínicos sensíveis com
-- requires_professional_review=1 e risco elevado, SEM transformá-los em
-- "protocolos universais" (o conteúdo/estrutura dos templates continua
-- igual — isto só adiciona um sinalizador de revisão obrigatória visível
-- em relatório/API para quem for consumir estes templates).

UPDATE protocol_templates
SET requires_professional_review = 1, clinical_risk_level = 'high', updated_at = updated_at
WHERE target_group IN ('GESTANTE', 'CRIANCA', 'TEA', 'BARIATRICO', 'RENAL', 'ONCOLOGICO');

UPDATE protocol_templates
SET clinical_risk_level = 'medium', updated_at = updated_at
WHERE target_group IN ('IDOSO', 'RESISTENCIA_INSULINA', 'SOP');
