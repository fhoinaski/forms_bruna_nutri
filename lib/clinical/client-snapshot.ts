import { d1Batch } from "@/lib/d1/client";
import { decryptJsonValue, decryptNullableText } from "@/lib/security/encrypted-fields";
import { newRequestId, runWithTrace, withPerformanceTrace } from "@/lib/observability/trace";

/**
 * Snapshot inicial (leve) da ficha do paciente.
 *
 * Agrega em UM unico d1Batch (1 round-trip HTTP ao D1) os dados que a
 * primeira experiencia precisa: identidade, resumo clinico, ultima evolucao,
 * resumo de plano/protocolo ativo, proxima consulta, contadores de pendencia
 * e status do portal. O prontuario COMPLETO continua lazy (anamnese).
 *
 * Campos cifrados (prontuario / evolucao) sao decifrados apenas para os
 * campos de resumo realmente usados no primeiro paint.
 */

export interface ClientSnapshotClinicalSummary {
  goals: string | null;
  risk_flags: string | null;
  diagnoses: string | null;
  allergies: string | null;
  biological_sex: string | null;
}

export interface ClientSnapshotLatestEvolution {
  measured_at: string | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  waist_cm: number | null;
  body_fat_percentage: number | null;
}

export interface ClientSnapshot {
  client: {
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
  };
  clinicalSummary: ClientSnapshotClinicalSummary;
  latestEvolution: ClientSnapshotLatestEvolution | null;
  activeMealPlanSummary: { id: string; title: string; status: string; version: number } | null;
  activeProtocolSummary: Array<{ id: string; status: string; started_at: string; protocol_title: string | null }>;
  nextAppointment: { id: string; title: string; starts_at: string; status: string } | null;
  pendingTasksCount: number;
  pendingPaymentsCount: number;
  portalStatus: { exists: boolean; is_active: boolean; last_used_at: string | null; updated_at: string | null } | null;
}

type ClientRow = ClientSnapshot["client"];
type SummaryRow = {
  goals?: string | null;
  risk_flags?: string | null;
  diagnoses?: string | null;
  allergies?: string | null;
  biological_sex?: string | null;
};

const EMPTY_EVOLUTION: ClientSnapshotLatestEvolution = {
  measured_at: null,
  weight: null,
  height: null,
  bmi: null,
  waist_cm: null,
  body_fat_percentage: null,
};

function loadClientSnapshotInner(clientId: string): Promise<ClientSnapshot | null> {
  return withPerformanceTrace("client_snapshot", async () => {
    const now = new Date().toISOString();
    const batch = await d1Batch<unknown>([
      { sql: "SELECT id, name, email, phone, birth_date, source_submission_id, status, notes, created_at, updated_at FROM clients WHERE id = ?1 LIMIT 1", params: [clientId] },
      { sql: "SELECT goals, risk_flags, diagnoses, allergies, biological_sex FROM nutrition_records WHERE client_id = ?1 LIMIT 1", params: [clientId] },
      { sql: "SELECT measured_at, encrypted_payload FROM client_evolutions WHERE client_id = ?1 ORDER BY COALESCE(measured_at, created_at) DESC LIMIT 1", params: [clientId] },
      { sql: "SELECT id, title, status, version FROM meal_plans WHERE client_id = ?1 AND status = 'active' ORDER BY updated_at DESC LIMIT 1", params: [clientId] },
      { sql: "SELECT cp.id, cp.status, cp.started_at, p.title AS protocol_title FROM client_protocols cp LEFT JOIN protocols p ON p.id = cp.protocol_id WHERE cp.client_id = ?1 AND cp.status = 'ativo' ORDER BY cp.started_at DESC LIMIT 3", params: [clientId] },
      { sql: "SELECT id, title, starts_at, status FROM appointments WHERE client_id = ?1 AND status != 'cancelado' AND starts_at >= ?2 ORDER BY starts_at ASC LIMIT 1", params: [clientId, now] },
      { sql: "SELECT COUNT(*) AS c FROM client_tasks WHERE client_id = ?1 AND status = 'pendente'", params: [clientId] },
      { sql: "SELECT COUNT(*) AS c FROM payments WHERE client_id = ?1 AND status IN ('pendente', 'vencido')", params: [clientId] },
      { sql: "SELECT id, is_active, last_used_at, updated_at FROM client_portal_access WHERE client_id = ?1 LIMIT 1", params: [clientId] },
    ]);

    const client = batch[0]?.results[0] as ClientRow | undefined;
    if (!client) return null;

    const summaryRow = batch[1]?.results[0] as SummaryRow | undefined;
    const clinicalSummary: ClientSnapshotClinicalSummary = {
      goals: decryptNullableText(summaryRow?.goals),
      risk_flags: decryptNullableText(summaryRow?.risk_flags),
      diagnoses: decryptNullableText(summaryRow?.diagnoses),
      allergies: decryptNullableText(summaryRow?.allergies),
      biological_sex: decryptNullableText(summaryRow?.biological_sex),
    };

    const evoRow = batch[2]?.results[0] as { measured_at: string | null; encrypted_payload: string | null } | undefined;
    let latestEvolution: ClientSnapshotLatestEvolution | null = null;
    if (evoRow?.encrypted_payload) {
      const payload = decryptJsonValue<Partial<ClientSnapshotLatestEvolution>>(evoRow.encrypted_payload, EMPTY_EVOLUTION);
      latestEvolution = {
        measured_at: evoRow.measured_at ?? null,
        weight: payload.weight ?? null,
        height: payload.height ?? null,
        bmi: payload.bmi ?? null,
        waist_cm: payload.waist_cm ?? null,
        body_fat_percentage: payload.body_fat_percentage ?? null,
      };
    }

    const meal = (batch[3]?.results[0] as ClientSnapshot["activeMealPlanSummary"] | undefined) ?? null;
    const protocols = (batch[4]?.results ?? []) as ClientSnapshot["activeProtocolSummary"];
    const appointment = (batch[5]?.results[0] as ClientSnapshot["nextAppointment"] | undefined) ?? null;
    const pendingTasks = (batch[6]?.results[0] as { c?: number } | undefined)?.c ?? 0;
    const pendingPayments = (batch[7]?.results[0] as { c?: number } | undefined)?.c ?? 0;
    const portalRow = batch[8]?.results[0] as { id: string; is_active: number; last_used_at: string | null; updated_at: string | null } | undefined;

    return {
      client,
      clinicalSummary,
      latestEvolution,
      activeMealPlanSummary: meal,
      activeProtocolSummary: protocols,
      nextAppointment: appointment,
      pendingTasksCount: pendingTasks,
      pendingPaymentsCount: pendingPayments,
      portalStatus: portalRow
        ? { exists: true, is_active: portalRow.is_active === 1, last_used_at: portalRow.last_used_at, updated_at: portalRow.updated_at }
        : { exists: false, is_active: false, last_used_at: null, updated_at: null },
    };
  });
}

/**
 * Carrega o snapshot dentro de um contexto de rastreio (requestId + metricas
 * de D1) para observabilidade. Nunca expoe PHI nos logs.
 */
export function loadClientSnapshot(clientId: string): Promise<ClientSnapshot | null> {
  return runWithTrace(newRequestId(), () => loadClientSnapshotInner(clientId));
}