import type { ProposedAction } from "@/lib/ai/schemas/action.schema";
import { getToolRisk } from "@/lib/ai/tools/registry";
import { evaluateAutonomy } from "@/lib/ai/policies/autonomy-policy";
import { PROPOSE_NUTRITION_RECORD_TOOL_NAME } from "@/lib/ai/agents/clinical/prontuario-agent";
import { PROPOSE_PRE_ANALYSIS_TOOL_NAME } from "@/lib/ai/pre-analysis-assistant";
import { PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME } from "@/lib/ai/client-protocol-assistant";
import {
  PROPOSE_NEW_CLIENT_TOOL_NAME,
  type ProposeNewClientInput,
  type ProposeNewClientOutput,
} from "@/lib/ai/agents/clients/client-creation-agent";
import { PROPOSE_NEW_RECIPE_TOOL_NAME, type ProposeNewRecipeOutput } from "@/lib/ai/agents/nutrition/recipe-creation-agent";
import { PROPOSE_NEW_PROTOCOL_TOOL_NAME, type ProposeNewClientProtocolInput } from "@/lib/ai/agents/clinical/protocol-creation-agent";
import { PROPOSE_NEW_BLOG_POST_TOOL_NAME, type ProposeNewBlogPostInput } from "@/lib/ai/agents/content/blog-creation-agent";
import { PROPOSE_NEW_APPOINTMENT_TOOL_NAME, type ProposeNewAppointmentInput } from "@/lib/ai/agents/appointments/appointment-agent";
import { PROPOSE_NEW_TASK_TOOL_NAME, type ProposeNewClientTaskInput } from "@/lib/ai/agents/appointments/task-agent";
import { PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME, type ProposeMealPlanChangeOutput } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import { REQUEST_APPOINTMENT_TOOL_NAME, type RequestAppointmentInput } from "@/lib/ai/agents/patient/patient-scheduling-agent";
import { REQUEST_PROFESSIONAL_REVIEW_TOOL_NAME, type RequestProfessionalReviewOutput } from "@/lib/ai/agents/patient/patient-request-agent";
import {
  PROPOSE_CONSULTATION_TASKS_BATCH_TOOL_NAME,
  PROPOSE_CONSULTATION_SUMMARY_TOOL_NAME,
  type ProposeConsultationTasksBatchInput,
  type ProposeConsultationSummaryInput,
} from "@/lib/ai/agents/clinical/consultation-agent";
import {
  PROPOSE_RESCHEDULE_APPOINTMENT_TOOL_NAME,
  PROPOSE_CANCEL_APPOINTMENT_TOOL_NAME,
  type ProposeRescheduleAppointmentOutput,
  type ProposeCancelAppointmentOutput,
} from "@/lib/ai/agents/appointments/appointment-write-agent";
import {
  PROPOSE_RESOLVE_PATIENT_REQUEST_TOOL_NAME,
  type ProposeResolvePatientRequestOutput,
} from "@/lib/ai/agents/clients/patient-request-write-agent";
import {
  PROPOSE_MARK_PAYMENT_RECEIVED_TOOL_NAME,
  type ProposeMarkPaymentReceivedOutput,
} from "@/lib/ai/agents/finance/finance-write-agent";
import {
  PROPOSE_UPDATE_SAFE_SUBSTITUTIONS_SETTING_TOOL_NAME,
  type ProposeUpdateSafeSubstitutionsSettingOutput,
} from "@/lib/ai/agents/system/configuration-agent";
import {
  PROPOSE_CLINICAL_MARKER_UPSERT_TOOL_NAME,
  PROPOSE_RESOLVE_CLINICAL_MARKER_TOOL_NAME,
  type ProposeClinicalMarkerUpsertInput,
  type ProposeResolveClinicalMarkerInput,
} from "@/lib/ai/agents/clinical/clinical-markers-agent";
import {
  PROPOSE_CONSULTATION_NOTE_TOOL_NAME,
  type ProposeConsultationNoteInput,
} from "@/lib/ai/agents/clinical/consultation-agent";
import {
  PROPOSE_ACTIVATE_MEAL_PLAN_TOOL_NAME,
  type ProposeActivateMealPlanOutput,
} from "@/lib/ai/agents/nutrition/meal-plan-change-agent";

/**
 * Substitui a cadeia de 9 `if`s quase identicos que existia em
 * app/api/admin/ai/chat/route.ts para transformar o resultado de uma tool
 * de "proposta" no `ProposedAction` que vai para o frontend. Cada builder
 * decide o shape especifico do kind; risco e necessidade de confirmacao sao
 * sempre calculados aqui, centralmente (lib/ai/policies), nunca pelo builder.
 */
export interface ProposalBuilderContext {
  clientId?: string;
  submissionId?: string;
  /** So presente quando a proposta esta sendo montada dentro do Modo Consulta (secao 7 do pedido). */
  consultationSessionId?: string;
}

type ProposedActionWithoutEnvelope = Omit<ProposedAction, "risk" | "requiresConfirmation">;

type ProposalBuilder = (
  input: Record<string, unknown>,
  ctx: ProposalBuilderContext,
  toolOutput: unknown
) => ProposedActionWithoutEnvelope | null;

function filterFilledTextFields(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => typeof value === "string" && value.trim())
  ) as Record<string, string>;
}

const BUILDERS: Record<string, ProposalBuilder> = {
  [PROPOSE_NUTRITION_RECORD_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const fields = filterFilledTextFields(input);
    if (!Object.keys(fields).length) return null;
    return { kind: "nutrition_record", clientId: ctx.clientId, fields };
  },

  [PROPOSE_PRE_ANALYSIS_TOOL_NAME]: (input, ctx) => {
    if (!ctx.submissionId) return null;
    const fields = filterFilledTextFields(input);
    if (!Object.keys(fields).length) return null;
    return { kind: "pre_analysis", submissionId: ctx.submissionId, fields };
  },

  [PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const typed = input as { clientProtocolId: string; professionalNotes: string };
    if (!typed.professionalNotes?.trim()) return null;
    return {
      kind: "client_protocol",
      clientId: ctx.clientId,
      clientProtocolId: typed.clientProtocolId,
      professionalNotes: typed.professionalNotes,
    };
  },

  [PROPOSE_NEW_CLIENT_TOOL_NAME]: (input, _ctx, toolOutput) => {
    const output = toolOutput as ProposeNewClientOutput | undefined;
    const typed = output?.proposal ?? input as ProposeNewClientInput;
    const fields = filterFilledTextFields(typed as unknown as Record<string, unknown>);
    if (!fields.name) return null;
    return { kind: "new_client", fields };
  },

  [PROPOSE_NEW_RECIPE_TOOL_NAME]: (_input, _ctx, toolOutput) => {
    const output = toolOutput as ProposeNewRecipeOutput | undefined;
    if (!output || "error" in output) return null;
    return {
      kind: "new_recipe",
      title: output.title,
      meal_group: output.meal_group,
      servings: output.servings,
      preparation_steps: output.preparation_steps,
      ingredients: output.ingredients,
    };
  },

  [PROPOSE_NEW_PROTOCOL_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const typed = input as ProposeNewClientProtocolInput;
    const fields = filterFilledTextFields(typed as unknown as Record<string, unknown>);
    if (!fields.title) return null;
    return { kind: "new_protocol", clientId: ctx.clientId, fields };
  },

  [PROPOSE_NEW_BLOG_POST_TOOL_NAME]: (input) => {
    const typed = input as ProposeNewBlogPostInput;
    if (!typed.title || !typed.excerpt || !typed.content_markdown) return null;
    return {
      kind: "new_blog_post",
      fields: {
        title: typed.title,
        excerpt: typed.excerpt,
        content_markdown: typed.content_markdown,
        category: typed.category ?? "",
        tags: (typed.tags ?? []).join(", "),
        seo_title: typed.seo_title ?? "",
        seo_description: typed.seo_description ?? "",
        content_domain: typed.content_domain ?? "",
        // Nunca inventadas pelo builder — so repassa o que a tool devolveu (ver proposeNewBlogPostInputSchema).
        references_json: JSON.stringify(typed.references ?? []),
      },
    };
  },

  [PROPOSE_NEW_APPOINTMENT_TOOL_NAME]: (input, ctx) => {
    const typed = input as ProposeNewAppointmentInput;
    const resolvedClientId = ctx.clientId ?? typed.client_id?.trim();
    if (!resolvedClientId) return null;
    if (!typed.title || !typed.starts_at_display) return null;
    return {
      kind: "new_appointment",
      clientId: resolvedClientId,
      fields: {
        title: typed.title,
        appointment_type: typed.appointment_type,
        starts_at_display: typed.starts_at_display,
        location: typed.location ?? "",
        notes: typed.notes ?? "",
      },
    };
  },

  [PROPOSE_NEW_TASK_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const typed = input as ProposeNewClientTaskInput;
    if (!typed.title) return null;
    return {
      kind: "new_task",
      clientId: ctx.clientId,
      fields: {
        title: typed.title,
        description: typed.description ?? "",
        due_date_display: typed.due_date_display ?? "",
      },
    };
  },

  [PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME]: (_input, ctx, toolOutput) => {
    const output = toolOutput as ProposeMealPlanChangeOutput | undefined;
    if (!output || "error" in output) return null;
    // Checagem defensiva: o plano resolvido pela tool precisa realmente
    // pertencer ao cliente que esta aberto no contexto atual — nunca confiar
    // so no que o modelo passou. A checagem definitiva (que nao pode ser
    // pulada) acontece de novo no handler de confirmacao.
    if (!ctx.clientId || ctx.clientId !== output.clientId) return null;
    return {
      kind: "meal_plan_change",
      clientId: output.clientId,
      mealPlanId: output.mealPlanId,
      baseVersion: output.baseVersion,
      changes: output.changes,
      preview: output.preview,
    };
  },

  // Unico builder do dominio PATIENT_ASSISTANT — nunca chamado pelo
  // orquestrador admin, ja que "requestAppointment" nunca e oferecida a ele
  // (nao esta no tool set do admin). ctx.clientId aqui vem sempre da sessao
  // do portal (patient-orchestrator.ts), nunca do input do modelo.
  [REQUEST_APPOINTMENT_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const typed = input as RequestAppointmentInput;
    if (!typed.startsAtIso) return null;
    return { kind: "patient_appointment_request", clientId: ctx.clientId, startsAtIso: typed.startsAtIso };
  },

  [REQUEST_PROFESSIONAL_REVIEW_TOOL_NAME]: (_input, ctx, toolOutput) => {
    const output = toolOutput as RequestProfessionalReviewOutput | undefined;
    if (!output || "error" in output) return null;
    // Mesma defesa das demais kinds do paciente: o clientId resolvido pela
    // tool precisa bater com o clientId do contexto atual da sessao.
    if (!ctx.clientId || ctx.clientId !== output.clientId) return null;
    return {
      kind: "patient_change_request",
      clientId: output.clientId,
      requestType: output.requestType,
      patientText: output.patientText,
      aiSummary: output.aiSummary,
      mealPlanId: output.mealPlanId,
      mealId: output.mealId,
      itemId: output.itemId,
      appointmentId: output.appointmentId,
      clientTaskId: output.clientTaskId,
      desiredFood: output.desiredFood,
      preview: output.preview,
    };
  },

  [PROPOSE_CONSULTATION_TASKS_BATCH_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const typed = input as ProposeConsultationTasksBatchInput;
    if (!typed.tasks?.length) return null;
    return {
      kind: "consultation_tasks_batch",
      clientId: ctx.clientId,
      consultationSessionId: ctx.consultationSessionId ?? null,
      tasks: typed.tasks.map((task) => ({
        title: task.title,
        description: task.description ?? null,
        dueInDays: task.dueInDays ?? null,
      })),
    };
  },

  [PROPOSE_CONSULTATION_SUMMARY_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId || !ctx.consultationSessionId) return null;
    const typed = input as ProposeConsultationSummaryInput;
    if (!typed.content?.summary?.trim()) return null;
    return {
      kind: "consultation_summary",
      clientId: ctx.clientId,
      consultationSessionId: ctx.consultationSessionId,
      content: typed.content,
    };
  },

  // ── FASE 3 (safe writes operacionais) ──────────────────────────────────

  [PROPOSE_RESCHEDULE_APPOINTMENT_TOOL_NAME]: (_input, _ctx, toolOutput) => {
    const output = toolOutput as ProposeRescheduleAppointmentOutput | undefined;
    if (!output || "error" in output || !output.clientId) return null;
    return {
      kind: "reschedule_appointment",
      appointmentId: output.appointmentId,
      clientId: output.clientId,
      previousStartsAtIso: output.previousStartsAtIso,
      newStartsAtDisplay: output.newStartsAtDisplay,
    };
  },

  [PROPOSE_CANCEL_APPOINTMENT_TOOL_NAME]: (_input, _ctx, toolOutput) => {
    const output = toolOutput as ProposeCancelAppointmentOutput | undefined;
    if (!output || "error" in output) return null;
    return {
      kind: "cancel_appointment",
      appointmentId: output.appointmentId,
      clientId: output.clientId,
      previousStatus: output.previousStatus,
      cancellationReason: output.cancellationReason,
    };
  },

  [PROPOSE_RESOLVE_PATIENT_REQUEST_TOOL_NAME]: (_input, _ctx, toolOutput) => {
    const output = toolOutput as ProposeResolvePatientRequestOutput | undefined;
    if (!output || "error" in output) return null;
    return {
      kind: "resolve_patient_request",
      requestId: output.requestId,
      clientId: output.clientId,
      previousStatus: output.previousStatus,
      newStatus: output.newStatus,
      adminNotes: output.adminNotes,
    };
  },

  [PROPOSE_MARK_PAYMENT_RECEIVED_TOOL_NAME]: (_input, _ctx, toolOutput) => {
    const output = toolOutput as ProposeMarkPaymentReceivedOutput | undefined;
    if (!output || "error" in output) return null;
    return {
      kind: "mark_payment_received",
      paymentId: output.paymentId,
      clientId: output.clientId,
      previousStatus: output.previousStatus,
      paidAtDisplay: output.paidAtDisplay,
      notes: output.notes,
    };
  },

  // ── FASE 5 (document/configuration/admin) ──────────────────────────────

  [PROPOSE_UPDATE_SAFE_SUBSTITUTIONS_SETTING_TOOL_NAME]: (_input, _ctx, toolOutput) => {
    const output = toolOutput as ProposeUpdateSafeSubstitutionsSettingOutput | undefined;
    if (!output || "error" in output) return null;
    return {
      kind: "update_safe_substitutions_setting",
      previousEnabled: output.previousEnabled,
      newEnabled: output.newEnabled,
    };
  },

  // ── FASE 6 (writes clínicos controlados) ────────────────────────────────

  [PROPOSE_CLINICAL_MARKER_UPSERT_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const typed = input as ProposeClinicalMarkerUpsertInput;
    return {
      kind: "clinical_marker_upsert",
      clientId: ctx.clientId,
      markerType: typed.markerType,
      code: typed.code,
      severity: typed.severity ?? "unknown",
      status: typed.status ?? "ACTIVE",
      evidenceText: typed.evidenceText ?? null,
    };
  },

  [PROPOSE_RESOLVE_CLINICAL_MARKER_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const typed = input as ProposeResolveClinicalMarkerInput;
    return { kind: "resolve_clinical_marker", clientId: ctx.clientId, markerType: typed.markerType, code: typed.code };
  },

  [PROPOSE_CONSULTATION_NOTE_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId || !ctx.consultationSessionId) return null;
    const typed = input as ProposeConsultationNoteInput;
    if (!typed.observationText?.trim()) return null;
    return {
      kind: "consultation_note",
      clientId: ctx.clientId,
      consultationSessionId: ctx.consultationSessionId,
      observationText: typed.observationText,
    };
  },

  [PROPOSE_ACTIVATE_MEAL_PLAN_TOOL_NAME]: (_input, ctx, toolOutput) => {
    const output = toolOutput as ProposeActivateMealPlanOutput | undefined;
    if (!output || "error" in output) return null;
    if (!ctx.clientId || ctx.clientId !== output.clientId) return null;
    return {
      kind: "activate_meal_plan",
      clientId: output.clientId,
      mealPlanId: output.mealPlanId,
      baseVersion: output.baseVersion,
      mealPlanTitle: output.mealPlanTitle,
    };
  },
};

/**
 * Constroi o ProposedAction final (com risco e necessidade de confirmacao
 * ja resolvidos pela politica central) a partir do resultado de uma tool
 * call, ou `null` se a tool nao gerar uma proposta valida (dado insuficiente,
 * tool nao reconhecida como "proposta", etc.).
 */
export function buildProposedAction(
  toolName: string,
  input: unknown,
  ctx: ProposalBuilderContext,
  toolOutput?: unknown
): ProposedAction | null {
  const builder = BUILDERS[toolName];
  if (!builder) return null;
  const partial = builder((input ?? {}) as Record<string, unknown>, ctx, toolOutput);
  if (!partial) return null;
  const risk = getToolRisk(toolName);
  if (!risk) return null;
  const autonomy = evaluateAutonomy(risk);
  return { ...partial, risk: autonomy.risk, requiresConfirmation: autonomy.requiresConfirmation } as ProposedAction;
}

export const PROPOSAL_TOOL_NAMES = Object.keys(BUILDERS);
