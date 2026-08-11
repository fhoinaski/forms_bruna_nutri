-- Solicitacao do PACIENTE para a nutricionista revisar (nunca uma alteracao
-- clinica em si — a criacao desta linha E o unico "side effect" da proposta
-- clinical-free `patient_change_request`; nenhuma tabela clinica/plano e
-- tocada). meal_id/item_id referenciam meal_plan_meals/meal_plan_items, que
-- sao INTEIRAMENTE recriados (novos UUIDs) a cada edicao do plano alimentar
-- (ver lib/repositories/meal-plans.ts) — por isso ON DELETE SET NULL: uma
-- edicao de plano depois da solicitacao limpa automaticamente a referencia
-- obsoleta em vez de deixar um id orfao apontando para nada.

CREATE TABLE IF NOT EXISTS patient_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN (
    'food_substitution', 'meal_plan_difficulty', 'symptom_or_complaint',
    'appointment_request', 'task_difficulty', 'general_question', 'other'
  )),
  patient_text TEXT NOT NULL,
  ai_summary TEXT,
  meal_plan_id TEXT REFERENCES meal_plans(id) ON DELETE SET NULL,
  meal_id TEXT REFERENCES meal_plan_meals(id) ON DELETE SET NULL,
  item_id TEXT REFERENCES meal_plan_items(id) ON DELETE SET NULL,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  client_task_id TEXT REFERENCES client_tasks(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'reviewed', 'resolved', 'dismissed')),
  admin_notes TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS patient_requests_client_idx ON patient_requests(client_id);
CREATE INDEX IF NOT EXISTS patient_requests_status_idx ON patient_requests(status);
CREATE INDEX IF NOT EXISTS patient_requests_created_idx ON patient_requests(created_at);
CREATE INDEX IF NOT EXISTS patient_requests_type_idx ON patient_requests(request_type);
