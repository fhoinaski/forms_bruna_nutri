import {
  getIntakeField,
  getSintomasOptions,
  isDirectCaptureField,
  INTAKE_SECTION_LABELS,
  type IntakeFieldDefinition,
  type IntakeSectionId,
} from "@/lib/clinical/pre-consultation-fields";
import { deterministicUuidV5 } from "@/lib/utils/deterministic-uuid";
import {
  applyTopicExtraction,
  applyTurnToState,
  cloneState,
  computeMissingRequired,
  computeProgress,
  getAskableFields,
  selectNextField,
} from "@/lib/ai/agents/patient/intake/intake-rules";
import {
  runIntakeTurn,
  runIntakeTopicExtraction,
  INTAKE_MAX_TURNS,
  isDeterministicFailTrigger,
} from "@/lib/ai/agents/patient/intake/intake-agent";
import {
  findCurrentTopic,
  getNextInteraction,
  getTopicStepProgress,
  stepKeyOf,
  type TopicCoverage,
} from "@/lib/ai/agents/patient/intake/intake-flow";
import { getTopicDefinition, findStepForField } from "@/lib/ai/agents/patient/intake/intake-topics";
import {
  createIntakeSession,
  getIntakeSession,
  updateIntakeSession,
  completeIntakeSessionOnce,
  markIntakeSessionFallback,
} from "@/lib/repositories/patient-intake-sessions";
import { getSubmissionById } from "@/lib/repositories/submissions";
import { getAISettings } from "@/lib/repositories/ai-settings";
import { submitPreConsultation } from "@/lib/clinical/submit-pre-consultation";
import { resolvePublicPreConsultationMode, type PreConsultationMode } from "@/lib/clinical/pre-consultation-mode";
import type {
  IntakeInteraction,
  IntakeSessionState,
  IntakeTopicId,
} from "@/lib/ai/agents/patient/intake/intake-types";
import type { PatientIntakeSessionRow } from "@/lib/repositories/patient-intake-sessions";
import { AiConfigError, AiProviderError, AiValidationError, isAiError } from "@/lib/ai/core/ai-errors";
import { logger } from "@/lib/observability/logger";

export interface IntakeAvailability {
  available: boolean;
  mode: PreConsultationMode;
  reason?: string;
}

export async function getIntakeAvailability(): Promise<IntakeAvailability> {
  const resolution = await resolvePublicPreConsultationMode();
  return {
    available: resolution.effectiveMode === "smart",
    mode: resolution.configuredMode,
    reason: resolution.reason ? "IA indisponível." : undefined,
  };
}

export interface StepProgressView {
  key: string;
  label: string;
  status: "completed" | "active" | "pending";
}

export interface IntakeStartResult {
  sessionId: string;
  state: IntakeSessionState;
  interaction: IntakeInteraction | null;
  transitionMessage: string | null;
  steps: StepProgressView[];
}

export async function startIntake(): Promise<IntakeStartResult> {
  const settings = await getAISettings();
  const state = await createIntakeSession({
    provider: settings.provider,
    model: settings.model,
  });
  const next = getNextInteraction(state);
  return {
    sessionId: state.id,
    state,
    interaction: next.interaction,
    transitionMessage: next.transitionMessage ?? null,
    steps: getTopicStepProgress(state),
  };
}

export interface IntakeMessageInput {
  sessionId: string;
  message: string;
  sessionVersion: number;
  /** Tópico + passo enviados pela UI (eco do `getNextInteraction`). */
  topic: IntakeTopicId;
  stepKey: string;
}

export interface IntakeMessageResult {
  state: IntakeSessionState;
  assistantMessage: string;
  interaction: IntakeInteraction | null;
  transitionMessage: string | null;
  steps: StepProgressView[];
  clarification: { field: string; reason: string } | null;
  /** Versão da sessão após a gravação (fonte de verdade p/ proteção otimista). */
  sessionVersion: number;
  reviewReady: boolean;
  completed: boolean;
  fallback?: boolean;
  fallbackReason?: string;
  fallbackCategory?: string;
}

export class IntakeConcurrencyError extends Error {}
export class IntakeNotFoundError extends Error {}
export class IntakeExpiredError extends Error {}
export class IntakeTurnLimitError extends Error {}

/** Marcador enviado pela UI para pular um passo opcional (escape §21). */
const SKIP_SENTINEL = "__SKIP__";

function isExpired(row: PatientIntakeSessionRow): boolean {
  return new Date(row.expires_at).getTime() < Date.now();
}

function assertUsable(row: PatientIntakeSessionRow): void {
  if (row.status === "expired" || isExpired(row)) {
    throw new IntakeExpiredError("Sessão expirada.");
  }
}

/** Verifica se o passo enviado ainda é o passo atual (proteção de echo). */
function isCurrentInteraction(
  state: IntakeSessionState,
  topicId: IntakeTopicId,
  stepKey: string
): boolean {
  const current = state.currentTopic ?? findCurrentTopic(state)?.id;
  if (current !== topicId) return false;
  const next = getNextInteraction(state);
  return next.interaction?.topic === topicId && next.interaction?.stepKey === stepKey;
}

export async function runIntakeMessage(input: IntakeMessageInput): Promise<IntakeMessageResult> {
  const found = await getIntakeSession(input.sessionId);
  if (!found) throw new IntakeNotFoundError("Sessão não encontrada.");

  const { state, row } = found;

  if (row.status === "completed") {
    return {
      state,
      assistantMessage: "Sua pré-consulta já foi enviada. Obrigado!",
      interaction: null,
      transitionMessage: null,
      steps: getTopicStepProgress(state),
      clarification: null,
      sessionVersion: row.version,
      reviewReady: true,
      completed: true,
    };
  }

  assertUsable(row);
  if (row.turn_count >= INTAKE_MAX_TURNS) {
    throw new IntakeTurnLimitError("Limite de interações atingido.");
  }
  if (input.sessionVersion !== row.version) {
    throw new IntakeConcurrencyError("Sessão alterada em paralelo. Tente novamente.");
  }

  const topic = getTopicDefinition(input.topic);
  const step = topic?.steps.find((s) => s.stepKey === input.stepKey);

  // Se o passo não é mais o atual (resposta antiga ou estado divergente),
  // re-sincroniza sem reprocessar: retorna o estado atual.
  if (!topic || !step || !isCurrentInteraction(state, input.topic, input.stepKey)) {
    const next = getNextInteraction(state);
    return {
      state,
      assistantMessage: "Continuando de onde você parou.",
      interaction: next.interaction,
      transitionMessage: next.transitionMessage ?? null,
      steps: getTopicStepProgress(state),
      clarification: state.clarification,
      sessionVersion: row.version,
      reviewReady: next.reviewReady,
      completed: false,
    };
  }

  try {
    // Opção de escape: pular passo opcional (§21).
    if (input.message === SKIP_SENTINEL && step.allowSkip && !step.required) {
      const skipState = cloneState(state);
      const fullKey = stepKeyOf(topic.id, step.stepKey);
      if (!skipState.skippedSteps.includes(fullKey)) skipState.skippedSteps.push(fullKey);
      skipState.completedSteps = skipState.completedSteps.filter((s) => s !== fullKey);
      skipState.currentTopic = topic.id;
      skipState.clarification = null;
      skipState.missingRequiredFields = computeMissingRequired(skipState);
      skipState.progress = computeProgress(skipState);
      skipState.interactionCount = (skipState.interactionCount ?? 0) + 1;
      skipState.updatedAt = new Date().toISOString();

      const nextAfterSkip = getNextInteraction(skipState);
      const nextTopicAfterSkip = findCurrentTopic(skipState);
      if (nextTopicAfterSkip) skipState.currentTopic = nextTopicAfterSkip.id;

      const updatedSkip = await updateIntakeSession(input.sessionId, row.version, skipState, {
        status: skipState.status,
        turnCount: row.turn_count + 1,
      });
      if (!updatedSkip) throw new IntakeConcurrencyError("Sessão alterada em paralelo.");

      return {
        state: skipState,
        assistantMessage: "Sem problema, seguimos.",
        interaction: nextAfterSkip.interaction,
        transitionMessage: nextAfterSkip.transitionMessage ?? null,
        steps: getTopicStepProgress(skipState),
        clarification: null,
        sessionVersion: updatedSkip.version,
        reviewReady: nextAfterSkip.reviewReady,
        completed: false,
      };
    }

    // Gatilho determinístico de E2E para exercitar o fallback real.
    if (isDeterministicFailTrigger(input.message)) {
      throw new AiProviderError("Deterministic provider error for E2E fallback test.");
    }

    let nextState: IntakeSessionState;
    let provider = "system";
    let model = "system";
    let ackText = "Anotado.";

    if (step.promptFields && step.promptFields.length > 0) {
      // Passo de pergunta aberta → extração multi-campo (1 chamada LLM).
      const extraction = await runIntakeTopicExtraction({
        state,
        topic,
        allowedFields: step.promptFields,
        userMessage: input.message,
      });
      provider = extraction.provider;
      model = extraction.model;
      ackText = extraction.extraction.assistantText || "Anotado.";

      const applied = applyTopicExtraction(state, topic.id, step.stepKey, extraction.extraction, step.promptFields);
      nextState = applied.state;
    } else if (step.field) {
      // Passo objetivo → captura determinística (zero LLM).
      const field = getIntakeField(step.field);
      if (!field) throw new Error("Campo inválido.");

      const agentOutput = isDirectCaptureField(field)
        ? buildDirectTurn(field, input.message)
        : await runIntakeTurn({
            state,
            fieldKey: field.key,
            userMessage: input.message,
            editField: state.editField ?? null,
          });

      if (!agentOutput.turn.field) {
        agentOutput.turn.field = field.key;
      }
      const applied = applyTurnToState(state, agentOutput.turn);
      if (!applied.applied) {
        // Re-sync com clarificação genérica.
        const next = cloneState(state);
        next.clarification = { field: field.key, reason: "Não consegui processar essa resposta." };
        return {
          state: next,
          assistantMessage: agentOutput.assistantMessage || "Vamos tentar de novo?",
          interaction: getNextInteraction(next).interaction,
          transitionMessage: null,
          steps: getTopicStepProgress(next),
          clarification: next.clarification,
          sessionVersion: row.version,
          reviewReady: false,
          completed: false,
        };
      }
      nextState = applied.state;
      provider = agentOutput.provider;
      model = agentOutput.model;
      ackText = agentOutput.assistantMessage || field.label;
    } else {
      throw new Error("Passo sem campo e sem promptFields.");
    }

    // Marca o passo objetivo como concluído.
    if (step.field) {
      const fullKey = stepKeyOf(topic.id, step.stepKey);
      if (!nextState.completedSteps.includes(fullKey)) nextState.completedSteps.push(fullKey);
      nextState.skippedSteps = nextState.skippedSteps.filter((s) => s !== fullKey);
    }

    // Avança o ponteiro de tópico atual.
    nextState.currentTopic = nextState.currentTopic ?? topic.id;
    nextState.currentField = null;
    nextState.currentSection = null;
    nextState.missingRequiredFields = computeMissingRequired(nextState);
    nextState.progress = computeProgress(nextState);
    nextState.interactionCount = (nextState.interactionCount ?? 0) + 1;
    nextState.updatedAt = new Date().toISOString();

    const next = getNextInteraction(nextState);
    const finished = next.reviewReady && nextState.missingRequiredFields.length === 0;

    const nextTopic = findCurrentTopic(nextState);
    if (nextTopic) {
      nextState.currentTopic = nextTopic.id;
    }

    const updatedRow = await updateIntakeSession(input.sessionId, row.version, nextState, {
      status: nextState.status,
      provider,
      model,
      turnCount: row.turn_count + 1,
    });
    if (!updatedRow) throw new IntakeConcurrencyError("Sessão alterada em paralelo.");

    return {
      state: nextState,
      assistantMessage: ackText,
      interaction: next.interaction,
      transitionMessage: next.transitionMessage ?? null,
      steps: getTopicStepProgress(nextState),
      clarification: nextState.clarification,
      sessionVersion: updatedRow.version,
      reviewReady: next.reviewReady,
      completed: finished,
    };
  } catch (error) {
    if (
      error instanceof IntakeConcurrencyError ||
      error instanceof IntakeTurnLimitError ||
      error instanceof IntakeExpiredError
    ) {
      throw error;
    }

    // Somente falhas genuínas do subsistema de IA degradam graciosamente para
    // o formulário tradicional. Um erro de programação (TypeError etc.) NÃO é
    // falha de provedor: sobe como 500 para não mascarar bug como fallback.
    if (!isAiError(error)) {
      logger.error("intake_message_unexpected_error", { sessionId: input.sessionId, error });
      throw error;
    }

    logger.warn("intake_message_ai_fallback", {
      sessionId: input.sessionId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    const fallbackState = cloneState(state);
    await markIntakeSessionFallback(input.sessionId, row.version).catch(() => null);
    return {
      state: fallbackState,
      assistantMessage: "Vamos continuar por aqui.",
      interaction: null,
      transitionMessage: null,
      steps: getTopicStepProgress(fallbackState),
      clarification: null,
      sessionVersion: row.version,
      reviewReady: false,
      completed: false,
      fallback: true,
      fallbackReason: error instanceof Error ? error.message : "Falha inesperada.",
      fallbackCategory:
        error instanceof AiConfigError
          ? "config_error"
          : error instanceof AiValidationError
            ? "validation_error"
            : "provider_error",
    };
  }
}

/** Resumo editorial (curto) + detalhes completos colapsáveis (§34/§35/§36). */
export interface IntakeReviewSummaryGroup {
  key: string;
  title: string;
  lines: { label: string; value: string; fieldKey?: string; topicId?: IntakeTopicId; stepKey?: string }[];
}

export interface IntakeReviewResult {
  summary: IntakeReviewSummaryGroup[];
  /** Detalhes completos por seção (para "ver todos os dados"). */
  details: {
    id: IntakeSectionId;
    label: string;
    fields: { key: string; label: string; value: string; topicId?: IntakeTopicId; stepKey?: string }[];
  }[];
  state: IntakeSessionState;
}

const EDITORIAL_TOPIC_GROUPS: { title: string; keys: string[] }[] = [
  { title: "Objetivo", keys: ["objetivo", "motivacao", "incomodo"] },
  { title: "Saúde", keys: ["diagnostico", "medicacao", "sintomas", "gestational_details", "bariatric_details", "gestante"] },
  { title: "Rotina", keys: ["rotina", "fomeDia", "atividadeFisica", "sonoHoras"] },
  { title: "Alimentação", keys: ["diaAlimentar", "naoGosta", "favoritos", "intestinoFreq", "suplementos"] },
];

const EDITORIAL_LABELS: Record<string, string> = {
  objetivo: "objetivo",
  motivacao: "motivo",
  incomodo: "principal incômodo",
  diagnostico: "condição relatada",
  medicacao: "medicamento",
  sintomas: "sintomas",
  gestational_details: "gestação",
  bariatric_details: "bariátrica",
  gestante: "amamentação/gestação",
  rotina: "rotina",
  fomeDia: "fome",
  atividadeFisica: "atividade física",
  sonoHoras: "sono",
  diaAlimentar: "dia alimentar",
  naoGosta: "não tolera",
  favoritos: "preferidos",
  intestinoFreq: "intestino",
  suplementos: "suplementos",
};

function humanValue(key: string, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (key === "privacyAccepted") return "Aceita";
  return String(raw);
}

export function buildReview(state: IntakeSessionState): IntakeReviewResult {
  const summary: IntakeReviewSummaryGroup[] = [];

  for (const group of EDITORIAL_TOPIC_GROUPS) {
    const lines: IntakeReviewSummaryGroup["lines"] = [];
    for (const key of group.keys) {
      const value = humanValue(key, state.answers[key]);
      if (value) {
        const target = findStepForField(key);
        lines.push({ label: EDITORIAL_LABELS[key] ?? key, value, fieldKey: key, topicId: target?.topicId, stepKey: target?.stepKey });
      }
    }
    if (lines.length > 0) summary.push({ key: group.title, title: group.title, lines });
  }

  const details: IntakeReviewResult["details"] = [];
  for (const field of getAskableFields(state.answers)) {
    const value = humanValue(field.key, state.answers[field.key]);
    if (!value) continue;
    let section = details.find((item) => item.id === field.section);
    if (!section) {
      section = { id: field.section, label: INTAKE_SECTION_LABELS[field.section], fields: [] };
      details.push(section);
    }
    const target = findStepForField(field.key);
    section.fields.push({ key: field.key, label: field.label, value, topicId: target?.topicId, stepKey: target?.stepKey });
  }

  return { summary, details, state };
}

/** Configura a sessão para corrigir um campo anterior (allow-listed). */
export async function editIntakeField(
  sessionId: string,
  sessionVersion: number,
  topicId: IntakeTopicId,
  stepKey: string
): Promise<IntakeSessionState> {
  const topic = getTopicDefinition(topicId);
  const step = topic?.steps.find((s) => s.stepKey === stepKey);
  if (!topic || !step) throw new IntakeNotFoundError("Campo não encontrado.");

  const found = await getIntakeSession(sessionId);
  if (!found) throw new IntakeNotFoundError("Sessão não encontrada.");
  const { state, row } = found;
  if (row.status === "completed") return state;
  assertUsable(row);
  if (row.version !== sessionVersion) throw new IntakeConcurrencyError("Sessão alterada em paralelo.");

  const next = cloneState(state);
  const fullKey = stepKeyOf(topicId, stepKey);
  next.completedSteps = next.completedSteps.filter((s) => s !== fullKey);
  next.skippedSteps = next.skippedSteps.filter((s) => s !== fullKey);
  next.currentTopic = topicId;
  next.currentField = step.field ?? null;
  next.clarification = null;
  // Preserva valores: reabrir pré-preenchido, nunca apaga a resposta.
  for (const fieldKey of [...(step.promptFields ?? []), ...(step.field ? [step.field] : [])]) {
    next.completedFields = next.completedFields.filter((k) => k !== fieldKey);
  }
  next.progress = computeProgress(next);
  next.missingRequiredFields = computeMissingRequired(next);
  next.updatedAt = new Date().toISOString();

  const updatedRow = await updateIntakeSession(sessionId, row.version, next, {});
  if (!updatedRow) throw new IntakeConcurrencyError("Sessão alterada em paralelo.");
  return next;
}

export class IntakeCompletionConflictError extends Error {}

export async function completeIntake(sessionId: string, sessionVersion: number): Promise<{ submissionId: string }> {
  const found = await getIntakeSession(sessionId);
  if (!found) throw new IntakeNotFoundError("Sessão não encontrada.");
  const { state, row } = found;

  assertUsable(row);

  if (row.completed_submission_id) {
    const existing = await getSubmissionById(row.completed_submission_id);
    if (!existing) throw new IntakeCompletionConflictError("Submissão referenciada não existe.");
    return { submissionId: row.completed_submission_id };
  }

  const answersForSubmit: Record<string, unknown> = { ...state.answers };

  const privacyAccepted = state.answers.privacyAccepted === true
    ? true
    : Boolean(state.answers.privacyAccepted);

  const payload = {
    ...answersForSubmit,
    privacyAccepted,
    companyWebsite: "",
  };

  const submissionId = deterministicUuidV5(`${sessionId}:${JSON.stringify(sortObject(payload))}`);

  await submitPreConsultation(payload, {
    ipHash: "",
    userAgentHash: "",
    source: "ai_guided",
    submissionId,
  });

  const { already } = await completeIntakeSessionOnce(sessionId, row.version, submissionId);
  if (already) return { submissionId };

  const refreshed = await getIntakeSession(sessionId);
  if (refreshed?.row.completed_submission_id === submissionId) {
    return { submissionId };
  }
  throw new IntakeCompletionConflictError("Conflito de submissão concorrente.");
}

function buildDirectTurn(
  field: IntakeFieldDefinition,
  raw: string
): { assistantMessage: string; provider: string; model: string; turn: import("@/lib/ai/agents/patient/intake/intake-types").IntakeTurnResult } {
  return {
    assistantMessage: field.conversationalPrompt,
    provider: "system",
    model: "system",
    turn: {
      assistantMessage: field.conversationalPrompt,
      field: field.key,
      outcome: "answered",
      normalizedValue: raw,
      confidence: "high",
    },
  };
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortObject(v)]));
  }
  return value;
}

export {
  selectNextField,
  computeProgress,
  computeMissingRequired,
  getIntakeField,
  getSintomasOptions,
};