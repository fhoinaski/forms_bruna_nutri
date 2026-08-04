import { d1Execute, d1Query } from "@/lib/d1/client";

export interface Appointment {
  id: string;
  client_id: string | null;
  client_name: string | null;
  title: string;
  appointment_type: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentFilters {
  from?: string;
  to?: string;
  status?: string;
  clientId?: string;
}

export interface CreateAppointmentInput {
  client_id?: string | null;
  title: string;
  appointment_type: string;
  starts_at: string;
  ends_at?: string | null;
  status?: string;
  location?: string | null;
  notes?: string | null;
}

export async function ensureAppointmentsTable(): Promise<void> {
  await d1Execute(
    `CREATE TABLE IF NOT EXISTS appointments (
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
    )`
  );
  await d1Execute(
    `CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(starts_at)`
  );
  await d1Execute(
    `CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)`
  );
  await d1Execute(
    `CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON appointments(client_id)`
  );
}

function buildWhere(filters: AppointmentFilters): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.from) {
    conditions.push(`a.starts_at >= ?${idx++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`a.starts_at <= ?${idx++}`);
    params.push(filters.to);
  }
  if (filters.status) {
    conditions.push(`a.status = ?${idx++}`);
    params.push(filters.status);
  }
  if (filters.clientId) {
    conditions.push(`a.client_id = ?${idx++}`);
    params.push(filters.clientId);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function getAppointments(
  filters: AppointmentFilters = {}
): Promise<Appointment[]> {
  await ensureAppointmentsTable();
  const { clause, params } = buildWhere(filters);

  return d1Query<Appointment>(
    `SELECT a.*, c.name as client_name
     FROM appointments a
     LEFT JOIN clients c ON c.id = a.client_id
     ${clause}
     ORDER BY a.starts_at ASC`,
    params
  );
}

export async function createAppointment(
  input: CreateAppointmentInput
): Promise<string> {
  await ensureAppointmentsTable();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await d1Execute(
    `INSERT INTO appointments
       (id, client_id, title, appointment_type, starts_at, ends_at, status, location, notes, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    [
      id,
      input.client_id ?? null,
      input.title,
      input.appointment_type,
      input.starts_at,
      input.ends_at ?? null,
      input.status ?? "agendado",
      input.location ?? null,
      input.notes ?? null,
      now,
      now,
    ]
  );

  return id;
}

export async function updateAppointment(
  id: string,
  data: Partial<CreateAppointmentInput>
): Promise<void> {
  await ensureAppointmentsTable();
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

  await d1Execute(`UPDATE appointments SET ${updates.join(", ")} WHERE id = ?${idx}`, params);
}

export async function deleteAppointment(id: string): Promise<void> {
  await ensureAppointmentsTable();
  await d1Execute(`DELETE FROM appointments WHERE id = ?1`, [id]);
}

export async function getTodayAppointmentsCount(): Promise<number> {
  await ensureAppointmentsTable();
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const rows = await d1Query<{ c: number }>(
    `SELECT COUNT(*) as c FROM appointments
     WHERE starts_at >= ?1 AND starts_at <= ?2 AND status != 'cancelado'`,
    [start.toISOString(), end.toISOString()]
  );
  return rows[0]?.c ?? 0;
}

export async function getUpcomingAppointments(limit = 5): Promise<Appointment[]> {
  await ensureAppointmentsTable();
  return d1Query<Appointment>(
    `SELECT a.*, c.name as client_name
     FROM appointments a
     LEFT JOIN clients c ON c.id = a.client_id
     WHERE a.starts_at >= ?1 AND a.status != 'cancelado'
     ORDER BY a.starts_at ASC
     LIMIT ?2`,
    [new Date().toISOString(), limit]
  );
}
