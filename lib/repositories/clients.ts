import { d1Batch, d1Query, d1Execute } from "@/lib/d1/client";
import { mapClientConstraintError, normalizeEmailIdentity, normalizePhoneIdentity } from "@/lib/clinical/client-identity";

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  source_submission_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateClientInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  source_submission_id?: string | null;
  notes?: string | null;
}

export interface ClientFilters {
  search?: string;
  status?: string;
  submissionId?: string;
  page?: number;
  pageSize?: number;
}

export interface ClientListResult {
  items: Client[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ClientMetrics {
  total: number;
  ativos: number;
  novosMes: number;
}

function buildWhereClause(
  filters: ClientFilters,
  startIndex = 1
): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = startIndex;

  if (filters.submissionId) {
    conditions.push(`source_submission_id = ?${idx}`);
    params.push(filters.submissionId);
    idx++;
  }
  if (filters.search) {
    conditions.push(
      `(name LIKE ?${idx} OR email LIKE ?${idx} OR phone LIKE ?${idx})`
    );
    params.push(`%${filters.search}%`);
    idx++;
  }
  if (filters.status) {
    conditions.push(`status = ?${idx}`);
    params.push(filters.status);
    idx++;
  }

  const clause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { clause, params };
}

export async function createClient(input: CreateClientInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await d1Execute(
      `INSERT INTO clients
         (id, name, email, phone, birth_date, source_submission_id, status, notes, created_at, updated_at, email_normalized, phone_normalized)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ativo', ?7, ?8, ?9, ?10, ?11)`,
      [
        id,
        input.name,
        input.email ?? null,
        input.phone ?? null,
        input.birth_date ?? null,
        input.source_submission_id ?? null,
        input.notes ?? null,
        now,
        now,
        normalizeEmailIdentity(input.email),
        normalizePhoneIdentity(input.phone),
      ]
    );
  } catch (error) {
    throw mapClientConstraintError(error) ?? error;
  }

  return id;
}

export async function getClients(
  filters: ClientFilters = {}
): Promise<ClientListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const { clause, params } = buildWhereClause(filters);

  const countRows = await d1Query<{ total: number }>(
    `SELECT COUNT(*) as total FROM clients ${clause}`,
    params
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await d1Query<Client>(
    `SELECT id, name, email, phone, birth_date, source_submission_id,
            status, notes, created_at, updated_at
     FROM clients ${clause}
     ORDER BY created_at DESC
     LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`,
    [...params, pageSize, offset]
  );

  return {
    items: rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getClientById(id: string): Promise<Client | null> {
  const rows = await d1Query<Client>(
    `SELECT * FROM clients WHERE id = ?1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getClientBySubmissionId(
  submissionId: string
): Promise<Client | null> {
  const rows = await d1Query<Client>(
    `SELECT * FROM clients WHERE source_submission_id = ?1 LIMIT 1`,
    [submissionId]
  );
  return rows[0] ?? null;
}

export async function updateClient(
  id: string,
  data: Partial<Pick<Client, "name" | "email" | "phone" | "birth_date" | "status" | "notes">>
): Promise<void> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    updates.push(`name = ?${idx++}`);
    params.push(data.name);
  }
  if (data.email !== undefined) {
    updates.push(`email = ?${idx++}`);
    params.push(data.email);
    updates.push(`email_normalized = ?${idx++}`);
    params.push(normalizeEmailIdentity(data.email));
  }
  if (data.phone !== undefined) {
    updates.push(`phone = ?${idx++}`);
    params.push(data.phone);
    updates.push(`phone_normalized = ?${idx++}`);
    params.push(normalizePhoneIdentity(data.phone));
  }
  if (data.birth_date !== undefined) {
    updates.push(`birth_date = ?${idx++}`);
    params.push(data.birth_date);
  }
  if (data.status !== undefined) {
    updates.push(`status = ?${idx++}`);
    params.push(data.status);
  }
  if (data.notes !== undefined) {
    updates.push(`notes = ?${idx++}`);
    params.push(data.notes);
  }

  if (updates.length === 0) return;

  updates.push(`updated_at = ?${idx++}`);
  params.push(new Date().toISOString());
  params.push(id);

  try {
    await d1Execute(
      `UPDATE clients SET ${updates.join(", ")} WHERE id = ?${idx}`,
      params
    );
  } catch (error) {
    throw mapClientConstraintError(error) ?? error;
  }
}

export async function deleteClient(id: string): Promise<Client | null> {
  const existing = await getClientById(id);
  if (!existing) return null;

  await d1Batch([
    { sql: "DELETE FROM appointment_workflow_items WHERE appointment_id IN (SELECT id FROM appointments WHERE client_id = ?1)", params: [id] },
    { sql: "DELETE FROM consultation_sessions WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM appointments WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM payments WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM client_tasks WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM client_portal_access WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM client_evolutions WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM nutrition_record_versions WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM nutrition_records WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM client_timeline_events WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM client_protocols WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM protocol_phases WHERE protocol_id IN (SELECT id FROM protocols WHERE client_id = ?1)", params: [id] },
    { sql: "DELETE FROM protocols WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM ai_protocol_drafts WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM meal_plan_items WHERE meal_id IN (SELECT m.id FROM meal_plan_meals m INNER JOIN meal_plans p ON p.id = m.meal_plan_id WHERE p.client_id = ?1)", params: [id] },
    { sql: "DELETE FROM meal_plan_weekly_slots WHERE meal_plan_id IN (SELECT id FROM meal_plans WHERE client_id = ?1)", params: [id] },
    { sql: "DELETE FROM meal_plan_meals WHERE meal_plan_id IN (SELECT id FROM meal_plans WHERE client_id = ?1)", params: [id] },
    { sql: "DELETE FROM meal_plan_substitutions WHERE meal_plan_id IN (SELECT id FROM meal_plans WHERE client_id = ?1)", params: [id] },
    { sql: "DELETE FROM meal_plan_supplements WHERE meal_plan_id IN (SELECT id FROM meal_plans WHERE client_id = ?1)", params: [id] },
    { sql: "DELETE FROM meal_plans WHERE client_id = ?1", params: [id] },
    { sql: "DELETE FROM clients WHERE id = ?1", params: [id] },
  ]);

  return existing;
}

export async function getClientMetrics(): Promise<ClientMetrics> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [totalRow, ativosRow, novosMesRow] = await Promise.all([
    d1Query<{ c: number }>("SELECT COUNT(*) as c FROM clients", []),
    d1Query<{ c: number }>(
      "SELECT COUNT(*) as c FROM clients WHERE status = 'ativo'",
      []
    ),
    d1Query<{ c: number }>(
      "SELECT COUNT(*) as c FROM clients WHERE created_at >= ?1",
      [startOfMonth.toISOString()]
    ),
  ]);

  return {
    total: totalRow[0]?.c ?? 0,
    ativos: ativosRow[0]?.c ?? 0,
    novosMes: novosMesRow[0]?.c ?? 0,
  };
}

export async function getClientsCreatedBetween(start: string, end: string): Promise<Pick<Client, "id" | "name" | "created_at">[]> {
  return d1Query<Pick<Client, "id" | "name" | "created_at">>(
    "SELECT id, name, created_at FROM clients WHERE created_at >= ?1 AND created_at <= ?2 ORDER BY created_at DESC",
    [start, end]
  );
}

export interface MonthlyCount {
  month: string;
  count: number;
}

function lastNMonthKeys(months: number): string[] {
  const keys: string[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() - i);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export async function getMonthlyNewClientCounts(months = 6): Promise<MonthlyCount[]> {
  const monthKeys = lastNMonthKeys(months);
  const since = new Date();
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  since.setMonth(since.getMonth() - (months - 1));

  const rows = await d1Query<{ month: string; c: number }>(
    `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as c
     FROM clients
     WHERE created_at >= ?1
     GROUP BY month`,
    [since.toISOString()]
  );
  const byMonth = new Map(rows.map((r) => [r.month, r.c]));
  return monthKeys.map((month) => ({ month, count: byMonth.get(month) ?? 0 }));
}
