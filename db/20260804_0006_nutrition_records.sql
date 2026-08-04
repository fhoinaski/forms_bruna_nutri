-- Prontuario nutricional completo por cliente

CREATE TABLE IF NOT EXISTS nutrition_records (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  chief_complaint TEXT,
  clinical_history TEXT,
  diagnoses TEXT,
  medications TEXT,
  supplements TEXT,
  allergies TEXT,
  restrictions TEXT,
  food_preferences TEXT,
  food_aversions TEXT,
  eating_routine TEXT,
  intestinal_health TEXT,
  sleep_routine TEXT,
  stress_context TEXT,
  physical_activity TEXT,
  hydration TEXT,
  current_weight_kg TEXT,
  height_cm TEXT,
  bmi TEXT,
  waist_cm TEXT,
  anthropometry_notes TEXT,
  exams TEXT,
  assessment TEXT,
  goals TEXT,
  care_plan TEXT,
  risk_flags TEXT,
  family_context TEXT,
  private_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX IF NOT EXISTS idx_nutrition_records_client_id
ON nutrition_records(client_id);
