import { d1Execute, d1Query } from "@/lib/d1/client";
import { decryptJsonValue, decryptNullableText, encryptJsonValue, encryptNullableText } from "@/lib/security/encrypted-fields";

export type ConsultationSessionStatus = "in_progress" | "completed" | "cancelled";

export interface ConsultationSession {
  id: string;
  client_id: string;
  appointment_id: string | null;
  admin_id: string;
  status: ConsultationSessionStatus;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  ai_brief: unknown | null;
  summary: unknown | null;
  created_at: string;
  updated_at: string;
}

interface ConsultationSessionRow {
  id: string;
  client_id: string;
  appointment_id: string | null;
  admin_id: string;
  status: ConsultationSessionStatus;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  ai_brief_json: string | null;
  summary_json: string | null;
  created_at: string;
  updated_at: string;
}

export class ConsultationSessionAlreadyActiveError extends Error {
  constructor() {
    super("Este paciente já tem uma consulta em andamento.");
    this.name = "ConsultationSessionAlreadyActiveError";
  }
}

function isActiveSessionConstraintError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed: consultation_sessions\.client_id/i.test(error.message);
}

function hydrate(row: ConsultationSessionRow): ConsultationSession {
  return {
    id: row.id,
    client_id: row.client_id,
    appointment_id: row.appointment_id,
    admin_id: row.admin_id,
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at,
    notes: decryptNullableText(row.notes),
    ai_brief: decryptJsonValue<unknown | null>(row.ai_brief_json, null),
    summary: decryptJsonValue<unknown | null>(row.summary_json, null),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Cria uma nova sessao 'in_progress'. Rejeita com
 * ConsultationSessionAlreadyActiveError se o paciente ja tiver uma sessao
 * em andamento — a garantia real e o indice UNIQUE parcial no banco
 * (migration 20260811_0033), nunca uma checagem check-then-insert (mesmo
 * raciocinio ja aplicado a clients.email/phone na rodada de hardening).
 */
export async function startConsultationSession(input: {
  clientId: string;
  adminId: string;
  appointmentId?: string | null;
}): Promise<ConsultationSession> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await d1Execute(
      `INSERT INTO consultation_sessions (id, client_id, appointment_id, admin_id, status, started_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'in_progress', ?5, ?6, ?7)`,
      [id, input.clientId, input.appointmentId ?? null, input.adminId, now, now, now]
    );
  } catch (error) {
    if (isActiveSessionConstraintError(error)) throw new ConsultationSessionAlreadyActiveError();
    throw error;
  }

  return {
    id,
    client_id: input.clientId,
    appointment_id: input.appointmentId ?? null,
    admin_id: input.adminId,
    status: "in_progress",
    started_at: now,
    ended_at: null,
    notes: null,
    ai_brief: null,
    summary: null,
    created_at: now,
    updated_at: now,
  };
}

export async function getActiveConsultationSession(clientId: string): Promise<ConsultationSession | null> {
  const rows = await d1Query<ConsultationSessionRow>(
    `SELECT * FROM consultation_sessions WHERE client_id = ?1 AND status = 'in_progress' LIMIT 1`,
    [clientId]
  );
  return rows[0] ? hydrate(rows[0]) : null;
}

export async function getConsultationSessionById(id: string): Promise<ConsultationSession | null> {
  const rows = await d1Query<ConsultationSessionRow>(`SELECT * FROM consultation_sessions WHERE id = ?1 LIMIT 1`, [id]);
  return rows[0] ? hydrate(rows[0]) : null;
}

export async function updateConsultationNotes(id: string, notes: string): Promise<void> {
  await d1Execute(
    `UPDATE consultation_sessions SET notes = ?1, updated_at = ?2 WHERE id = ?3 AND status = 'in_progress'`,
    [encryptNullableText(notes), new Date().toISOString(), id]
  );
}

/** Grava o brief gerado (determinístico + IA) — nunca decide sozinho, so persiste o que o backend calculou. */
export async function saveConsultationAiBrief(id: string, brief: unknown): Promise<void> {
  await d1Execute(
    `UPDATE consultation_sessions SET ai_brief_json = ?1, updated_at = ?2 WHERE id = ?3 AND status = 'in_progress'`,
    [encryptJsonValue(brief), new Date().toISOString(), id]
  );
}

/**
 * Grava o resumo estruturado (proposal consultation_summary confirmada) —
 * so a partir de 'in_progress' (o resumo e preparado ANTES de finalizar a
 * consulta; completeConsultationSession preserva o que ja foi salvo aqui
 * via COALESCE). Retorna false se a sessao nao existir ou ja tiver sido
 * finalizada/cancelada — handler trata isso como erro de dominio.
 */
export async function saveConsultationSummary(id: string, summary: unknown): Promise<boolean> {
  const rows = await d1Query<ConsultationSessionRow>(
    `UPDATE consultation_sessions SET summary_json = ?1, updated_at = ?2 WHERE id = ?3 AND status = 'in_progress' RETURNING *`,
    [encryptJsonValue(summary), new Date().toISOString(), id]
  );
  return rows.length > 0;
}

/** So finaliza a partir de 'in_progress' — nunca sobrescreve uma sessao ja concluida/cancelada. */
export async function completeConsultationSession(id: string, summary?: unknown): Promise<boolean> {
  const now = new Date().toISOString();
  const rows = await d1Query<ConsultationSessionRow>(
    `UPDATE consultation_sessions
     SET status = 'completed', ended_at = ?1, summary_json = COALESCE(?2, summary_json), updated_at = ?1
     WHERE id = ?3 AND status = 'in_progress'
     RETURNING *`,
    [now, summary !== undefined ? encryptJsonValue(summary) : null, id]
  );
  return rows.length > 0;
}

export async function cancelConsultationSession(id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const rows = await d1Query<ConsultationSessionRow>(
    `UPDATE consultation_sessions SET status = 'cancelled', ended_at = ?1, updated_at = ?1
     WHERE id = ?2 AND status = 'in_progress'
     RETURNING *`,
    [now, id]
  );
  return rows.length > 0;
}

export async function getConsultationSessionsForClient(clientId: string, limit = 20): Promise<ConsultationSession[]> {
  const rows = await d1Query<ConsultationSessionRow>(
    `SELECT * FROM consultation_sessions WHERE client_id = ?1 ORDER BY started_at DESC LIMIT ?2`,
    [clientId, limit]
  );
  return rows.map(hydrate);
}
