import { d1Batch, d1Query } from "@/lib/d1/client";
import { calculateAgeInYears } from "@/lib/clinical/anthropometry";
import { decryptJsonValue, decryptNullableText, encryptJsonValue, encryptNullableText } from "@/lib/security/encrypted-fields";

export type ConsultationWorkspaceStatus = "in_progress" | "completed" | "cancelled";

export interface ConsultationWorkspaceDraft {
  evolution: string;
  adherence: string;
  symptoms: string;
  conduct: string;
  goals: string;
  observations: string;
}

export interface PatientConsultationWorkspaceViewModel {
  patient: {
    id: string;
    name: string;
    birthDate: string | null;
    ageYears: number | null;
    status: string;
    primaryGoal: string | null;
  };
  consultation: {
    id: string;
    patientId: string;
    appointmentId: string | null;
    appointmentTitle: string | null;
    appointmentType: string | null;
    appointmentDate: string | null;
    status: ConsultationWorkspaceStatus;
    startedAt: string;
    endedAt: string | null;
    updatedAt: string;
    notes: string;
    draft: ConsultationWorkspaceDraft;
    canEdit: boolean;
    readOnlyReason: string | null;
  } | null;
  previousConsultation: {
    id: string;
    date: string;
    type: string | null;
  } | null;
  latestAnthropometry: {
    id: string;
    date: string;
    weightKg: number | null;
    bmi: number | null;
    waistCm: number | null;
    bodyFatPercent: number | null;
  } | null;
  previousAnthropometry: {
    id: string;
    date: string;
    weightKg: number | null;
  } | null;
  weightDelta: {
    kg: number;
    label: string;
  } | null;
  activeMealPlan: {
    id: string;
    title: string;
    version: number;
    updatedAt: string | null;
  } | null;
  draftMealPlan: {
    id: string;
    title: string;
    version: number;
    updatedAt: string | null;
  } | null;
  keyRestrictions: Array<{
    id: string;
    label: string;
    severity: string;
    source: string;
  }>;
  intakeSummary: {
    id: string;
    submittedAt: string;
    source: string | null;
    objective: string | null;
    motivation: string | null;
    serviceType: string | null;
    href: string;
  } | null;
  activeProtocols: Array<{
    id: string;
    protocolId: string;
    title: string | null;
    status: string;
    startedAt: string;
  }>;
  appointmentContext: {
    id: string;
    title: string;
    type: string;
    startsAt: string;
    status: string;
  } | null;
}

interface ClientRow {
  id: string;
  name: string;
  birth_date: string | null;
  status: string;
  source_submission_id: string | null;
}

interface NutritionRow {
  goals: string | null;
}

interface SessionRow {
  id: string;
  client_id: string;
  appointment_id: string | null;
  status: ConsultationWorkspaceStatus;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  summary_json: string | null;
  updated_at: string;
  appointment_title: string | null;
  appointment_type: string | null;
  appointment_starts_at: string | null;
  appointment_status: string | null;
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
  version: number;
  updated_at: string | null;
}

interface MarkerRow {
  id: string;
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
}

interface SubmissionRow {
  id: string;
  submission_source: string | null;
  answers_json: string;
  created_at: string;
}

interface WorkspaceSummary {
  workspaceDraft?: Partial<ConsultationWorkspaceDraft>;
  [key: string]: unknown;
}

const EMPTY_DRAFT: ConsultationWorkspaceDraft = {
  evolution: "",
  adherence: "",
  symptoms: "",
  conduct: "",
  goals: "",
  observations: "",
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readDraft(summary: unknown, notes: string): ConsultationWorkspaceDraft {
  const workspaceDraft = summary && typeof summary === "object" && "workspaceDraft" in summary
    ? (summary as WorkspaceSummary).workspaceDraft
    : null;
  return {
    evolution: cleanText(workspaceDraft?.evolution),
    adherence: cleanText(workspaceDraft?.adherence),
    symptoms: cleanText(workspaceDraft?.symptoms),
    conduct: cleanText(workspaceDraft?.conduct),
    goals: cleanText(workspaceDraft?.goals),
    observations: cleanText(workspaceDraft?.observations || notes),
  };
}

function decodeEvolution(row: EvolutionRow) {
  const payload = row.encrypted_payload ? decryptJsonValue<EvolutionPayload>(row.encrypted_payload, {}) : {};
  return {
    id: row.id,
    date: row.measured_at ?? row.created_at,
    weightKg: payload.weight ?? null,
    bmi: payload.bmi ?? null,
    waistCm: payload.waist_cm ?? null,
    bodyFatPercent: payload.body_fat_percentage ?? null,
  };
}

function weightDelta(latest: number | null, previous: number | null): PatientConsultationWorkspaceViewModel["weightDelta"] {
  if (latest === null || previous === null) return null;
  const kg = Math.round((latest - previous) * 10) / 10;
  return { kg, label: `${kg > 0 ? "+" : ""}${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg` };
}

function readAnswer(answers: Record<string, unknown>, key: string): string | null {
  const value = answers[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOnlyReason(status: ConsultationWorkspaceStatus): string | null {
  if (status === "completed") return "Consulta finalizada. Os dados ficam disponíveis apenas para leitura.";
  if (status === "cancelled") return "Consulta cancelada. Os dados ficam disponíveis apenas para leitura.";
  return null;
}

function sessionSql(consultationId?: string | null) {
  const base = `SELECT cs.id, cs.client_id, cs.appointment_id, cs.status, cs.started_at, cs.ended_at,
                       cs.notes, cs.summary_json, cs.updated_at,
                       a.title AS appointment_title, a.appointment_type, a.starts_at AS appointment_starts_at, a.status AS appointment_status
                FROM consultation_sessions cs
                LEFT JOIN appointments a ON a.id = cs.appointment_id AND a.client_id = cs.client_id`;
  if (consultationId) {
    return {
      sql: `${base} WHERE cs.id = ?1 AND cs.client_id = ?2 LIMIT 1`,
      params: [consultationId],
    };
  }
  return {
    sql: `${base} WHERE cs.client_id = ?1 AND cs.status = 'in_progress' ORDER BY cs.started_at DESC LIMIT 1`,
    params: [],
  };
}

export async function getConsultationWorkspace(
  patientId: string,
  consultationId?: string | null
): Promise<PatientConsultationWorkspaceViewModel | null> {
  const sessionQuery = sessionSql(consultationId);
  const batch = await d1Batch<unknown>([
    { sql: "SELECT id, name, birth_date, status, source_submission_id FROM clients WHERE id = ?1 LIMIT 1", params: [patientId] },
    { sql: "SELECT goals FROM nutrition_records WHERE client_id = ?1 LIMIT 1", params: [patientId] },
    { sql: sessionQuery.sql, params: consultationId ? [consultationId, patientId] : [patientId] },
    {
      sql: `SELECT cs.id, cs.started_at, cs.ended_at, a.appointment_type
            FROM consultation_sessions cs
            LEFT JOIN appointments a ON a.id = cs.appointment_id AND a.client_id = cs.client_id
            WHERE cs.client_id = ?1 AND cs.status = 'completed' AND (?2 IS NULL OR cs.id <> ?2)
            ORDER BY COALESCE(cs.ended_at, cs.started_at) DESC
            LIMIT 1`,
      params: [patientId, consultationId ?? null],
    },
    {
      sql: `SELECT id, measured_at, created_at, encrypted_payload
            FROM client_evolutions
            WHERE client_id = ?1
            ORDER BY COALESCE(measured_at, created_at) DESC
            LIMIT 3`,
      params: [patientId],
    },
    { sql: "SELECT id, title, version, updated_at FROM meal_plans WHERE client_id = ?1 AND status = 'active' ORDER BY updated_at DESC LIMIT 1", params: [patientId] },
    { sql: "SELECT id, title, version, updated_at FROM meal_plans WHERE client_id = ?1 AND status = 'draft' ORDER BY updated_at DESC LIMIT 1", params: [patientId] },
    {
      sql: `SELECT id, normalized_code, label_encrypted, severity, source
            FROM patient_clinical_markers
            WHERE client_id = ?1 AND status <> 'RESOLVED'
            ORDER BY CASE severity WHEN 'severe' THEN 0 WHEN 'moderate' THEN 1 WHEN 'mild' THEN 2 ELSE 3 END, normalized_code ASC
            LIMIT 4`,
      params: [patientId],
    },
    {
      sql: `SELECT cp.id, cp.protocol_id, cp.status, cp.started_at, p.title AS protocol_title
            FROM client_protocols cp
            LEFT JOIN protocols p ON p.id = cp.protocol_id
            WHERE cp.client_id = ?1 AND cp.status IN ('ativo', 'pausado')
            ORDER BY cp.started_at DESC
            LIMIT 3`,
      params: [patientId],
    },
    {
      sql: `SELECT fs.id, fs.submission_source, fs.answers_json, fs.created_at
            FROM form_submissions fs
            INNER JOIN clients c ON c.source_submission_id = fs.id
            WHERE c.id = ?1
            LIMIT 1`,
      params: [patientId],
    },
  ]);

  const client = batch[0]?.results[0] as ClientRow | undefined;
  if (!client) return null;

  const nutrition = batch[1]?.results[0] as NutritionRow | undefined;
  const session = batch[2]?.results[0] as SessionRow | undefined;
  const previousConsultation = batch[3]?.results[0] as { id: string; started_at: string; ended_at: string | null; appointment_type: string | null } | undefined;
  const evolutions = ((batch[4]?.results ?? []) as EvolutionRow[]).map(decodeEvolution);
  const activePlan = batch[5]?.results[0] as MealPlanRow | undefined;
  const draftPlan = batch[6]?.results[0] as MealPlanRow | undefined;
  const markers = (batch[7]?.results ?? []) as MarkerRow[];
  const protocols = (batch[8]?.results ?? []) as ProtocolRow[];
  const submission = batch[9]?.results[0] as SubmissionRow | undefined;

  const latestAnthropometry = evolutions[0] ?? null;
  const previousAnthropometry = evolutions[1]
    ? { id: evolutions[1].id, date: evolutions[1].date, weightKg: evolutions[1].weightKg }
    : null;
  const notes = decryptNullableText(session?.notes) ?? "";
  const summary = decryptJsonValue<WorkspaceSummary | null>(session?.summary_json ?? null, null);
  const answers = submission ? decryptJsonValue<Record<string, unknown>>(submission.answers_json, {}) : {};

  return {
    patient: {
      id: client.id,
      name: client.name,
      birthDate: client.birth_date,
      ageYears: calculateAgeInYears(client.birth_date),
      status: client.status,
      primaryGoal: decryptNullableText(nutrition?.goals) ?? null,
    },
    consultation: session
      ? {
          id: session.id,
          patientId: session.client_id,
          appointmentId: session.appointment_id,
          appointmentTitle: session.appointment_title,
          appointmentType: session.appointment_type,
          appointmentDate: session.appointment_starts_at,
          status: session.status,
          startedAt: session.started_at,
          endedAt: session.ended_at,
          updatedAt: session.updated_at,
          notes,
          draft: readDraft(summary, notes),
          canEdit: session.status === "in_progress" && client.status !== "arquivado",
          readOnlyReason: client.status === "arquivado" ? "Paciente arquivado. Reative o cadastro antes de editar." : readOnlyReason(session.status),
        }
      : null,
    previousConsultation: previousConsultation
      ? {
          id: previousConsultation.id,
          date: previousConsultation.ended_at ?? previousConsultation.started_at,
          type: previousConsultation.appointment_type,
        }
      : null,
    latestAnthropometry,
    previousAnthropometry,
    weightDelta: weightDelta(latestAnthropometry?.weightKg ?? null, previousAnthropometry?.weightKg ?? null),
    activeMealPlan: activePlan ? { id: activePlan.id, title: activePlan.title, version: activePlan.version, updatedAt: activePlan.updated_at } : null,
    draftMealPlan: draftPlan ? { id: draftPlan.id, title: draftPlan.title, version: draftPlan.version, updatedAt: draftPlan.updated_at } : null,
    keyRestrictions: markers.map((marker) => ({
      id: marker.id,
      label: decryptNullableText(marker.label_encrypted) ?? marker.normalized_code,
      severity: marker.severity,
      source: marker.source,
    })),
    intakeSummary: submission
      ? {
          id: submission.id,
          submittedAt: submission.created_at,
          source: submission.submission_source,
          objective: readAnswer(answers, "objetivo"),
          motivation: readAnswer(answers, "motivacao"),
          serviceType: readAnswer(answers, "tipoAtendimento"),
          href: `/dashboard/respostas/${submission.id}`,
        }
      : null,
    activeProtocols: protocols.map((protocol) => ({
      id: protocol.id,
      protocolId: protocol.protocol_id,
      title: protocol.protocol_title,
      status: protocol.status,
      startedAt: protocol.started_at,
    })),
    appointmentContext: session?.appointment_id && session.appointment_title && session.appointment_starts_at && session.appointment_status
      ? {
          id: session.appointment_id,
          title: session.appointment_title,
          type: session.appointment_type ?? "consulta",
          startsAt: session.appointment_starts_at,
          status: session.appointment_status,
        }
      : null,
  };
}

export async function saveConsultationWorkspaceDraft(input: {
  patientId: string;
  consultationId: string;
  draft: ConsultationWorkspaceDraft;
}): Promise<boolean> {
  const rows = await d1Query<SessionRow>(
    "SELECT * FROM consultation_sessions WHERE id = ?1 AND client_id = ?2 LIMIT 1",
    [input.consultationId, input.patientId]
  );
  const session = rows[0];
  if (!session || session.status !== "in_progress") return false;

  const currentSummary = decryptJsonValue<WorkspaceSummary | null>(session.summary_json, null) ?? {};
  const nextSummary: WorkspaceSummary = {
    ...currentSummary,
    workspaceDraft: input.draft,
  };
  const now = new Date().toISOString();
  const updated = await d1Query<SessionRow>(
    `UPDATE consultation_sessions
     SET notes = ?1, summary_json = ?2, updated_at = ?3
     WHERE id = ?4 AND client_id = ?5 AND status = 'in_progress'
     RETURNING *`,
    [
      encryptNullableText(input.draft.observations),
      encryptJsonValue(nextSummary),
      now,
      input.consultationId,
      input.patientId,
    ]
  );
  return updated.length > 0;
}

export function emptyConsultationWorkspaceDraft(): ConsultationWorkspaceDraft {
  return { ...EMPTY_DRAFT };
}
