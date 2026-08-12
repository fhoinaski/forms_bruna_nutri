import { d1Execute, d1Query } from "@/lib/d1/client";
import { decryptJsonValue, encryptJsonValue } from "@/lib/security/encrypted-fields";
import { getClientEvolutions } from "@/lib/repositories/client-evolutions";
import { getExistingNutritionRecord } from "@/lib/repositories/nutrition-records";
import { getConsultationSessionsForClient } from "@/lib/repositories/consultation-sessions";

export const PRIVACY_POLICY_VERSION = "2026-08-04";
export const PRE_CONSULTATION_FORM_VERSION = "2026-08-04";

export type PrivacyRequest = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  request_type: string;
  details: string | null;
  status: string;
  verification_status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export async function recordConsent(input: {
  submissionId: string;
  ipHash: string;
  userAgentHash: string;
  /** ID determinístico opcional p/ idempotência (fluxo de intake). */
  id?: string;
}) {
  await d1Execute(
    `INSERT OR IGNORE INTO consent_records
      (id, submission_id, form_version, policy_version, consent_scope, accepted_at, ip_hash, user_agent_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [input.id ?? crypto.randomUUID(), input.submissionId, PRE_CONSULTATION_FORM_VERSION,
      PRIVACY_POLICY_VERSION, "pre_consulta_e_contato_assistencial",
      new Date().toISOString(), input.ipHash, input.userAgentHash]
  );
}

export async function createPrivacyRequest(input: {
  name: string;
  email: string;
  phone?: string | null;
  requestType: string;
  details?: string | null;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT INTO privacy_requests
      (id, name, email, phone, request_type, details, status, verification_status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'recebida', 'pendente', ?7, ?8)`,
    [id, input.name, input.email.toLowerCase(), input.phone ?? null,
      input.requestType, input.details ?? null, now, now]
  );
  return id;
}

export async function listPrivacyRequests() {
  return d1Query<PrivacyRequest>("SELECT * FROM privacy_requests ORDER BY created_at DESC LIMIT 250");
}

export async function getPrivacyRequest(id: string) {
  return (await d1Query<PrivacyRequest>("SELECT * FROM privacy_requests WHERE id = ?1 LIMIT 1", [id]))[0] ?? null;
}

export async function updatePrivacyRequest(id: string, input: {
  status?: string;
  verificationStatus?: string;
  adminNotes?: string | null;
}) {
  const updates: string[] = [];
  const params: unknown[] = [];
  let index = 1;
  if (input.status !== undefined) { updates.push(`status = ?${index++}`); params.push(input.status); }
  if (input.verificationStatus !== undefined) { updates.push(`verification_status = ?${index++}`); params.push(input.verificationStatus); }
  if (input.adminNotes !== undefined) { updates.push(`admin_notes = ?${index++}`); params.push(input.adminNotes); }
  if (input.status === "concluida") { updates.push(`completed_at = ?${index++}`); params.push(new Date().toISOString()); }
  updates.push(`updated_at = ?${index++}`); params.push(new Date().toISOString());
  params.push(id);
  await d1Execute(`UPDATE privacy_requests SET ${updates.join(", ")} WHERE id = ?${index}`, params);
}

export async function getPrivacySettings() {
  return (await d1Query<{ retention_months: number; updated_at: string }>(
    "SELECT retention_months, updated_at FROM privacy_settings WHERE id = 'default'"
  ))[0];
}

export async function updatePrivacySettings(retentionMonths: number, adminId: string) {
  await d1Execute(
    `UPDATE privacy_settings SET retention_months = ?1, updated_by = ?2, updated_at = ?3 WHERE id = 'default'`,
    [retentionMonths, adminId, new Date().toISOString()]
  );
}

export async function getRetentionPreview(retentionMonths: number) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - retentionMonths);
  const rows = await d1Query<{ submissions: number; clients: number }>(
    `SELECT
      (SELECT COUNT(*) FROM form_submissions WHERE updated_at < ?1 AND status IN ('finalizado', 'arquivado')) AS submissions,
      (SELECT COUNT(*) FROM clients WHERE updated_at < ?1 AND status = 'inativo') AS clients`,
    [cutoff.toISOString()]
  );
  return { cutoff: cutoff.toISOString(), submissions: rows[0]?.submissions ?? 0, clients: rows[0]?.clients ?? 0 };
}

export async function anonymizePrivacyRequestData(request: PrivacyRequest) {
  if (request.verification_status !== "verificada") {
    throw new Error("A identidade precisa ser verificada antes da anonimizacao.");
  }
  const email = request.email.toLowerCase();
  const clients = await d1Query<{ id: string }>("SELECT id FROM clients WHERE lower(email) = ?1", [email]);
  const submissions = await d1Query<{ id: string }>("SELECT id FROM form_submissions WHERE lower(patient_email) = ?1", [email]);

  for (const client of clients) {
    await d1Execute("DELETE FROM client_tasks WHERE client_id = ?1", [client.id]);
    await d1Execute("DELETE FROM patient_requests WHERE client_id = ?1", [client.id]);
    await d1Execute("DELETE FROM patient_conversation_summaries WHERE client_id = ?1", [client.id]);
    await d1Execute("DELETE FROM consultation_sessions WHERE client_id = ?1", [client.id]);
    await d1Execute("DELETE FROM client_portal_access WHERE client_id = ?1", [client.id]);
    await d1Execute("DELETE FROM client_evolutions WHERE client_id = ?1", [client.id]);
    await d1Execute("DELETE FROM nutrition_records WHERE client_id = ?1", [client.id]);
    await d1Execute("DELETE FROM client_timeline_events WHERE client_id = ?1", [client.id]);
    await d1Execute("DELETE FROM client_protocols WHERE client_id = ?1", [client.id]);
    await d1Execute("DELETE FROM protocol_phases WHERE protocol_id IN (SELECT id FROM protocols WHERE client_id = ?1)", [client.id]);
    await d1Execute("DELETE FROM protocols WHERE client_id = ?1", [client.id]);
    await d1Execute("DELETE FROM appointment_workflow_items WHERE appointment_id IN (SELECT id FROM appointments WHERE client_id = ?1)", [client.id]);
    await d1Execute("UPDATE appointments SET client_id = NULL, title = 'Horario reservado', notes = NULL WHERE client_id = ?1", [client.id]);
    await d1Execute("UPDATE payments SET client_id = NULL, notes = NULL WHERE client_id = ?1", [client.id]);
    await d1Execute(
      `UPDATE clients SET name = 'Titular anonimizado', email = NULL, phone = NULL,
       birth_date = NULL, notes = NULL, status = 'inativo', updated_at = ?1 WHERE id = ?2`,
      [new Date().toISOString(), client.id]
    );
  }
  for (const submission of submissions) {
    await d1Execute("DELETE FROM ai_protocol_drafts WHERE submission_id = ?1", [submission.id]);
    await d1Execute("DELETE FROM submission_pre_analyses WHERE submission_id = ?1", [submission.id]);
    await d1Execute("DELETE FROM consent_records WHERE submission_id = ?1", [submission.id]);
    await d1Execute("DELETE FROM lead_opportunities WHERE submission_id = ?1", [submission.id]);
    await d1Execute(
      `UPDATE form_submissions SET patient_name = 'Titular anonimizado', patient_email = NULL,
       patient_phone = NULL, child_name = NULL, child_age = NULL, answers_json = ?1,
       notes = NULL, status = 'arquivado', updated_at = ?2 WHERE id = ?3`,
      [encryptJsonValue({}), new Date().toISOString(), submission.id]
    );
  }
  return { clients: clients.length, submissions: submissions.length };
}

export async function exportPrivacyRequestData(request: PrivacyRequest) {
  if (request.verification_status !== "verificada") throw new Error("A identidade precisa ser verificada antes da exportacao.");
  const email = request.email.toLowerCase();
  const clients = await d1Query<Record<string, unknown>>("SELECT * FROM clients WHERE lower(email) = ?1", [email]);
  const submissions = (await d1Query<Record<string, unknown>>("SELECT * FROM form_submissions WHERE lower(patient_email) = ?1", [email])).map((submission) => ({
    ...submission,
    answers: typeof submission.answers_json === "string" ? decryptJsonValue<Record<string, unknown>>(submission.answers_json, {}) : {},
    answers_json: undefined,
  }));
  const opportunities = await d1Query<Record<string, unknown>>("SELECT o.* FROM lead_opportunities o INNER JOIN form_submissions s ON s.id = o.submission_id WHERE lower(s.patient_email) = ?1", [email]);
  const clinicalRecords = [];
  for (const client of clients) {
    const clientId = String(client.id);
    const [appointments, appointmentWorkflows, payments, tasks, portalAccess, evolutions, nutritionRecord, protocols, personalizedProtocols, timeline, patientRequests, consultationSessions] = await Promise.all([
      d1Query<Record<string, unknown>>("SELECT * FROM appointments WHERE client_id = ?1", [clientId]),
      d1Query<Record<string, unknown>>("SELECT w.* FROM appointment_workflow_items w INNER JOIN appointments a ON a.id = w.appointment_id WHERE a.client_id = ?1", [clientId]),
      d1Query<Record<string, unknown>>("SELECT * FROM payments WHERE client_id = ?1", [clientId]),
      d1Query<Record<string, unknown>>("SELECT * FROM client_tasks WHERE client_id = ?1", [clientId]),
      d1Query<Record<string, unknown>>("SELECT id, client_id, is_active, last_used_at, created_at, updated_at FROM client_portal_access WHERE client_id = ?1", [clientId]),
      getClientEvolutions(clientId),
      getExistingNutritionRecord(clientId),
      d1Query<Record<string, unknown>>("SELECT * FROM client_protocols WHERE client_id = ?1", [clientId]),
      d1Query<Record<string, unknown>>(
        `SELECT p.*, (SELECT json_group_array(json_object('title', pp.title, 'days', pp.days, 'objective', pp.objective, 'actions', pp.actions_json, 'notes', pp.notes)) FROM protocol_phases pp WHERE pp.protocol_id = p.id) as phases
         FROM protocols p WHERE p.client_id = ?1`,
        [clientId]
      ),
      d1Query<Record<string, unknown>>("SELECT * FROM client_timeline_events WHERE client_id = ?1", [clientId]),
      d1Query<Record<string, unknown>>("SELECT * FROM patient_requests WHERE client_id = ?1", [clientId]),
      getConsultationSessionsForClient(clientId),
    ]);
    clinicalRecords.push({ clientId, appointments, appointmentWorkflows, payments, tasks, portalAccess, evolutions, nutritionRecords: nutritionRecord ? [nutritionRecord] : [], protocols, personalizedProtocols, timeline, patientRequests, consultationSessions });
  }
  return { generatedAt: new Date().toISOString(), requestId: request.id, clients, submissions, opportunities, clinicalRecords };
}
