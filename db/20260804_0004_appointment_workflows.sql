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
