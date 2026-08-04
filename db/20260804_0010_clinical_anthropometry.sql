-- Estrutura clinica adicional para prontuario, antropometria e evolucao.

ALTER TABLE nutrition_records ADD COLUMN life_stage TEXT;
ALTER TABLE nutrition_records ADD COLUMN biological_sex TEXT;
ALTER TABLE nutrition_records ADD COLUMN gestational_weeks TEXT;
ALTER TABLE nutrition_records ADD COLUMN breastfeeding_context TEXT;
ALTER TABLE nutrition_records ADD COLUMN pediatric_growth_notes TEXT;
ALTER TABLE nutrition_records ADD COLUMN target_weight_kg TEXT;
ALTER TABLE nutrition_records ADD COLUMN target_notes TEXT;

ALTER TABLE client_evolutions ADD COLUMN measured_at TEXT;
ALTER TABLE client_evolutions ADD COLUMN waist_cm REAL;
ALTER TABLE client_evolutions ADD COLUMN hip_cm REAL;
ALTER TABLE client_evolutions ADD COLUMN arm_cm REAL;
ALTER TABLE client_evolutions ADD COLUMN body_fat_percentage REAL;
ALTER TABLE client_evolutions ADD COLUMN blood_pressure TEXT;
ALTER TABLE client_evolutions ADD COLUMN energy_level INTEGER;
ALTER TABLE client_evolutions ADD COLUMN appetite TEXT;
ALTER TABLE client_evolutions ADD COLUMN bowel_pattern TEXT;
ALTER TABLE client_evolutions ADD COLUMN sleep_quality TEXT;
ALTER TABLE client_evolutions ADD COLUMN clinical_impression TEXT;
ALTER TABLE client_evolutions ADD COLUMN adherence_score INTEGER;

CREATE INDEX IF NOT EXISTS idx_client_evolutions_measured_at
ON client_evolutions(client_id, measured_at);
