import { z } from "zod";
import { getClientEvolutions, type ClientEvolution } from "@/lib/repositories/client-evolutions";
import { getClientTasks } from "@/lib/repositories/client-tasks";
import { getActiveMealPlan } from "@/lib/repositories/meal-plans";
import { getAppointments, type Appointment } from "@/lib/repositories/appointments";
import { getClientProtocols } from "@/lib/repositories/client-protocols";
import { listPatientRequests } from "@/lib/repositories/patient-requests";
import { listPatientClinicalMarkers } from "@/lib/repositories/patient-clinical-markers";
import { listRecentPatientFoodSubstitutionEvents } from "@/lib/repositories/patient-food-substitution-events";
import { estimateFoodMacrosFromTaco } from "@/lib/nutrition/taco";
import { sumMacros, roundedMacros, type MacroTotals } from "@/lib/nutrition/macros";
import { calculateWeightDelta } from "@/lib/clinical/anthropometry";
import type { Client } from "@/lib/repositories/clients";
import { generateStructuredResult } from "@/lib/ai/gateway/ai-gateway";
import { sanitizeClinicalContext, stripInternalPatientAlias } from "@/lib/ai/privacy/sanitize-context";
import { AiConfigError, AiProviderError, AiValidationError } from "@/lib/ai/core/ai-errors";
import { assertCategoryAllowed } from "@/lib/ai/policies/clinical-context-policy";

/**
 * Briefing do Modo Consulta — NAO substitui
 * lib/ai/agents/clinical/pre-consultation-briefing.ts (usado hoje pela
 * agenda; continua intocado). Este e um irmao mais rico, especifico do
 * workspace de consulta: reaproveita os MESMOS repositories/calculos e
 * acrescenta protocolo/pendencias do paciente/macros do plano — dados que a
 * agenda nao precisa mas o Modo Consulta precisa (secao 4 do pedido).
 *
 * Mesma filosofia do briefing original: `systemData` e 100% deterministico
 * (repositories + calculos ja existentes, nunca calculado pela IA);
 * `aiBrief` e uma camada opcional que so INTERPRETA os fatos ja prontos —
 * se a IA falhar ou nao estiver configurada, o systemData sozinho ja e util.
 */

export interface ConsultationSystemData {
  lastVisit: {
    date: string | null;
    weightKg: number | null;
    bmi: number | null;
    waistCm: number | null;
    bodyFatPercentage: number | null;
    progressNotes: string | null;
    conductNotes: string | null;
  };
  evolution: {
    currentWeightKg: number | null;
    previousWeightKg: number | null;
    weightDeltaKg: number | null;
    weightDeltaPercent: number | null;
    waistCm: number | null;
    bodyFatPercentage: number | null;
    adherenceScore: number | null;
    symptoms: string | null;
  };
  pending: {
    tasks: { title: string; dueDate: string | null }[];
    patientRequests: { requestType: string; summary: string }[];
    upcomingAppointment: { date: string; title: string } | null;
  };
  clinicalMarkers: { type: string; code: string; status: string; severity: string; label: string | null }[];
  recentSubstitutions: { targetFoodName: string | null; decision: string; createdAt: string }[];
  activePlan: {
    title: string | null;
    version: number | null;
    status: string | null;
    mealCount: number;
    macros: MacroTotals | null;
  };
  activeProtocol: {
    title: string | null;
    status: string | null;
    phaseCount: number;
    taskCount: number;
    completedTaskCount: number;
  } | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function sumMealPlanMacros(plan: NonNullable<Awaited<ReturnType<typeof getActiveMealPlan>>>): MacroTotals {
  const items = plan.meals.flatMap((meal) => meal.items);
  const totals = items.map((item) => estimateFoodMacrosFromTaco(item.food, item.quantity ?? undefined, item.unit ?? undefined));
  return roundedMacros(sumMacros(totals));
}

export async function buildConsultationSystemData(client: Client): Promise<ConsultationSystemData> {
  const [evolutions, pendingTasks, activeMealPlan, appointments, protocols, patientRequests, clinicalMarkers, substitutions] = await Promise.all([
    getClientEvolutions(client.id),
    getClientTasks(client.id, { status: "pendente" }),
    getActiveMealPlan(client.id),
    getAppointments({ clientId: client.id }),
    getClientProtocols(client.id),
    listPatientRequests({ clientId: client.id, status: "pending_review" }),
    listPatientClinicalMarkers(client.id),
    listRecentPatientFoodSubstitutionEvents(client.id, 5),
  ]);

  const weighed: ClientEvolution[] = evolutions
    .filter((evolution) => evolution.weight !== null && evolution.measured_at)
    .sort((a, b) => new Date(b.measured_at as string).getTime() - new Date(a.measured_at as string).getTime());

  const last = weighed[0] ?? null;
  const previous = weighed[1] ?? null;
  const deltaKg = calculateWeightDelta(last?.weight, previous?.weight);
  const deltaPercent = deltaKg !== null && previous?.weight ? round1((deltaKg / previous.weight) * 100) : null;

  const now = Date.now();
  const upcoming = appointments
    .filter((appointment: Appointment) => new Date(appointment.starts_at).getTime() > now && appointment.status !== "cancelado")
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];

  const activeProtocolRow = protocols.find((protocol) => protocol.status === "ativo") ?? null;

  return {
    lastVisit: {
      date: last?.measured_at ?? null,
      weightKg: last?.weight ?? null,
      bmi: last?.bmi ?? null,
      waistCm: last?.waist_cm ?? null,
      bodyFatPercentage: last?.body_fat_percentage ?? null,
      progressNotes: last?.progress_notes ?? null,
      conductNotes: last?.conduct_notes ?? null,
    },
    evolution: {
      currentWeightKg: last?.weight ?? null,
      previousWeightKg: previous?.weight ?? null,
      weightDeltaKg: deltaKg,
      weightDeltaPercent: deltaPercent,
      waistCm: last?.waist_cm ?? null,
      bodyFatPercentage: last?.body_fat_percentage ?? null,
      adherenceScore: last?.adherence_score ?? null,
      symptoms: last?.symptoms ?? null,
    },
    pending: {
      tasks: pendingTasks.map((task) => ({ title: task.title, dueDate: task.due_date })),
      patientRequests: patientRequests.map((request) => ({ requestType: request.request_type, summary: (request.ai_summary ?? request.patient_text).slice(0, 140) })),
      upcomingAppointment: upcoming ? { date: upcoming.starts_at, title: upcoming.title } : null,
    },
    clinicalMarkers: clinicalMarkers
      .filter((marker) => marker.status !== "RESOLVED")
      .slice(0, 10)
      .map((marker) => ({
        type: marker.type,
        code: marker.normalized_code,
        status: marker.status,
        severity: marker.severity,
        label: marker.label ?? null,
      })),
    recentSubstitutions: substitutions.map((event) => ({
      targetFoodName: event.target_food_name,
      decision: event.policy_decision,
      createdAt: event.created_at,
    })),
    activePlan: {
      title: activeMealPlan?.title ?? null,
      version: activeMealPlan?.version ?? null,
      status: activeMealPlan?.status ?? null,
      mealCount: activeMealPlan?.meals.length ?? 0,
      macros: activeMealPlan ? sumMealPlanMacros(activeMealPlan) : null,
    },
    activeProtocol: activeProtocolRow
      ? {
          title: activeProtocolRow.protocol_title ?? null,
          status: activeProtocolRow.status,
          phaseCount: activeProtocolRow.phase_count ?? 0,
          taskCount: activeProtocolRow.task_count ?? 0,
          completedTaskCount: activeProtocolRow.completed_task_count ?? 0,
        }
      : null,
  };
}

function formatSystemDataForPrompt(data: ConsultationSystemData): string {
  const lines = [
    data.lastVisit.date
      ? `Ultima consulta registrada em ${new Date(data.lastVisit.date).toLocaleDateString("pt-BR")}.`
      : "Nenhuma consulta anterior registrada.",
    data.evolution.currentWeightKg !== null && data.evolution.previousWeightKg !== null
      ? `Peso: ${data.evolution.previousWeightKg} kg -> ${data.evolution.currentWeightKg} kg (variacao: ${data.evolution.weightDeltaKg} kg, ${data.evolution.weightDeltaPercent}%).`
      : data.evolution.currentWeightKg !== null
        ? `Peso atual: ${data.evolution.currentWeightKg} kg (sem peso anterior para comparar).`
        : "Sem registro de peso.",
    data.evolution.waistCm !== null ? `Cintura mais recente: ${data.evolution.waistCm} cm.` : "",
    data.evolution.bodyFatPercentage !== null ? `Percentual de gordura mais recente: ${data.evolution.bodyFatPercentage}%.` : "",
    data.evolution.adherenceScore !== null ? `Adesao autorrelatada (0-10): ${data.evolution.adherenceScore}.` : "",
    data.evolution.symptoms ? `Sintomas relatados na ultima avaliacao: ${data.evolution.symptoms}` : "",
    data.lastVisit.conductNotes ? `Conduta da ultima consulta: ${data.lastVisit.conductNotes}` : "",
    data.activePlan.title
      ? `Plano alimentar ativo: "${data.activePlan.title}" (versao ${data.activePlan.version}, ${data.activePlan.mealCount} refeicoes${data.activePlan.macros ? `, ~${data.activePlan.macros.kcal} kcal/dia calculado` : ""}).`
      : "Sem plano alimentar ativo.",
    data.activeProtocol
      ? `Protocolo ativo: "${data.activeProtocol.title}" (${data.activeProtocol.completedTaskCount}/${data.activeProtocol.taskCount} tarefas concluidas).`
      : "Sem protocolo ativo.",
    data.pending.tasks.length ? `Tarefas pendentes: ${data.pending.tasks.map((task) => task.title).join("; ")}.` : "Sem tarefas pendentes.",
    data.pending.patientRequests.length
      ? `Solicitacoes da paciente aguardando revisao: ${data.pending.patientRequests.map((request) => request.summary).join("; ")}.`
      : "Sem solicitacoes da paciente pendentes.",
    data.clinicalMarkers.length
      ? `Marcadores clinicos estruturados ativos/suspeitos: ${data.clinicalMarkers.map((marker) => `${marker.type}:${marker.code}:${marker.status}`).join("; ")}.`
      : "Sem marcadores clinicos estruturados ativos/suspeitos.",
    data.recentSubstitutions.length
      ? `Substituicoes alimentares recentes: ${data.recentSubstitutions.map((event) => `${event.targetFoodName ?? "alimento"}:${event.decision}`).join("; ")}.`
      : "Sem substituicoes alimentares recentes registradas.",
  ];
  return lines.filter(Boolean).join("\n");
}

export const consultationAiBriefSchema = z.object({
  clinicalSummary: z.string().max(1200),
  changesSinceLastVisit: z.array(z.string().max(300)).max(6),
  attentionPoints: z.array(z.string().max(300)).max(6),
  pendingItems: z.array(z.string().max(300)).max(6),
  suggestedTopics: z.array(z.string().max(300)).max(6),
  missingData: z.array(z.string().max(300)).max(6),
});
export type ConsultationAiBrief = z.infer<typeof consultationAiBriefSchema>;
export interface ConsultationAiBriefWithMetadata {
  brief: ConsultationAiBrief | null;
  provider: string | null;
  model: string | null;
}

const CONSULTATION_BRIEF_SYSTEM_PROMPT = `Voce ajuda a nutricionista a se preparar para uma consulta, usando SOMENTE os FATOS DO SISTEMA fornecidos.
REGRAS ABSOLUTAS:
- Nunca invente ou recalcule um numero (peso, IMC, variacao, data, macro) — use so os que ja vierem prontos nos fatos.
- Nunca apresente uma hipotese como diagnostico. Descreva sinais, nunca conclua doenca.
- Se os fatos forem escassos numa secao, diga isso explicitamente em vez de inventar contexto.
- O rotulo "Paciente: ..." no prompt e so um identificador interno de sistema, nunca um nome a repetir. NUNCA escreva esse identificador (nem qualquer variacao dele) no texto que voce gerar — a nutricionista ja sabe quem e a paciente. Refira-se a ela so como "a paciente"/"o paciente", ou simplesmente omita o sujeito (ex.: "Sem consultas anteriores registradas" em vez de "Paciente X nao tem consultas anteriores").
- Responda APENAS com um objeto JSON no formato exato:
{"clinicalSummary": "string", "changesSinceLastVisit": ["string"], "attentionPoints": ["string"], "pendingItems": ["string"], "suggestedTopics": ["string"], "missingData": ["string"]}
- Cada lista tem no maximo 6 itens curtos e objetivos. Sem texto fora do JSON.`;

/**
 * Gera a interpretacao de IA do briefing. Nunca salva sozinho — quem chama
 * decide se/quando persistir (consultation-sessions.saveConsultationAiBrief).
 * Se a IA falhar ou nao estiver configurada, retorna null — o systemData
 * determinístico continua util sozinho (mesma tolerancia do briefing
 * original de agenda).
 */
export async function generateConsultationAiBrief(
  client: Client,
  systemData: ConsultationSystemData,
  adminId?: string | null
): Promise<ConsultationAiBrief | null> {
  return (await generateConsultationAiBriefWithMetadata(client, systemData, adminId)).brief;
}

export async function generateConsultationAiBriefWithMetadata(
  client: Client,
  systemData: ConsultationSystemData,
  adminId?: string | null
): Promise<ConsultationAiBriefWithMetadata> {
  assertCategoryAllowed("consultation_brief", "identity");
  assertCategoryAllowed("consultation_brief", "evolution");
  assertCategoryAllowed("consultation_brief", "meal_plan");
  assertCategoryAllowed("consultation_brief", "protocol");
  assertCategoryAllowed("consultation_brief", "tasks");

  try {
    const { pseudonym, contextBlock } = sanitizeClinicalContext(client.name, [
      { label: "FATOS_DO_SISTEMA", content: formatSystemDataForPrompt(systemData) },
    ]);
    const result = await generateStructuredResult({
      agent: "consultation-briefing",
      adminId,
      system: CONSULTATION_BRIEF_SYSTEM_PROMPT,
      prompt: `Paciente: ${pseudonym}.\n\n${contextBlock}\n\nGere o briefing estruturado para a consulta de hoje.`,
      schema: consultationAiBriefSchema,
      maxOutputTokens: 900,
    });
    const brief = result.data;
    // Defesa server-side adicional (nunca so a instrucao de prompt) contra o
    // pseudonimo interno vazar para a nutricionista — secao 41 da FASE 2.
    return {
      provider: result.provider,
      model: result.model,
      brief: {
        clinicalSummary: stripInternalPatientAlias(brief.clinicalSummary),
        changesSinceLastVisit: brief.changesSinceLastVisit.map(stripInternalPatientAlias),
        attentionPoints: brief.attentionPoints.map(stripInternalPatientAlias),
        pendingItems: brief.pendingItems.map(stripInternalPatientAlias),
        suggestedTopics: brief.suggestedTopics.map(stripInternalPatientAlias),
        missingData: brief.missingData.map(stripInternalPatientAlias),
      },
    };
  } catch (error) {
    if (error instanceof AiConfigError || error instanceof AiProviderError || error instanceof AiValidationError) {
      return { brief: null, provider: null, model: null };
    }
    throw error;
  }
}
