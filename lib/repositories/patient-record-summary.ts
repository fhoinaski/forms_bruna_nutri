import { d1Batch, d1Query } from "@/lib/d1/client";
import { calculateAgeInYears } from "@/lib/clinical/anthropometry";
import { decryptJsonValue, decryptNullableText } from "@/lib/security/encrypted-fields";

export type PatientRecordPendingSeverity = "info" | "warning" | "blocking";

export interface PatientRecordSummaryViewModel {
  patient: {
    id: string;
    name: string;
    birthDate: string | null;
    ageYears: number | null;
    status: string;
    statusLabel: string;
    primaryGoal: string | null;
  };
  latestConsultation: {
    id: string;
    date: string;
    type: string | null;
    status: string;
    href: string;
  } | null;
  activeConsultation: {
    id: string;
    startedAt: string;
    href: string;
  } | null;
  nextAppointment: {
    id: string;
    title: string;
    date: string;
    type: string | null;
    status: string;
    href: string;
  } | null;
  latestAnthropometry: {
    date: string;
    weightKg: number | null;
    bmi: number | null;
    waistCm: number | null;
    bodyFatPercent: number | null;
  } | null;
  previousAnthropometry: {
    date: string;
    weightKg: number | null;
  } | null;
  weightTrend: {
    absoluteChangeKg: number;
    direction: "up" | "down" | "stable";
  } | null;
  weightSeries: Array<{
    date: string;
    weightKg: number;
  }>;
  activeMealPlan: {
    planId: string;
    versionId: string;
    version: number;
    title: string;
    publishedAt: string | null;
  } | null;
  draftMealPlan: {
    planId: string;
    versionId: string;
    version: number;
    title: string;
    versionedAt: string | null;
  } | null;
  keyRestrictions: Array<{
    id: string;
    type: string;
    label: string;
    severity: string | null;
    source: string;
  }>;
  activeProtocols: Array<{
    id: string;
    protocolId: string;
    title: string | null;
    status: string;
    startedAt: string;
    reviewDate: string | null;
    phaseCount: number;
  }>;
  activeSupplements: Array<{
    id: string;
    name: string;
    dosage: string | null;
    unit: string | null;
  }>;
  pendingActions: Array<{
    id: string;
    kind: "DRAFT_MEAL_PLAN" | "UNFINISHED_CONSULTATION" | "PENDING_TASK" | "OVERDUE_PAYMENT";
    title: string;
    severity: PatientRecordPendingSeverity;
    href: string | null;
  }>;
}

interface ClientRow {
  id: string;
  name: string;
  birth_date: string | null;
  status: string;
}

interface NutritionRecordRow {
  goals: string | null;
}

interface ConsultationRow {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  appointment_id: string | null;
  appointment_type: string | null;
}

interface AppointmentRow {
  id: string;
  title: string;
  appointment_type: string;
  starts_at: string;
  status: string;
}

interface EvolutionRow {
  id: string;
  measured_at: string | null;
  created_at: string;
  encrypted_payload: string | null;
}

interface EvolutionPayload {
  weight?: number | null;
  bmi?: number | null;
  waist_cm?: number | null;
  body_fat_percentage?: number | null;
}

interface MealPlanRow {
  id: string;
  title: string;
  status: "active" | "draft";
  version: number;
  versioned_at: string | null;
}

interface MarkerRow {
  id: string;
  type: string;
  normalized_code: string;
  label_encrypted: string | null;
  severity: string;
  source: string;
}

interface ProtocolRow {
  id: string;
  protocol_id: string;
  status: string;
  started_at: string;
  protocol_title: string | null;
  review_date: string | null;
  phase_count: number;
}

interface SupplementRow {
  id: string;
  name: string;
  dosage: string | null;
  unit: string | null;
}

interface CountRow {
  c: number;
}

const STATUS_LABEL: Record<string, string> = {
  ativo: "Acompanhamento ativo",
  inativo: "Inativo",
  arquivado: "Arquivado",
};

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function versionId(plan: Pick<MealPlanRow, "id" | "version">): string {
  return `${plan.id}:v${plan.version}`;
}

function decodeEvolution(row: EvolutionRow) {
  const payload = row.encrypted_payload
    ? decryptJsonValue<EvolutionPayload>(row.encrypted_payload, {})
    : {};
  return {
    date: row.measured_at ?? row.created_at,
    weightKg: payload.weight ?? null,
    bmi: payload.bmi ?? null,
    waistCm: payload.waist_cm ?? null,
    bodyFatPercent: payload.body_fat_percentage ?? null,
  };
}

export function calculatePatientAgeYears(birthDate: string | null, at: Date = new Date()): number | null {
  return calculateAgeInYears(birthDate, at);
}

export function calculateWeightTrend(
  latestWeightKg: number | null,
  previousWeightKg: number | null
): PatientRecordSummaryViewModel["weightTrend"] {
  if (latestWeightKg === null || previousWeightKg === null) return null;
  const absoluteChangeKg = roundOne(latestWeightKg - previousWeightKg);
  return {
    absoluteChangeKg,
    direction: absoluteChangeKg > 0 ? "up" : absoluteChangeKg < 0 ? "down" : "stable",
  };
}

export async function assertPatientRecordAccess(clientId: string): Promise<ClientRow | null> {
  const rows = await d1Query<ClientRow>(
    "SELECT id, name, birth_date, status FROM clients WHERE id = ?1 LIMIT 1",
    [clientId]
  );
  return rows[0] ?? null;
}

export async function getPatientRecordSummary(clientId: string): Promise<PatientRecordSummaryViewModel | null> {
  const now = new Date().toISOString();
  const batch = await d1Batch<unknown>([
    { sql: "SELECT id, name, birth_date, status FROM clients WHERE id = ?1 LIMIT 1", params: [clientId] },
    { sql: "SELECT goals FROM nutrition_records WHERE client_id = ?1 LIMIT 1", params: [clientId] },
    {
      sql: `SELECT cs.id, cs.status, cs.started_at, cs.ended_at, cs.appointment_id, a.appointment_type
            FROM consultation_sessions cs
            LEFT JOIN appointments a ON a.id = cs.appointment_id
            WHERE cs.client_id = ?1 AND cs.status = 'completed'
            ORDER BY COALESCE(cs.ended_at, cs.started_at) DESC
            LIMIT 1`,
      params: [clientId],
    },
    {
      sql: `SELECT id, status, started_at, ended_at, appointment_id, NULL AS appointment_type
            FROM consultation_sessions
            WHERE client_id = ?1 AND status = 'in_progress'
            ORDER BY started_at DESC
            LIMIT 1`,
      params: [clientId],
    },
    {
      sql: `SELECT id, title, appointment_type, starts_at, status
            FROM appointments
            WHERE client_id = ?1 AND status != 'cancelado' AND starts_at >= ?2
            ORDER BY starts_at ASC
            LIMIT 1`,
      params: [clientId, now],
    },
    {
      sql: `SELECT id, measured_at, created_at, encrypted_payload
            FROM client_evolutions
            WHERE client_id = ?1
            ORDER BY COALESCE(measured_at, created_at) DESC
            LIMIT 8`,
      params: [clientId],
    },
    {
      sql: `SELECT mp.id, mp.title, mp.status, mp.version, mpv.created_at AS versioned_at
            FROM meal_plans mp
            LEFT JOIN meal_plan_versions mpv ON mpv.meal_plan_id = mp.id AND mpv.version = mp.version
            WHERE mp.client_id = ?1 AND mp.status = 'active'
            ORDER BY mp.version DESC, mp.created_at DESC
            LIMIT 1`,
      params: [clientId],
    },
    {
      sql: `SELECT mp.id, mp.title, mp.status, mp.version, mpv.created_at AS versioned_at
            FROM meal_plans mp
            LEFT JOIN meal_plan_versions mpv ON mpv.meal_plan_id = mp.id AND mpv.version = mp.version
            WHERE mp.client_id = ?1 AND mp.status = 'draft'
            ORDER BY mp.version DESC, mp.created_at DESC
            LIMIT 1`,
      params: [clientId],
    },
    {
      sql: `SELECT id, type, normalized_code, label_encrypted, severity, source
            FROM patient_clinical_markers
            WHERE client_id = ?1 AND status <> 'RESOLVED'
            ORDER BY CASE severity WHEN 'severe' THEN 0 WHEN 'moderate' THEN 1 WHEN 'mild' THEN 2 ELSE 3 END, type ASC, normalized_code ASC
            LIMIT 5`,
      params: [clientId],
    },
    {
      sql: `SELECT cp.id, cp.protocol_id, cp.status, cp.started_at, cp.review_date, p.title AS protocol_title,
                   (SELECT COUNT(*) FROM protocol_phases pp WHERE pp.protocol_id = cp.protocol_id) AS phase_count
            FROM client_protocols cp
            LEFT JOIN protocols p ON p.id = cp.protocol_id
            WHERE cp.client_id = ?1 AND cp.status = 'ativo'
            ORDER BY cp.started_at DESC
            LIMIT 3`,
      params: [clientId],
    },
    { sql: "SELECT COUNT(*) AS c FROM client_tasks WHERE client_id = ?1 AND status = 'pendente'", params: [clientId] },
    { sql: "SELECT COUNT(*) AS c FROM payments WHERE client_id = ?1 AND status IN ('pendente', 'vencido')", params: [clientId] },
    {
      sql: `SELECT s.id, s.name, s.dosage, s.unit
            FROM meal_plan_supplements s
            INNER JOIN meal_plans mp ON mp.id = s.meal_plan_id
            WHERE mp.client_id = ?1 AND mp.status = 'active'
            ORDER BY s.sort_order ASC
            LIMIT 4`,
      params: [clientId],
    },
  ]);

  const client = batch[0]?.results[0] as ClientRow | undefined;
  if (!client) return null;

  const nutrition = batch[1]?.results[0] as NutritionRecordRow | undefined;
  const latestConsultationRow = batch[2]?.results[0] as ConsultationRow | undefined;
  const activeConsultationRow = batch[3]?.results[0] as ConsultationRow | undefined;
  const nextAppointmentRow = batch[4]?.results[0] as AppointmentRow | undefined;
  const evolutionRows = (batch[5]?.results ?? []) as EvolutionRow[];
  const activePlan = batch[6]?.results[0] as MealPlanRow | undefined;
  const draftPlan = batch[7]?.results[0] as MealPlanRow | undefined;
  const markerRows = (batch[8]?.results ?? []) as MarkerRow[];
  const protocolRows = (batch[9]?.results ?? []) as ProtocolRow[];
  const pendingTasks = ((batch[10]?.results[0] as CountRow | undefined)?.c ?? 0);
  const pendingPayments = ((batch[11]?.results[0] as CountRow | undefined)?.c ?? 0);
  const supplementRows = (batch[12]?.results ?? []) as SupplementRow[];

  const decodedEvolutions = evolutionRows.map(decodeEvolution);
  const latestAnthropometry = decodedEvolutions[0] ?? null;
  const previousAnthropometry = decodedEvolutions[1]
    ? { date: decodedEvolutions[1].date, weightKg: decodedEvolutions[1].weightKg }
    : null;

  const pendingActions: PatientRecordSummaryViewModel["pendingActions"] = [];
  if (draftPlan) {
    pendingActions.push({
      id: `draft-plan:${draftPlan.id}`,
      kind: "DRAFT_MEAL_PLAN",
      title: `Rascunho de plano v${draftPlan.version} em andamento`,
      severity: "warning",
      href: `/dashboard/clients/${clientId}?tab=plano-alimentar`,
    });
  }
  if (activeConsultationRow) {
    pendingActions.push({
      id: `consultation:${activeConsultationRow.id}`,
      kind: "UNFINISHED_CONSULTATION",
      title: "Consulta em andamento",
      severity: "warning",
      href: `/dashboard/clients/${clientId}/consulta`,
    });
  }
  if (pendingTasks > 0) {
    pendingActions.push({
      id: "pending-tasks",
      kind: "PENDING_TASK",
      title: `${pendingTasks} tarefa(s) pendente(s)`,
      severity: "info",
      href: `/dashboard/clients/${clientId}?tab=evolucao`,
    });
  }
  if (pendingPayments > 0) {
    pendingActions.push({
      id: "pending-payments",
      kind: "OVERDUE_PAYMENT",
      title: `${pendingPayments} cobrança(s) pendente(s)`,
      severity: "info",
      href: `/dashboard/clients/${clientId}?tab=evolucao`,
    });
  }

  return {
    patient: {
      id: client.id,
      name: client.name,
      birthDate: client.birth_date,
      ageYears: calculatePatientAgeYears(client.birth_date),
      status: client.status,
      statusLabel: STATUS_LABEL[client.status] ?? client.status,
      primaryGoal: decryptNullableText(nutrition?.goals) ?? null,
    },
    latestConsultation: latestConsultationRow
      ? {
          id: latestConsultationRow.id,
          date: latestConsultationRow.ended_at ?? latestConsultationRow.started_at,
          type: latestConsultationRow.appointment_type,
          status: latestConsultationRow.status,
          href: `/dashboard/clients/${clientId}/consulta`,
        }
      : null,
    activeConsultation: activeConsultationRow
      ? {
          id: activeConsultationRow.id,
          startedAt: activeConsultationRow.started_at,
          href: `/dashboard/clients/${clientId}/consulta`,
        }
      : null,
    nextAppointment: nextAppointmentRow
      ? {
          id: nextAppointmentRow.id,
          title: nextAppointmentRow.title,
          date: nextAppointmentRow.starts_at,
          type: nextAppointmentRow.appointment_type,
          status: nextAppointmentRow.status,
          href: `/dashboard/agenda`,
        }
      : null,
    latestAnthropometry,
    previousAnthropometry,
    weightTrend: calculateWeightTrend(latestAnthropometry?.weightKg ?? null, previousAnthropometry?.weightKg ?? null),
    weightSeries: decodedEvolutions
      .filter((evolution): evolution is typeof evolution & { weightKg: number } => evolution.weightKg !== null)
      .slice(0, 8)
      .reverse()
      .map((evolution) => ({ date: evolution.date, weightKg: evolution.weightKg })),
    activeMealPlan: activePlan
      ? {
          planId: activePlan.id,
          versionId: versionId(activePlan),
          version: activePlan.version,
          title: activePlan.title,
          publishedAt: activePlan.versioned_at,
        }
      : null,
    draftMealPlan: draftPlan
      ? {
          planId: draftPlan.id,
          versionId: versionId(draftPlan),
          version: draftPlan.version,
          title: draftPlan.title,
          versionedAt: draftPlan.versioned_at,
        }
      : null,
    keyRestrictions: markerRows.map((marker) => ({
      id: marker.id,
      type: marker.type,
      label: decryptNullableText(marker.label_encrypted) ?? marker.normalized_code,
      severity: marker.severity,
      source: marker.source,
    })),
    activeProtocols: protocolRows.map((protocol) => ({
      id: protocol.id,
      protocolId: protocol.protocol_id,
      title: protocol.protocol_title,
      status: protocol.status,
      startedAt: protocol.started_at,
      reviewDate: protocol.review_date,
      phaseCount: protocol.phase_count,
    })),
    activeSupplements: supplementRows.map((supplement) => ({
      id: supplement.id,
      name: supplement.name,
      dosage: supplement.dosage,
      unit: supplement.unit,
    })),
    pendingActions,
  };
}
