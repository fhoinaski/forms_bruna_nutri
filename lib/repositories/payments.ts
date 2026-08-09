import { d1Execute, d1Query } from "@/lib/d1/client";

export interface Payment {
  id: string;
  client_id: string | null;
  client_name: string | null;
  client_email: string | null;
  description: string;
  amount_cents: number;
  due_date: string | null;
  paid_at: string | null;
  status: string;
  payment_method: string | null;
  invoice_number: string | null;
  payment_link: string | null;
  receipt_url: string | null;
  installment_number: number | null;
  installment_total: number | null;
  category: string | null;
  notes: string | null;
  overdue_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentFilters {
  status?: string;
  clientId?: string;
  from?: string;
  to?: string;
}

export interface CreatePaymentInput {
  client_id?: string | null;
  description: string;
  amount_cents: number;
  due_date?: string | null;
  paid_at?: string | null;
  status?: string;
  payment_method?: string | null;
  invoice_number?: string | null;
  payment_link?: string | null;
  receipt_url?: string | null;
  installment_number?: number | null;
  installment_total?: number | null;
  category?: string | null;
  notes?: string | null;
}

export interface PaymentMetrics {
  receivedMonthCents: number;
  openCents: number;
  overdueCents: number;
  receivedCount: number;
  openCount: number;
  overdueCount: number;
}

function buildWhere(filters: PaymentFilters): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`p.status = ?${idx++}`);
    params.push(filters.status);
  }
  if (filters.clientId) {
    conditions.push(`p.client_id = ?${idx++}`);
    params.push(filters.clientId);
  }
  if (filters.from) {
    conditions.push(`p.due_date >= ?${idx++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`p.due_date <= ?${idx++}`);
    params.push(filters.to);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function getPayments(filters: PaymentFilters = {}): Promise<Payment[]> {
  const { clause, params } = buildWhere(filters);

  return d1Query<Payment>(
    `SELECT p.*, c.name as client_name, c.email as client_email
     FROM payments p
     LEFT JOIN clients c ON c.id = p.client_id
     ${clause}
     ORDER BY
       CASE WHEN p.status = 'vencido' THEN 0 WHEN p.status = 'pendente' THEN 1 ELSE 2 END,
       COALESCE(p.due_date, p.created_at) ASC`,
    params
  );
}

export async function getUnnotifiedOverduePayments(limit = 100): Promise<Payment[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return d1Query<Payment>(
    `SELECT p.*, c.name as client_name, c.email as client_email
     FROM payments p
     LEFT JOIN clients c ON c.id = p.client_id
     WHERE p.status IN ('pendente', 'vencido')
       AND p.due_date IS NOT NULL
       AND p.due_date < ?1
       AND p.overdue_notified_at IS NULL
       AND c.email IS NOT NULL
       AND c.email != ''
     ORDER BY p.due_date ASC
     LIMIT ?2`,
    [today.toISOString().slice(0, 10), Math.min(Math.max(limit, 1), 250)]
  );
}

export async function claimOverduePaymentNotification(id: string) {
  const rows = await d1Query<{ id: string }>(
    `UPDATE payments
     SET overdue_notified_at = ?1, updated_at = ?1
     WHERE id = ?2
       AND overdue_notified_at IS NULL
       AND status IN ('pendente', 'vencido')
     RETURNING id`,
    [new Date().toISOString(), id]
  );
  return Boolean(rows[0]);
}

export async function resetOverduePaymentNotification(id: string) {
  await d1Execute(
    `UPDATE payments
     SET overdue_notified_at = NULL, updated_at = ?1
     WHERE id = ?2`,
    [new Date().toISOString(), id]
  );
}

export async function createPayment(input: CreatePaymentInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await d1Execute(
    `INSERT INTO payments
       (id, client_id, description, amount_cents, due_date, paid_at, status, payment_method,
        invoice_number, payment_link, receipt_url, installment_number, installment_total,
        category, notes, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
    [
      id,
      input.client_id ?? null,
      input.description,
      input.amount_cents,
      input.due_date ?? null,
      input.paid_at ?? null,
      input.status ?? "pendente",
      input.payment_method ?? null,
      input.invoice_number ?? null,
      input.payment_link ?? null,
      input.receipt_url ?? null,
      input.installment_number ?? null,
      input.installment_total ?? null,
      input.category ?? null,
      input.notes ?? null,
      now,
      now,
    ]
  );

  return id;
}

export async function updatePayment(
  id: string,
  data: Partial<CreatePaymentInput>
): Promise<void> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates.push(`${key} = ?${idx++}`);
      params.push(value);
    }
  }

  if (!updates.length) return;
  updates.push(`updated_at = ?${idx++}`);
  params.push(new Date().toISOString());
  params.push(id);

  await d1Execute(`UPDATE payments SET ${updates.join(", ")} WHERE id = ?${idx}`, params);
}

export async function deletePayment(id: string): Promise<void> {
  await d1Execute(`DELETE FROM payments WHERE id = ?1`, [id]);
}

export async function getPaymentMetrics(): Promise<PaymentMetrics> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [receivedRows, openRows, overdueRows] = await Promise.all([
    d1Query<{ total: number; c: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total, COUNT(*) as c
       FROM payments
       WHERE status = 'pago' AND paid_at >= ?1`,
      [startOfMonth.toISOString()]
    ),
    d1Query<{ total: number; c: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total, COUNT(*) as c
       FROM payments
       WHERE status IN ('pendente', 'vencido')`,
      []
    ),
    d1Query<{ total: number; c: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total, COUNT(*) as c
       FROM payments
       WHERE status IN ('pendente', 'vencido')
         AND due_date IS NOT NULL
         AND due_date < ?1`,
      [today.toISOString().slice(0, 10)]
    ),
  ]);

  return {
    receivedMonthCents: receivedRows[0]?.total ?? 0,
    openCents: openRows[0]?.total ?? 0,
    overdueCents: overdueRows[0]?.total ?? 0,
    receivedCount: receivedRows[0]?.c ?? 0,
    openCount: openRows[0]?.c ?? 0,
    overdueCount: overdueRows[0]?.c ?? 0,
  };
}
