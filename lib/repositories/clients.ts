import { d1Query, d1Execute } from "@/lib/d1/client";

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

  await d1Execute(
    `INSERT INTO clients
       (id, name, email, phone, birth_date, source_submission_id, status, notes, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ativo', ?7, ?8, ?9)`,
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
    ]
  );

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
  }
  if (data.phone !== undefined) {
    updates.push(`phone = ?${idx++}`);
    params.push(data.phone);
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

  await d1Execute(
    `UPDATE clients SET ${updates.join(", ")} WHERE id = ?${idx}`,
    params
  );
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
