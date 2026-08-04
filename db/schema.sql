CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY,
  patient_name TEXT NOT NULL,
  patient_email TEXT,
  patient_phone TEXT,
  child_name TEXT,
  child_age TEXT,
  form_type TEXT NOT NULL DEFAULT 'pre_consulta',
  answers_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'novo',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at
ON form_submissions(created_at);

CREATE INDEX IF NOT EXISTS idx_form_submissions_status
ON form_submissions(status);

CREATE INDEX IF NOT EXISTS idx_form_submissions_patient_name
ON form_submissions(patient_name);

CREATE TABLE IF NOT EXISTS export_logs (
  id TEXT PRIMARY KEY,
  export_type TEXT NOT NULL,
  filters_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  mfa_secret_encrypted TEXT,
  mfa_pending_secret_encrypted TEXT,
  recovery_codes_json TEXT,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email
ON admin_users(email);

-- ── CRM: Clientes ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  birth_date TEXT,
  source_submission_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'ativo',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

-- ── IA: Pré-análise profissional ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS submission_pre_analyses (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  admin_id TEXT,
  summary TEXT,
  attention_points TEXT,
  main_goal TEXT,
  restrictions TEXT,
  professional_notes TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES form_submissions(id)
);

CREATE INDEX IF NOT EXISTS idx_pre_analyses_submission_id
ON submission_pre_analyses(submission_id);

-- ── IA: Rascunhos de protocolo ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_protocol_drafts (
  id TEXT PRIMARY KEY,
  submission_id TEXT,
  client_id TEXT,
  pre_analysis_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  ai_model TEXT,
  prompt_version TEXT,
  input_snapshot_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES form_submissions(id),
  FOREIGN KEY (pre_analysis_id) REFERENCES submission_pre_analyses(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_protocol_drafts_submission_id
ON ai_protocol_drafts(submission_id);

CREATE INDEX IF NOT EXISTS idx_ai_protocol_drafts_status
ON ai_protocol_drafts(status);

-- ── Protocolos oficiais ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS protocols (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  kind TEXT NOT NULL DEFAULT 'standard',
  client_id TEXT,
  copied_from_protocol_id TEXT,
  source_draft_id TEXT,
  created_by TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_protocols_category ON protocols(category);
CREATE INDEX IF NOT EXISTS idx_protocols_source_draft_id ON protocols(source_draft_id);
CREATE INDEX IF NOT EXISTS idx_protocols_kind_active ON protocols(kind, is_active);
CREATE INDEX IF NOT EXISTS idx_protocols_client_id ON protocols(client_id);

CREATE TABLE IF NOT EXISTS protocol_phases (
  id TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL,
  title TEXT NOT NULL,
  days TEXT,
  objective TEXT,
  actions_json TEXT NOT NULL,
  notes TEXT,
  phase_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (protocol_id) REFERENCES protocols(id)
);

CREATE INDEX IF NOT EXISTS idx_protocol_phases_protocol_id ON protocol_phases(protocol_id);

-- ── Protocolo do cliente ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_protocols (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  protocol_id TEXT NOT NULL,
  source_draft_id TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  started_at TEXT NOT NULL,
  review_date TEXT,
  professional_notes TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (protocol_id) REFERENCES protocols(id)
);

CREATE INDEX IF NOT EXISTS idx_client_protocols_client_id ON client_protocols(client_id);
CREATE INDEX IF NOT EXISTS idx_client_protocols_status ON client_protocols(status);

-- ── Tarefas do cliente ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_tasks (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_protocol_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (client_protocol_id) REFERENCES client_protocols(id)
);

CREATE INDEX IF NOT EXISTS idx_client_tasks_client_id ON client_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_due_date ON client_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_client_tasks_status ON client_tasks(status);

-- ── Evoluções do cliente ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_evolutions (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_protocol_id TEXT,
  weight REAL,
  height REAL,
  bmi REAL,
  symptoms TEXT,
  adherence_notes TEXT,
  progress_notes TEXT,
  conduct_notes TEXT,
  next_steps TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (client_protocol_id) REFERENCES client_protocols(id)
);

CREATE INDEX IF NOT EXISTS idx_client_evolutions_client_id ON client_evolutions(client_id);

-- Prontuario nutricional completo

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

-- Portal do cliente

CREATE TABLE IF NOT EXISTS client_portal_access (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  session_version INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX IF NOT EXISTS idx_client_portal_access_client_id
ON client_portal_access(client_id);

CREATE INDEX IF NOT EXISTS idx_client_portal_access_active
ON client_portal_access(is_active);

-- ── Timeline do cliente ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_timeline_events (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX IF NOT EXISTS idx_client_timeline_client_id ON client_timeline_events(client_id);

-- ── Agenda clínica ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  title TEXT NOT NULL,
  appointment_type TEXT NOT NULL DEFAULT 'consulta',
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'agendado',
  location TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON appointments(client_id);

CREATE TABLE IF NOT EXISTS appointment_workflow_items (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL,
  step_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  message TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  UNIQUE (appointment_id, step_type)
);

CREATE INDEX IF NOT EXISTS idx_appointment_workflows_due_at
ON appointment_workflow_items(due_at);

CREATE INDEX IF NOT EXISTS idx_appointment_workflows_status
ON appointment_workflow_items(status);

CREATE INDEX IF NOT EXISTS idx_appointment_workflows_appointment_id
ON appointment_workflow_items(appointment_id);

CREATE TABLE IF NOT EXISTS lead_opportunities (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  stage TEXT NOT NULL DEFAULT 'novo',
  temperature TEXT NOT NULL DEFAULT 'morno',
  source TEXT NOT NULL DEFAULT 'pre_consulta',
  objective TEXT,
  service_interest TEXT,
  next_action_at TEXT,
  last_contacted_at TEXT,
  contact_attempts INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES form_submissions(id)
);

CREATE INDEX IF NOT EXISTS idx_lead_opportunities_stage
ON lead_opportunities(stage);

CREATE INDEX IF NOT EXISTS idx_lead_opportunities_temperature
ON lead_opportunities(temperature);

CREATE INDEX IF NOT EXISTS idx_lead_opportunities_next_action
ON lead_opportunities(next_action_at);

-- Financeiro clinico

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  due_date TEXT,
  paid_at TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  payment_method TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);

-- Blog editorial para autoridade e SEO

CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  category TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  author_name TEXT NOT NULL DEFAULT 'Bruna Flores Nutri',
  cover_image_url TEXT,
  seo_title TEXT,
  seo_description TEXT,
  ai_generated INTEGER NOT NULL DEFAULT 0,
  ai_prompt TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);

-- Privacidade, consentimento e seguranca

CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  form_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  consent_scope TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT,
  FOREIGN KEY (submission_id) REFERENCES form_submissions(id)
);

CREATE INDEX IF NOT EXISTS idx_consent_records_submission_id
ON consent_records(submission_id);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  request_type TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'recebida',
  verification_status TEXT NOT NULL DEFAULT 'pendente',
  admin_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_status
ON privacy_requests(status);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_email
ON privacy_requests(email);

CREATE TABLE IF NOT EXISTS privacy_settings (
  id TEXT PRIMARY KEY,
  retention_months INTEGER NOT NULL DEFAULT 60,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS security_rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_security_rate_limits_updated_at
ON security_rate_limits(updated_at);

CREATE TABLE IF NOT EXISTS backup_audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  filename TEXT,
  checksum TEXT,
  status TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);
