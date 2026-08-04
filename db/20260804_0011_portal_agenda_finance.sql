-- Fortalecimento de portal, agenda e financeiro.

ALTER TABLE client_portal_access ADD COLUMN code_expires_at TEXT;
ALTER TABLE client_portal_access ADD COLUMN invited_at TEXT;
ALTER TABLE client_portal_access ADD COLUMN revoked_at TEXT;

ALTER TABLE appointments ADD COLUMN portal_visible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE appointments ADD COLUMN client_confirmed_at TEXT;
ALTER TABLE appointments ADD COLUMN cancellation_reason TEXT;

ALTER TABLE payments ADD COLUMN invoice_number TEXT;
ALTER TABLE payments ADD COLUMN payment_link TEXT;
ALTER TABLE payments ADD COLUMN receipt_url TEXT;
ALTER TABLE payments ADD COLUMN installment_number INTEGER;
ALTER TABLE payments ADD COLUMN installment_total INTEGER;
ALTER TABLE payments ADD COLUMN category TEXT;

CREATE INDEX IF NOT EXISTS idx_client_portal_access_expires
ON client_portal_access(code_expires_at);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_number
ON payments(invoice_number);
