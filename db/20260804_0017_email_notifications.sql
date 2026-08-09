-- Email automation for appointment reminders and overdue payments.
-- migration:allow-destructive
-- Rebuilds appointment_workflow_items to change the UNIQUE constraint from
-- (appointment_id, step_type) to (appointment_id, step_type, channel), copying
-- existing rows before dropping the old table.

CREATE TABLE IF NOT EXISTS appointment_workflow_items_email_migration (
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
  UNIQUE (appointment_id, step_type, channel)
);

INSERT OR IGNORE INTO appointment_workflow_items_email_migration
  (id, appointment_id, step_type, channel, due_at, status, message, completed_at, created_at, updated_at)
SELECT id, appointment_id, step_type, channel, due_at, status, message, completed_at, created_at, updated_at
FROM appointment_workflow_items;

DROP TABLE appointment_workflow_items;

ALTER TABLE appointment_workflow_items_email_migration RENAME TO appointment_workflow_items;

CREATE INDEX IF NOT EXISTS idx_appointment_workflows_due_at
ON appointment_workflow_items(due_at);

CREATE INDEX IF NOT EXISTS idx_appointment_workflows_status
ON appointment_workflow_items(status);

CREATE INDEX IF NOT EXISTS idx_appointment_workflows_appointment_id
ON appointment_workflow_items(appointment_id);

CREATE INDEX IF NOT EXISTS idx_appointment_workflows_channel_status_due
ON appointment_workflow_items(channel, status, due_at);

ALTER TABLE payments ADD COLUMN overdue_notified_at TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_overdue_notifications
ON payments(status, due_date, overdue_notified_at);
