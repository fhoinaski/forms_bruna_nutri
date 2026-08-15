-- P1-A — Motor Nutricional Profissional (integridade historica).
--
-- (A) Snapshot de composicao no item do plano: quando um alimento e vinculado
--     (food_source/food_ref_id), o nome canonico e a composicao por 100g sao
--     congelados na prescricao. Se a base (taco.json / custom_foods) mudar num
--     deploy futuro, planos antigos NAO mudam retroativamente.
-- (B) Versionamento imutavel do plano: espelha o P0 do prontuario
--     (nutrition_record_versions) — snapshot cifrado por versao + UNIQUE.
--
-- Tudo aditivo: planos/itens legados continuam funcionando (colunas novas NULL;
-- o calculo cai no re-link por food_ref_id quando nao ha snapshot).

-- (A)
ALTER TABLE meal_plan_items ADD COLUMN food_name_snapshot TEXT NULL;
ALTER TABLE meal_plan_items ADD COLUMN nutrition_snapshot TEXT NULL;

-- (B)
CREATE TABLE IF NOT EXISTS meal_plan_versions (
  id TEXT PRIMARY KEY,
  meal_plan_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  encrypted_snapshot TEXT NOT NULL,
  changed_by_admin_id TEXT NULL,
  source TEXT NOT NULL,
  reason TEXT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS meal_plan_versions_unique_idx
  ON meal_plan_versions(meal_plan_id, version);
CREATE INDEX IF NOT EXISTS meal_plan_versions_client_idx
  ON meal_plan_versions(client_id, version);