import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { d1Execute, d1Query } from "@/lib/d1/client";
import type { Client } from "@/lib/repositories/clients";
import type { Appointment } from "@/lib/repositories/appointments";
import { ensureAppointmentsTable } from "@/lib/repositories/appointments";
import type { ClientTask } from "@/lib/repositories/client-tasks";
import type { NutritionRecord } from "@/lib/repositories/nutrition-records";
import { ensureNutritionRecordsTable } from "@/lib/repositories/nutrition-records";

export interface ClientPortalAccess {
  id: string;
  client_id: string;
  code_hash: string;
  is_active: number;
  session_version: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalProtocol {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  protocol_title: string | null;
  protocol_description: string | null;
  protocol_category: string | null;
  phases: Array<{
    id: string;
    title: string;
    days: string | null;
    objective: string | null;
    actions: string[];
    notes: string | null;
  }>;
}

export interface ClientPortalSummary {
  client: Pick<Client, "id" | "name" | "email" | "phone">;
  appointments: Appointment[];
  tasks: ClientTask[];
  protocols: PortalProtocol[];
  carePlan: Pick<NutritionRecord, "goals" | "care_plan" | "hydration" | "physical_activity" | "sleep_routine"> | null;
}

export async function ensureClientPortalTables() {
  await d1Execute(
    `CREATE TABLE IF NOT EXISTS client_portal_access (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL UNIQUE,
      code_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      session_version INTEGER NOT NULL DEFAULT 1,
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )`
  );
  await d1Execute(
    "CREATE INDEX IF NOT EXISTS idx_client_portal_access_client_id ON client_portal_access(client_id)"
  );
  await d1Execute(
    "CREATE INDEX IF NOT EXISTS idx_client_portal_access_active ON client_portal_access(is_active)"
  );
  try {
    await d1Execute("ALTER TABLE client_portal_access ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1");
  } catch {}
}

export function normalizePortalCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashPortalCode(code: string): string {
  const secret = process.env.AUTH_SECRET ?? "local-development";
  return createHmac("sha256", secret).update(normalizePortalCode(code)).digest("hex");
}

export function verifyPortalCodeHash(code: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPortalCode(code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function generatePortalCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let suffix = "";
  for (let index = 0; index < 8; index++) {
    suffix += alphabet[bytes[index] % alphabet.length];
  }
  return `BF-${suffix.slice(0, 4)}-${suffix.slice(4)}`;
}

export async function getClientPortalAccess(clientId: string): Promise<ClientPortalAccess | null> {
  await ensureClientPortalTables();
  const rows = await d1Query<ClientPortalAccess>(
    "SELECT * FROM client_portal_access WHERE client_id = ?1 LIMIT 1",
    [clientId]
  );
  return rows[0] ?? null;
}

export async function createOrRotateClientPortalCode(clientId: string) {
  await ensureClientPortalTables();
  const code = generatePortalCode();
  const now = new Date().toISOString();
  const existing = await getClientPortalAccess(clientId);

  if (existing) {
    await d1Execute(
      `UPDATE client_portal_access
       SET code_hash = ?1, is_active = 1, updated_at = ?2
           , session_version = session_version + 1
       WHERE client_id = ?3`,
      [hashPortalCode(code), now, clientId]
    );
    return { code, accessId: existing.id };
  }

  const id = crypto.randomUUID();
  await d1Execute(
    `INSERT INTO client_portal_access
      (id, client_id, code_hash, is_active, session_version, created_at, updated_at)
     VALUES (?1, ?2, ?3, 1, 1, ?4, ?5)`,
    [id, clientId, hashPortalCode(code), now, now]
  );
  return { code, accessId: id };
}

export async function setClientPortalAccessActive(clientId: string, active: boolean) {
  await ensureClientPortalTables();
  await d1Execute(
    "UPDATE client_portal_access SET is_active = ?1, session_version = session_version + 1, updated_at = ?2 WHERE client_id = ?3",
    [active ? 1 : 0, new Date().toISOString(), clientId]
  );
}

export async function verifyClientPortalLogin(email: string, code: string): Promise<{ client: Client; sessionVersion: number } | null> {
  await ensureClientPortalTables();
  const rows = await d1Query<Client & { code_hash: string; portal_active: number; portal_session_version: number }>(
    `SELECT c.*, p.code_hash, p.is_active as portal_active, p.session_version as portal_session_version
     FROM clients c
     INNER JOIN client_portal_access p ON p.client_id = c.id
     WHERE lower(c.email) = ?1
     LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  const client = rows[0];
  if (!client || client.portal_active !== 1) return null;
  if (!verifyPortalCodeHash(code, client.code_hash)) return null;

  await d1Execute(
    "UPDATE client_portal_access SET last_used_at = ?1, updated_at = ?2 WHERE client_id = ?3",
    [new Date().toISOString(), new Date().toISOString(), client.id]
  );
  return { client, sessionVersion: client.portal_session_version };
}

export async function getClientPortalSummary(clientId: string): Promise<ClientPortalSummary | null> {
  await ensureClientPortalTables();
  await ensureAppointmentsTable();
  await ensureNutritionRecordsTable();
  const clients = await d1Query<Client>(
    "SELECT id, name, email, phone, birth_date, source_submission_id, status, notes, created_at, updated_at FROM clients WHERE id = ?1 AND status != 'arquivado' LIMIT 1",
    [clientId]
  );
  const client = clients[0];
  if (!client) return null;

  const [appointments, tasks, protocols, carePlan] = await Promise.all([
    d1Query<Appointment>(
      `SELECT a.*, c.name as client_name, c.phone as client_phone, c.email as client_email
       FROM appointments a
       LEFT JOIN clients c ON c.id = a.client_id
       WHERE a.client_id = ?1 AND a.status != 'cancelado'
       ORDER BY a.starts_at ASC
       LIMIT 12`,
      [clientId]
    ),
    d1Query<ClientTask>(
      `SELECT * FROM client_tasks
       WHERE client_id = ?1 AND status != 'cancelada'
       ORDER BY CASE WHEN status = 'pendente' THEN 0 ELSE 1 END, due_date ASC, created_at ASC
       LIMIT 40`,
      [clientId]
    ),
    getPortalProtocols(clientId),
    d1Query<Pick<NutritionRecord, "goals" | "care_plan" | "hydration" | "physical_activity" | "sleep_routine">>(
      "SELECT goals, care_plan, hydration, physical_activity, sleep_routine FROM nutrition_records WHERE client_id = ?1 LIMIT 1",
      [clientId]
    ),
  ]);

  return {
    client: { id: client.id, name: client.name, email: client.email, phone: client.phone },
    appointments,
    tasks,
    protocols,
    carePlan: carePlan[0] ?? null,
  };
}

async function getPortalProtocols(clientId: string): Promise<PortalProtocol[]> {
  const rows = await d1Query<Omit<PortalProtocol, "phases"> & { protocol_id: string }>(
    `SELECT cp.id, cp.protocol_id, cp.status, cp.started_at, cp.completed_at,
            p.title as protocol_title, p.description as protocol_description, p.category as protocol_category
     FROM client_protocols cp
     LEFT JOIN protocols p ON p.id = cp.protocol_id
     WHERE cp.client_id = ?1 AND cp.status != 'cancelado'
     ORDER BY cp.created_at DESC
     LIMIT 8`,
    [clientId]
  );

  const protocols: PortalProtocol[] = [];
  for (const row of rows) {
    const phases = await d1Query<{
      id: string;
      title: string;
      days: string | null;
      objective: string | null;
      actions_json: string;
      notes: string | null;
    }>(
      `SELECT id, title, days, objective, actions_json, notes
       FROM protocol_phases WHERE protocol_id = ?1 ORDER BY phase_order ASC`,
      [row.protocol_id]
    );
    protocols.push({
      id: row.id,
      status: row.status,
      started_at: row.started_at,
      completed_at: row.completed_at,
      protocol_title: row.protocol_title,
      protocol_description: row.protocol_description,
      protocol_category: row.protocol_category,
      phases: phases.map((phase) => {
        let actions: string[] = [];
        try {
          actions = JSON.parse(phase.actions_json) as string[];
        } catch {}
        return {
          id: phase.id,
          title: phase.title,
          days: phase.days,
          objective: phase.objective,
          actions,
          notes: phase.notes,
        };
      }),
    });
  }
  return protocols;
}
