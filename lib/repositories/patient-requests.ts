import { d1Execute, d1Query } from "@/lib/d1/client";
import { normalize } from "@/lib/nutrition/macros";
import { getSaoPauloDateKey } from "@/lib/utils/timezone";

/**
 * Solicitacao do PACIENTE para a nutricionista revisar — NUNCA uma
 * alteracao clinica em si. Criar uma linha aqui e o unico "side effect" do
 * handler da proposal kind `patient_change_request`; nenhuma tabela
 * clinica/plano/prontuario e tocada por este repository.
 */
export type PatientRequestType =
  | "food_substitution"
  | "meal_plan_difficulty"
  | "symptom_or_complaint"
  | "appointment_request"
  | "task_difficulty"
  | "general_question"
  | "other";

export type PatientRequestStatus = "pending_review" | "reviewed" | "resolved" | "dismissed";

export interface PatientRequest {
  id: string;
  client_id: string;
  request_type: PatientRequestType;
  patient_text: string;
  ai_summary: string | null;
  meal_plan_id: string | null;
  meal_id: string | null;
  item_id: string | null;
  appointment_id: string | null;
  client_task_id: string | null;
  status: PatientRequestStatus;
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePatientRequestInput {
  clientId: string;
  requestType: PatientRequestType;
  patientText: string;
  aiSummary?: string | null;
  mealPlanId?: string | null;
  mealId?: string | null;
  itemId?: string | null;
  appointmentId?: string | null;
  clientTaskId?: string | null;
}

export async function createPatientRequest(input: CreatePatientRequestInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT INTO patient_requests
      (id, client_id, request_type, patient_text, ai_summary, meal_plan_id, meal_id, item_id, appointment_id, client_task_id, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'pending_review', ?11, ?11)`,
    [
      id, input.clientId, input.requestType, input.patientText, input.aiSummary ?? null,
      input.mealPlanId ?? null, input.mealId ?? null, input.itemId ?? null,
      input.appointmentId ?? null, input.clientTaskId ?? null, now,
    ]
  );
  return id;
}

export async function getPatientRequestById(id: string): Promise<PatientRequest | null> {
  const rows = await d1Query<PatientRequest>(`SELECT * FROM patient_requests WHERE id = ?1 LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export interface ListPatientRequestsFilters {
  clientId?: string;
  status?: PatientRequestStatus;
  onlyToday?: boolean;
  limit?: number;
}

export async function listPatientRequests(filters: ListPatientRequestsFilters = {}): Promise<PatientRequest[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (filters.clientId) {
    conditions.push(`client_id = ?${idx}`);
    params.push(filters.clientId);
    idx += 1;
  }
  if (filters.status) {
    conditions.push(`status = ?${idx}`);
    params.push(filters.status);
    idx += 1;
  }
  if (filters.onlyToday) {
    const todayKey = getSaoPauloDateKey(new Date());
    conditions.push(`created_at >= ?${idx}`);
    params.push(new Date(`${todayKey}T00:00:00-03:00`).toISOString());
    idx += 1;
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  return d1Query<PatientRequest>(`SELECT * FROM patient_requests ${where} ORDER BY created_at DESC LIMIT ${limit}`, params);
}

export interface SimilarPatientRequestQuery {
  clientId: string;
  requestType: PatientRequestType;
  mealId: string | null;
  itemId: string | null;
  appointmentId: string | null;
  clientTaskId: string | null;
  normalizedText: string;
}

/**
 * Deduplicacao determinística (secao 20 do pedido): mesmo paciente + mesmo
 * tipo + mesma(s) referencia(s) + texto normalizado igual + ainda pendente.
 * Nao usa IA — so comparação exata pós-normalização (acento/caixa), como
 * pedido explicitamente ("preferir determinística").
 */
export async function findSimilarPendingPatientRequest(query: SimilarPatientRequestQuery): Promise<PatientRequest | null> {
  const rows = await d1Query<PatientRequest>(
    `SELECT * FROM patient_requests WHERE client_id = ?1 AND request_type = ?2 AND status = 'pending_review' ORDER BY created_at DESC LIMIT 20`,
    [query.clientId, query.requestType]
  );
  return (
    rows.find((row) => {
      if ((row.meal_id ?? null) !== query.mealId) return false;
      if ((row.item_id ?? null) !== query.itemId) return false;
      if ((row.appointment_id ?? null) !== query.appointmentId) return false;
      if ((row.client_task_id ?? null) !== query.clientTaskId) return false;
      return normalize(row.patient_text) === query.normalizedText;
    }) ?? null
  );
}

export interface UpdatePatientRequestStatusInput {
  status: PatientRequestStatus;
  adminNotes?: string | null;
}

export async function updatePatientRequestStatus(id: string, input: UpdatePatientRequestStatusInput): Promise<PatientRequest | null> {
  const existing = await getPatientRequestById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const reviewedAt = existing.reviewed_at ?? (input.status === "pending_review" ? null : now);
  await d1Execute(
    `UPDATE patient_requests SET status = ?1, admin_notes = ?2, reviewed_at = ?3, updated_at = ?4 WHERE id = ?5`,
    [input.status, input.adminNotes ?? existing.admin_notes ?? null, reviewedAt, now, id]
  );
  return getPatientRequestById(id);
}

export async function getPendingPatientRequestsCount(): Promise<number> {
  const rows = await d1Query<{ c: number }>(`SELECT COUNT(*) as c FROM patient_requests WHERE status = 'pending_review'`);
  return rows[0]?.c ?? 0;
}

/** Usado pelo fluxo de anonimização/exclusão LGPD (lib/repositories/privacy.ts). */
export async function deletePatientRequestsForClient(clientId: string): Promise<void> {
  await d1Execute(`DELETE FROM patient_requests WHERE client_id = ?1`, [clientId]);
}
