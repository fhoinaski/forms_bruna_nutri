import { createHash } from "node:crypto";
import type { Appointment } from "@/lib/repositories/appointments";
import { getAppointmentById, getAppointments } from "@/lib/repositories/appointments";
import { getClientById, type Client } from "@/lib/repositories/clients";
import {
  buildConsultationSystemData,
  generateConsultationAiBriefWithMetadata,
  type ConsultationAiBrief,
  type ConsultationSystemData,
} from "@/lib/ai/agents/clinical/consultation-briefing";
import {
  claimAppointmentAiBriefForGeneration,
  getAppointmentAiBriefByAppointmentId,
  insertGeneratingAppointmentAiBrief,
  markAppointmentAiBriefFailed,
  markAppointmentAiBriefReady,
  markAppointmentAiBriefStale,
  type AppointmentAiBrief,
  type AppointmentAiBriefStatus,
} from "@/lib/repositories/appointment-ai-briefs";
import { writeAuditLog } from "@/lib/security/audit";

export const APPOINTMENT_BRIEFING_WINDOW = {
  startsInMinutes: 15,
  endsInMinutes: 90,
  staleAfterMinutes: 180,
} as const;

export type BriefItemSource = "FACT" | "AI_SUMMARY" | "SUGGESTION";

export interface ProactiveConsultationBrief {
  summary: { source: "AI_SUMMARY"; text: string } | null;
  facts: Array<{ source: "FACT"; label: string; value: string }>;
  changesSinceLastVisit: Array<{ source: "AI_SUMMARY"; description: string }>;
  attentionPoints: Array<{ source: "AI_SUMMARY"; priority: "high" | "normal"; description: string }>;
  suggestedQuestions: Array<{ source: "SUGGESTION"; question: string }>;
  currentPlanSummary: { source: "FACT"; text: string } | null;
  pendingItems: Array<{ source: "FACT" | "AI_SUMMARY"; description: string }>;
  dataGaps: Array<{ source: "AI_SUMMARY"; description: string }>;
  systemData: ConsultationSystemData;
  aiBrief: ConsultationAiBrief | null;
  generatedAt: string;
}

export interface AppointmentBriefState {
  appointmentId: string;
  clientId: string | null;
  status: AppointmentAiBriefStatus | "none";
  generatedAt: string | null;
  errorCode: string | null;
  brief: ProactiveConsultationBrief | null;
  provider: string | null;
  model: string | null;
  stale: boolean;
}

export interface PrepareAppointmentBriefResult {
  outcome: "generated" | "reused" | "generating" | "stale" | "failed" | "skipped";
  reason?: string;
  brief: AppointmentAiBrief | null;
}

function isoAfter(base: Date, minutes: number): string {
  return new Date(base.getTime() + minutes * 60_000).toISOString();
}

function hashSnapshot(input: { appointment: Appointment; client: Client; systemData: ConsultationSystemData }): string {
  return createHash("sha256").update(JSON.stringify({
    appointment: {
      id: input.appointment.id,
      clientId: input.appointment.client_id,
      startsAt: input.appointment.starts_at,
      endsAt: input.appointment.ends_at,
      status: input.appointment.status,
      updatedAt: input.appointment.updated_at,
    },
    client: { id: input.client.id, updatedAt: input.client.updated_at },
    systemData: input.systemData,
  })).digest("hex");
}

function factsFromSystemData(data: ConsultationSystemData): ProactiveConsultationBrief["facts"] {
  const facts: ProactiveConsultationBrief["facts"] = [];
  if (data.lastVisit.date) facts.push({ source: "FACT", label: "Ultima consulta registrada", value: data.lastVisit.date });
  if (data.evolution.currentWeightKg !== null) facts.push({ source: "FACT", label: "Peso atual", value: `${data.evolution.currentWeightKg} kg` });
  if (data.evolution.weightDeltaKg !== null) facts.push({ source: "FACT", label: "Variacao de peso", value: `${data.evolution.weightDeltaKg} kg` });
  if (data.activePlan.title) facts.push({ source: "FACT", label: "Plano ativo", value: `${data.activePlan.title} v${data.activePlan.version ?? "-"}` });
  if (data.activeProtocol?.title) facts.push({ source: "FACT", label: "Protocolo ativo", value: data.activeProtocol.title });
  if (data.clinicalMarkers.length) facts.push({ source: "FACT", label: "Marcadores clinicos", value: String(data.clinicalMarkers.length) });
  return facts;
}

function buildProactiveBrief(input: {
  systemData: ConsultationSystemData;
  aiBrief: ConsultationAiBrief | null;
  generatedAt: string;
}): ProactiveConsultationBrief {
  const pendingFacts = [
    ...input.systemData.pending.tasks.map((task) => ({ source: "FACT" as const, description: `Tarefa pendente: ${task.title}` })),
    ...input.systemData.pending.patientRequests.map((request) => ({ source: "FACT" as const, description: `Solicitacao pendente: ${request.summary}` })),
  ].slice(0, 8);

  return {
    summary: input.aiBrief ? { source: "AI_SUMMARY", text: input.aiBrief.clinicalSummary } : null,
    facts: factsFromSystemData(input.systemData),
    changesSinceLastVisit: input.aiBrief?.changesSinceLastVisit.map((description) => ({ source: "AI_SUMMARY" as const, description })) ?? [],
    attentionPoints: input.aiBrief?.attentionPoints.map((description) => ({
      source: "AI_SUMMARY" as const,
      priority: /urg|risco|sintoma|alerg|restri|vencid/i.test(description) ? "high" as const : "normal" as const,
      description,
    })) ?? [],
    suggestedQuestions: input.aiBrief?.suggestedTopics.map((question) => ({ source: "SUGGESTION" as const, question })) ?? [],
    currentPlanSummary: input.systemData.activePlan.title
      ? { source: "FACT", text: `${input.systemData.activePlan.title} (${input.systemData.activePlan.mealCount} refeicoes${input.systemData.activePlan.macros ? `, ~${input.systemData.activePlan.macros.kcal} kcal/dia` : ""}).` }
      : null,
    pendingItems: [
      ...pendingFacts,
      ...(input.aiBrief?.pendingItems.map((description) => ({ source: "AI_SUMMARY" as const, description })) ?? []),
    ].slice(0, 8),
    dataGaps: input.aiBrief?.missingData.map((description) => ({ source: "AI_SUMMARY" as const, description })) ?? [],
    systemData: input.systemData,
    aiBrief: input.aiBrief,
    generatedAt: input.generatedAt,
  };
}

async function buildSnapshot(appointment: Appointment, client: Client) {
  const systemData = await buildConsultationSystemData(client);
  const inputVersion = hashSnapshot({ appointment, client, systemData });
  return {
    systemData,
    inputVersion,
    sourceSnapshotAt: new Date().toISOString(),
    expiresAt: isoAfter(new Date(appointment.starts_at), APPOINTMENT_BRIEFING_WINDOW.staleAfterMinutes),
  };
}

function isAppointmentEligible(appointment: Appointment, now: Date): { eligible: boolean; reason?: string } {
  if (!appointment.client_id) return { eligible: false, reason: "appointment_without_client" };
  if (["cancelado", "cancelada", "realizado"].includes(appointment.status)) return { eligible: false, reason: "appointment_inactive" };
  if (new Date(appointment.starts_at).getTime() < now.getTime()) return { eligible: false, reason: "appointment_past" };
  return { eligible: true };
}

async function auditAppointmentBrief(action: string, input: {
  adminId?: string | null;
  appointmentId: string;
  clientId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await writeAuditLog({
    action,
    adminId: input.adminId ?? null,
    entityType: "appointment_ai_brief",
    entityId: input.appointmentId,
    metadata: { clientId: input.clientId ?? null, ...(input.metadata ?? {}) },
  });
}

export async function prepareAppointmentAiBrief(appointmentId: string, options: {
  adminId?: string | null;
  force?: boolean;
  now?: Date;
} = {}): Promise<PrepareAppointmentBriefResult> {
  const now = options.now ?? new Date();
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) return { outcome: "skipped", reason: "appointment_not_found", brief: null };
  const eligibility = isAppointmentEligible(appointment, now);
  if (!eligibility.eligible) return { outcome: "skipped", reason: eligibility.reason, brief: null };
  const client = appointment.client_id ? await getClientById(appointment.client_id) : null;
  if (!client) return { outcome: "skipped", reason: "client_not_found", brief: null };

  const snapshot = await buildSnapshot(appointment, client);
  const existing = await getAppointmentAiBriefByAppointmentId(appointment.id);
  if (existing?.status === "ready" && existing.input_version === snapshot.inputVersion && !options.force) {
    await auditAppointmentBrief("appointment_ai_brief_reused", { adminId: options.adminId, appointmentId, clientId: client.id });
    return { outcome: "reused", brief: existing };
  }
  if (existing?.status === "generating" && !options.force) return { outcome: "generating", brief: existing };

  const claimed = existing
    ? await claimAppointmentAiBriefForGeneration({
        id: existing.id,
        inputVersion: snapshot.inputVersion,
        sourceSnapshotAt: snapshot.sourceSnapshotAt,
        expiresAt: snapshot.expiresAt,
      })
    : await insertGeneratingAppointmentAiBrief({
        appointmentId: appointment.id,
        clientId: client.id,
        inputVersion: snapshot.inputVersion,
        sourceSnapshotAt: snapshot.sourceSnapshotAt,
        expiresAt: snapshot.expiresAt,
      });
  if (!claimed) return { outcome: "generating", brief: existing };

  const startedAt = Date.now();
  await auditAppointmentBrief(options.force ? "appointment_ai_brief_regenerated" : "appointment_ai_brief_requested", {
    adminId: options.adminId,
    appointmentId,
    clientId: client.id,
    metadata: { inputVersion: snapshot.inputVersion },
  });

  try {
    const ai = await generateConsultationAiBriefWithMetadata(client, snapshot.systemData, options.adminId);
    const generatedAt = new Date().toISOString();
    const proactiveBrief = buildProactiveBrief({ systemData: snapshot.systemData, aiBrief: ai.brief, generatedAt });
    await markAppointmentAiBriefReady({ id: claimed.id, brief: proactiveBrief, provider: ai.provider, model: ai.model });
    const ready = await getAppointmentAiBriefByAppointmentId(appointment.id);
    await auditAppointmentBrief("appointment_ai_brief_generated", {
      adminId: options.adminId,
      appointmentId,
      clientId: client.id,
      metadata: { latencyMs: Date.now() - startedAt, provider: ai.provider, model: ai.model, hasAiInterpretation: ai.brief !== null },
    });
    return { outcome: "generated", brief: ready };
  } catch (error) {
    const errorCode = error instanceof Error ? error.name : "unknown_error";
    await markAppointmentAiBriefFailed({ id: claimed.id, errorCode });
    await auditAppointmentBrief("appointment_ai_brief_failed", {
      adminId: options.adminId,
      appointmentId,
      clientId: client.id,
      metadata: { latencyMs: Date.now() - startedAt, errorCode },
    });
    return { outcome: "failed", reason: errorCode, brief: await getAppointmentAiBriefByAppointmentId(appointment.id) };
  }
}

export async function getAppointmentBriefState(appointmentId: string): Promise<AppointmentBriefState> {
  const appointment = await getAppointmentById(appointmentId);
  const existing = await getAppointmentAiBriefByAppointmentId(appointmentId);
  if (!appointment) {
    return { appointmentId, clientId: null, status: existing?.status ?? "none", generatedAt: existing?.generated_at ?? null, errorCode: existing?.error_code ?? null, brief: existing?.brief as ProactiveConsultationBrief | null ?? null, provider: existing?.provider ?? null, model: existing?.model ?? null, stale: false };
  }
  let stale = false;
  if (existing?.status === "ready" && appointment.client_id) {
    const client = await getClientById(appointment.client_id);
    if (client) {
      const snapshot = await buildSnapshot(appointment, client);
      stale = snapshot.inputVersion !== existing.input_version || (existing.expires_at ? new Date(existing.expires_at).getTime() < Date.now() : false);
      if (stale) await markAppointmentAiBriefStale(existing.id);
    }
  }
  const current = stale ? await getAppointmentAiBriefByAppointmentId(appointmentId) : existing;
  return {
    appointmentId,
    clientId: appointment.client_id,
    status: current?.status ?? "none",
    generatedAt: current?.generated_at ?? null,
    errorCode: current?.error_code ?? null,
    brief: current?.brief as ProactiveConsultationBrief | null ?? null,
    provider: current?.provider ?? null,
    model: current?.model ?? null,
    stale,
  };
}

export async function prepareUpcomingConsultationBriefs(options: {
  adminId?: string | null;
  now?: Date;
  limit?: number;
} = {}) {
  const now = options.now ?? new Date();
  const from = isoAfter(now, APPOINTMENT_BRIEFING_WINDOW.startsInMinutes);
  const to = isoAfter(now, APPOINTMENT_BRIEFING_WINDOW.endsInMinutes);
  const appointments = (await getAppointments({ from, to }))
    .filter((appointment) => appointment.client_id && !["cancelado", "cancelada", "realizado"].includes(appointment.status))
    .slice(0, Math.min(Math.max(options.limit ?? 10, 1), 25));

  const results: PrepareAppointmentBriefResult[] = [];
  for (const appointment of appointments) {
    results.push(await prepareAppointmentAiBrief(appointment.id, { adminId: options.adminId, now }));
  }
  return {
    window: { from, to },
    processed: appointments.length,
    generated: results.filter((result) => result.outcome === "generated").length,
    reused: results.filter((result) => result.outcome === "reused").length,
    generating: results.filter((result) => result.outcome === "generating").length,
    failed: results.filter((result) => result.outcome === "failed").length,
    skipped: results.filter((result) => result.outcome === "skipped").length,
    results: results.map((result) => ({ outcome: result.outcome, reason: result.reason ?? null, briefId: result.brief?.id ?? null })),
  };
}
