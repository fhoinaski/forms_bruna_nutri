import { d1Execute, d1Query } from "@/lib/d1/client";
import { decryptJsonValue, encryptJsonValue } from "@/lib/security/encrypted-fields";

export type AppointmentAiBriefStatus = "pending" | "generating" | "ready" | "stale" | "failed";

export interface AppointmentAiBrief {
  id: string;
  appointment_id: string;
  client_id: string;
  status: AppointmentAiBriefStatus;
  input_version: string;
  source_snapshot_at: string;
  generated_at: string | null;
  expires_at: string | null;
  provider: string | null;
  model: string | null;
  brief: unknown | null;
  error_code: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AppointmentAiBriefRow {
  id: string;
  appointment_id: string;
  client_id: string;
  status: AppointmentAiBriefStatus;
  input_version: string;
  source_snapshot_at: string;
  generated_at: string | null;
  expires_at: string | null;
  provider: string | null;
  model: string | null;
  brief_json: string | null;
  error_code: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

function hydrate(row: AppointmentAiBriefRow): AppointmentAiBrief {
  return {
    id: row.id,
    appointment_id: row.appointment_id,
    client_id: row.client_id,
    status: row.status,
    input_version: row.input_version,
    source_snapshot_at: row.source_snapshot_at,
    generated_at: row.generated_at,
    expires_at: row.expires_at,
    provider: row.provider,
    model: row.model,
    brief: decryptJsonValue<unknown | null>(row.brief_json, null),
    error_code: row.error_code,
    locked_at: row.locked_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getAppointmentAiBriefByAppointmentId(appointmentId: string): Promise<AppointmentAiBrief | null> {
  const rows = await d1Query<AppointmentAiBriefRow>(
    `SELECT * FROM appointment_ai_briefs WHERE appointment_id = ?1 LIMIT 1`,
    [appointmentId]
  );
  return rows[0] ? hydrate(rows[0]) : null;
}

export async function listAppointmentAiBriefsForAppointments(appointmentIds: string[]): Promise<AppointmentAiBrief[]> {
  if (!appointmentIds.length) return [];
  const placeholders = appointmentIds.map((_, index) => `?${index + 1}`).join(", ");
  const rows = await d1Query<AppointmentAiBriefRow>(
    `SELECT * FROM appointment_ai_briefs WHERE appointment_id IN (${placeholders})`,
    appointmentIds
  );
  return rows.map(hydrate);
}

export async function insertGeneratingAppointmentAiBrief(input: {
  appointmentId: string;
  clientId: string;
  inputVersion: string;
  sourceSnapshotAt: string;
  expiresAt: string;
}): Promise<AppointmentAiBrief | null> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const rows = await d1Query<AppointmentAiBriefRow>(
    `INSERT INTO appointment_ai_briefs
       (id, appointment_id, client_id, status, input_version, source_snapshot_at, expires_at, locked_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'generating', ?4, ?5, ?6, ?7, ?7, ?7)
     ON CONFLICT(appointment_id) DO NOTHING
     RETURNING *`,
    [id, input.appointmentId, input.clientId, input.inputVersion, input.sourceSnapshotAt, input.expiresAt, now]
  );
  return rows[0] ? hydrate(rows[0]) : null;
}

export async function claimAppointmentAiBriefForGeneration(input: {
  id: string;
  inputVersion: string;
  sourceSnapshotAt: string;
  expiresAt: string;
}): Promise<AppointmentAiBrief | null> {
  const now = new Date().toISOString();
  const rows = await d1Query<AppointmentAiBriefRow>(
    `UPDATE appointment_ai_briefs
     SET status = 'generating',
         input_version = ?1,
         source_snapshot_at = ?2,
         expires_at = ?3,
         error_code = NULL,
         locked_at = ?4,
         updated_at = ?4
     WHERE id = ?5
       AND status != 'generating'
     RETURNING *`,
    [input.inputVersion, input.sourceSnapshotAt, input.expiresAt, now, input.id]
  );
  return rows[0] ? hydrate(rows[0]) : null;
}

export async function markAppointmentAiBriefReady(input: {
  id: string;
  brief: unknown;
  provider: string | null;
  model: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await d1Execute(
    `UPDATE appointment_ai_briefs
     SET status = 'ready',
         brief_json = ?1,
         provider = ?2,
         model = ?3,
         generated_at = ?4,
         error_code = NULL,
         locked_at = NULL,
         updated_at = ?4
     WHERE id = ?5`,
    [encryptJsonValue(input.brief), input.provider, input.model, now, input.id]
  );
}

export async function markAppointmentAiBriefFailed(input: {
  id: string;
  errorCode: string;
  provider?: string | null;
  model?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await d1Execute(
    `UPDATE appointment_ai_briefs
     SET status = 'failed',
         error_code = ?1,
         provider = COALESCE(?2, provider),
         model = COALESCE(?3, model),
         locked_at = NULL,
         updated_at = ?4
     WHERE id = ?5`,
    [input.errorCode, input.provider ?? null, input.model ?? null, now, input.id]
  );
}

export async function markAppointmentAiBriefStale(id: string): Promise<void> {
  await d1Execute(
    `UPDATE appointment_ai_briefs
     SET status = 'stale', updated_at = ?1
     WHERE id = ?2 AND status = 'ready'`,
    [new Date().toISOString(), id]
  );
}
