import { d1Query, d1Execute } from "@/lib/d1/client";

export interface ClientTask {
  id: string;
  client_id: string;
  client_protocol_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DraftTask {
  title: string;
  description?: string;
  dueInDays?: number;
}

export async function createTasksFromDraft(
  clientId: string,
  clientProtocolId: string,
  tasks: DraftTask[]
): Promise<void> {
  const now = new Date().toISOString();
  const baseDate = new Date();

  for (const task of tasks) {
    const dueDate = task.dueInDays
      ? new Date(baseDate.getTime() + task.dueInDays * 86400000).toISOString().slice(0, 10)
      : null;

    await d1Execute(
      `INSERT INTO client_tasks (id, client_id, client_protocol_id, title, description, due_date, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pendente', ?7, ?8)`,
      [
        crypto.randomUUID(),
        clientId,
        clientProtocolId,
        task.title,
        task.description ?? null,
        dueDate,
        now,
        now,
      ]
    );
  }
}

export interface TaskFilters {
  status?: string;
  clientProtocolId?: string;
}

export async function getClientTasks(
  clientId: string,
  filters: TaskFilters = {}
): Promise<ClientTask[]> {
  const conditions = [`client_id = ?1`];
  const params: unknown[] = [clientId];
  let idx = 2;

  if (filters.status) {
    conditions.push(`status = ?${idx++}`);
    params.push(filters.status);
  }
  if (filters.clientProtocolId) {
    conditions.push(`client_protocol_id = ?${idx++}`);
    params.push(filters.clientProtocolId);
  }

  return d1Query<ClientTask>(
    `SELECT * FROM client_tasks WHERE ${conditions.join(" AND ")} ORDER BY due_date ASC, created_at ASC`,
    params
  );
}

export async function updateClientTaskStatus(
  id: string,
  status: string
): Promise<void> {
  const now = new Date().toISOString();
  const completedAt = status === "concluida" ? now : null;

  await d1Execute(
    `UPDATE client_tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4`,
    [status, completedAt, now, id]
  );
}

export async function getOverdueTasksCount(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await d1Query<{ c: number }>(
    `SELECT COUNT(*) as c FROM client_tasks WHERE status = 'pendente' AND due_date < ?1`,
    [today]
  );
  return rows[0]?.c ?? 0;
}

export async function getClientTaskById(id: string): Promise<ClientTask | null> {
  const rows = await d1Query<ClientTask>(
    `SELECT * FROM client_tasks WHERE id = ?1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}
