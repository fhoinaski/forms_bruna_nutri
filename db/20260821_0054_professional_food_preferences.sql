-- Preferência profissional de resolução de alimento (Food Terminology &
-- Catalog Coverage V1, seção 8) — "quando a nutricionista resolve
-- manualmente uma ambiguidade, oferecer 'usar esta correspondência
-- novamente'". NUNCA um alias global (não afeta outros profissionais/
-- pacientes): isolado por admin_id, só reaproveitado pelo MESMO
-- profissional que confirmou explicitamente, e sempre revalidado contra o
-- catálogo real (e a segurança clínica do paciente) no momento do uso —
-- nunca um valor congelado. Reversível: DELETE simples, sem soft-delete
-- (não é dado clínico, é uma conveniência de UI).

CREATE TABLE IF NOT EXISTS professional_food_preferences (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  query_normalized TEXT NOT NULL,
  food_source TEXT NOT NULL,
  food_ref_id TEXT NOT NULL,
  food_name_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS professional_food_preferences_admin_query_idx
  ON professional_food_preferences (admin_id, query_normalized);
