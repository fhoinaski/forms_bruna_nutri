import { d1Batch } from "@/lib/d1/client";
import { decryptJsonValue } from "@/lib/security/encrypted-fields";

export type PatientTimelineEventType =
  | "CONSULTATION_COMPLETED"
  | "ANTHROPOMETRY_RECORDED"
  | "MEAL_PLAN_PUBLISHED"
  | "PROTOCOL_STARTED"
  | "PROTOCOL_COMPLETED";

export type PatientTimelineFilter = "all" | "consultations" | "anthropometry" | "meal_plans" | "protocols";

export interface PatientTimelineEvent {
  id: string;
  patientId: string;
  type: PatientTimelineEventType;
  category: Exclude<PatientTimelineFilter, "all">;
  occurredAt: string;
  title: string;
  summary: string[];
  href: string | null;
  sourceEntityId: string;
  source: {
    table: "consultation_sessions" | "client_evolutions" | "meal_plans" | "client_protocols";
    id: string;
  };
  metadata: {
    version?: number;
    status?: string;
    weightDeltaKg?: number | null;
  };
}

export interface PatientTimelineResult {
  patientId: string;
  events: PatientTimelineEvent[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface PatientTimelineOptions {
  limit?: number;
  offset?: number;
  filter?: PatientTimelineFilter;
  now?: Date;
}

interface ClientRow {
  id: string;
}

interface ConsultationRow {
  id: string;
  client_id: string;
  status: "completed";
  started_at: string;
  ended_at: string | null;
  appointment_type: string | null;
}

interface EvolutionRow {
  id: string;
  client_id: string;
  measured_at: string | null;
  created_at: string;
  encrypted_payload: string | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  waist_cm: number | null;
  body_fat_percentage: number | null;
}

interface EvolutionPayload {
  weight?: number | null;
  height?: number | null;
  bmi?: number | null;
  waist_cm?: number | null;
  body_fat_percentage?: number | null;
}

interface MealPlanRow {
  id: string;
  client_id: string;
  title: string;
  status: "active" | "archived";
  version: number;
  updated_at: string;
  created_at: string;
}

interface ProtocolRow {
  id: string;
  client_id: string;
  protocol_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
  protocol_title: string | null;
}

const VALID_FILTERS: PatientTimelineFilter[] = ["all", "consultations", "anthropometry", "meal_plans", "protocols"];

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 20;
  return Math.min(50, Math.max(1, Math.trunc(value ?? 20)));
}

function normalizeOffset(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value ?? 0));
}

export function normalizePatientTimelineFilter(value: string | null | undefined): PatientTimelineFilter {
  return VALID_FILTERS.includes(value as PatientTimelineFilter) ? value as PatientTimelineFilter : "all";
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits });
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function appointmentTypeLabel(type: string | null): string {
  if (!type) return "Consulta finalizada";
  const normalized = type.replaceAll("_", " ").replaceAll("-", " ").trim();
  return `Consulta de ${normalized}`;
}

function decodeEvolution(row: EvolutionRow) {
  const payload = row.encrypted_payload
    ? decryptJsonValue<EvolutionPayload>(row.encrypted_payload, {})
    : {
        weight: row.weight,
        height: row.height,
        bmi: row.bmi,
        waist_cm: row.waist_cm,
        body_fat_percentage: row.body_fat_percentage,
      };
  return {
    id: row.id,
    patientId: row.client_id,
    occurredAt: row.measured_at ?? row.created_at,
    weightKg: payload.weight ?? null,
    bmi: payload.bmi ?? null,
    waistCm: payload.waist_cm ?? null,
    bodyFatPercent: payload.body_fat_percentage ?? null,
  };
}

function buildAnthropometrySummaries(input: {
  weightKg: number | null;
  bmi: number | null;
  waistCm: number | null;
  bodyFatPercent: number | null;
  weightDeltaKg: number | null;
}): string[] {
  const summary: string[] = [];
  if (input.weightKg !== null) summary.push(`Peso: ${formatNumber(input.weightKg)} kg`);
  if (input.weightDeltaKg !== null) {
    const sign = input.weightDeltaKg > 0 ? "+" : "";
    summary.push(`${sign}${formatNumber(input.weightDeltaKg)} kg vs avaliacao anterior`);
  }
  if (input.bmi !== null) summary.push(`IMC: ${formatNumber(input.bmi)}`);
  if (input.waistCm !== null) summary.push(`Cintura: ${formatNumber(input.waistCm)} cm`);
  if (input.bodyFatPercent !== null) summary.push(`Gordura corporal: ${formatNumber(input.bodyFatPercent)}%`);
  return summary;
}

function normalizeEvents(input: {
  patientId: string;
  consultations: ConsultationRow[];
  evolutions: EvolutionRow[];
  mealPlans: MealPlanRow[];
  protocols: ProtocolRow[];
}): PatientTimelineEvent[] {
  const events: PatientTimelineEvent[] = [];

  for (const consultation of input.consultations) {
    const occurredAt = consultation.ended_at ?? consultation.started_at;
    events.push({
      id: `consultation:${consultation.id}`,
      patientId: input.patientId,
      type: "CONSULTATION_COMPLETED",
      category: "consultations",
      occurredAt,
      title: appointmentTypeLabel(consultation.appointment_type),
      summary: ["Consulta finalizada"],
      href: `/dashboard/clients/${input.patientId}/consulta?sessionId=${consultation.id}`,
      sourceEntityId: consultation.id,
      source: { table: "consultation_sessions", id: consultation.id },
      metadata: { status: consultation.status },
    });
  }

  const decodedEvolutions = input.evolutions
    .map(decodeEvolution)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  let previousWeightKg: number | null = null;
  for (const evolution of decodedEvolutions) {
    const weightDeltaKg = evolution.weightKg !== null && previousWeightKg !== null
      ? roundOne(evolution.weightKg - previousWeightKg)
      : null;
    if (evolution.weightKg !== null) previousWeightKg = evolution.weightKg;
    events.push({
      id: `anthropometry:${evolution.id}`,
      patientId: input.patientId,
      type: "ANTHROPOMETRY_RECORDED",
      category: "anthropometry",
      occurredAt: evolution.occurredAt,
      title: "Avaliacao antropometrica",
      summary: buildAnthropometrySummaries({ ...evolution, weightDeltaKg }),
      href: `/dashboard/clients/${input.patientId}?tab=antropometria&evolutionId=${evolution.id}`,
      sourceEntityId: evolution.id,
      source: { table: "client_evolutions", id: evolution.id },
      metadata: { weightDeltaKg },
    });
  }

  for (const plan of input.mealPlans) {
    events.push({
      id: `meal-plan:${plan.id}:v${plan.version}`,
      patientId: input.patientId,
      type: "MEAL_PLAN_PUBLISHED",
      category: "meal_plans",
      occurredAt: plan.updated_at ?? plan.created_at,
      title: "Plano alimentar publicado",
      summary: [`${plan.title}`, `Versao ${plan.version}`],
      href: `/dashboard/clients/${input.patientId}?tab=plano-alimentar&planId=${plan.id}`,
      sourceEntityId: plan.id,
      source: { table: "meal_plans", id: plan.id },
      metadata: { version: plan.version, status: plan.status },
    });
  }

  for (const protocol of input.protocols) {
    events.push({
      id: `protocol-started:${protocol.id}`,
      patientId: input.patientId,
      type: "PROTOCOL_STARTED",
      category: "protocols",
      occurredAt: protocol.started_at,
      title: "Protocolo iniciado",
      summary: [protocol.protocol_title ?? "Protocolo de cuidado"],
      href: `/dashboard/protocols/${protocol.protocol_id}`,
      sourceEntityId: protocol.id,
      source: { table: "client_protocols", id: protocol.id },
      metadata: { status: protocol.status },
    });
    if (protocol.status === "concluido" && protocol.completed_at) {
      events.push({
        id: `protocol-completed:${protocol.id}`,
        patientId: input.patientId,
        type: "PROTOCOL_COMPLETED",
        category: "protocols",
        occurredAt: protocol.completed_at,
        title: "Protocolo concluido",
        summary: [protocol.protocol_title ?? "Protocolo de cuidado"],
        href: `/dashboard/protocols/${protocol.protocol_id}`,
        sourceEntityId: protocol.id,
        source: { table: "client_protocols", id: protocol.id },
        metadata: { status: protocol.status },
      });
    }
  }

  return events;
}

function eventRank(event: PatientTimelineEvent): number {
  const ranks: Record<PatientTimelineEventType, number> = {
    MEAL_PLAN_PUBLISHED: 0,
    CONSULTATION_COMPLETED: 1,
    ANTHROPOMETRY_RECORDED: 2,
    PROTOCOL_COMPLETED: 3,
    PROTOCOL_STARTED: 4,
  };
  return ranks[event.type];
}

function sortEvents(events: PatientTimelineEvent[]): PatientTimelineEvent[] {
  return events.sort((a, b) => {
    const date = b.occurredAt.localeCompare(a.occurredAt);
    if (date !== 0) return date;
    const rank = eventRank(a) - eventRank(b);
    if (rank !== 0) return rank;
    return a.id.localeCompare(b.id);
  });
}

export async function getPatientClinicalTimeline(
  patientId: string,
  options: PatientTimelineOptions = {}
): Promise<PatientTimelineResult | null> {
  const limit = clampLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  const filter = normalizePatientTimelineFilter(options.filter);
  const now = (options.now ?? new Date()).toISOString();

  const batch = await d1Batch<unknown>([
    { sql: "SELECT id FROM clients WHERE id = ?1 LIMIT 1", params: [patientId] },
    {
      sql: `SELECT cs.id, cs.client_id, cs.status, cs.started_at, cs.ended_at, a.appointment_type
            FROM consultation_sessions cs
            LEFT JOIN appointments a ON a.id = cs.appointment_id AND a.client_id = cs.client_id
            WHERE cs.client_id = ?1 AND cs.status = 'completed' AND COALESCE(cs.ended_at, cs.started_at) <= ?2
            ORDER BY COALESCE(cs.ended_at, cs.started_at) DESC
            LIMIT 200`,
      params: [patientId, now],
    },
    {
      sql: `SELECT id, client_id, measured_at, created_at, encrypted_payload,
                   weight, height, bmi, waist_cm, body_fat_percentage
            FROM client_evolutions
            WHERE client_id = ?1 AND COALESCE(measured_at, created_at) <= ?2
            ORDER BY COALESCE(measured_at, created_at) DESC
            LIMIT 200`,
      params: [patientId, now],
    },
    {
      sql: `SELECT id, client_id, title, status, version, updated_at, created_at
            FROM meal_plans
            WHERE client_id = ?1 AND status IN ('active', 'archived') AND COALESCE(updated_at, created_at) <= ?2
            ORDER BY COALESCE(updated_at, created_at) DESC
            LIMIT 100`,
      params: [patientId, now],
    },
    {
      sql: `SELECT cp.id, cp.client_id, cp.protocol_id, cp.status, cp.started_at, cp.completed_at, cp.updated_at,
                   p.title AS protocol_title
            FROM client_protocols cp
            LEFT JOIN protocols p ON p.id = cp.protocol_id
            WHERE cp.client_id = ?1 AND cp.started_at <= ?2
            ORDER BY cp.started_at DESC
            LIMIT 100`,
      params: [patientId, now],
    },
  ]);

  const client = batch[0]?.results[0] as ClientRow | undefined;
  if (!client) return null;

  const events = sortEvents(normalizeEvents({
    patientId,
    consultations: (batch[1]?.results ?? []) as ConsultationRow[],
    evolutions: (batch[2]?.results ?? []) as EvolutionRow[],
    mealPlans: (batch[3]?.results ?? []) as MealPlanRow[],
    protocols: (batch[4]?.results ?? []) as ProtocolRow[],
  }))
    .filter((event) => event.occurredAt <= now)
    .filter((event) => filter === "all" || event.category === filter);

  const paged = events.slice(offset, offset + limit);
  return {
    patientId,
    events: paged,
    total: events.length,
    limit,
    offset,
    hasMore: offset + paged.length < events.length,
  };
}
