import { getIntakeField, getSintomasOptions, INTAKE_SECTION_LABELS, type IntakeSectionId } from "@/lib/clinical/pre-consultation-fields";
import { deterministicUuidV5 } from "@/lib/utils/deterministic-uuid";
import {
  applyTurnToState,
  cloneState,
  computeMissingRequired,
  computeProgress,
  getAskableFields,
  selectNextField,
} from "@/lib/ai/agents/patient/intake/intake-rules";
import {
  runIntakeTurn,
  INTAKE_MAX_TURNS,
  isDeterministicTestProvider,
} from "@/lib/ai/agents/patient/intake/intake-agent";
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
import type { IntakeSessionState } from "@/lib/ai/agents/patient/intake/intake-types";
import type { PatientIntakeSessionRow } from "@/lib/repositories/patient-intake-sessions";

export interface IntakeAvailability {
  available: boolean;
  mode: "optional" | "default";
  reason?: string;
}

export async function getIntakeAvailability(): Promise<IntakeAvailability> {
  // Provedor determinístico de E2E dispensa API key real (sem ativar o chat
  // administrativo geral — que exige chave de IA de verdade).
  if (isDeterministicTestProvider()) {
    return { available: true, mode: "optional" };
  }

  const settings = await getAISettings();
  const enabled = settings.patient_intake_ai_enabled === 1;
  const hasProvider = Boolean(settings.provider);
  const hasApiKey = Boolean(settings.api_key);
  return {
    available: enabled && hasProvider && hasApiKey,
    mode: settings.patient_intake_mode,
    reason: !enabled
      ? "Desativado nas configurações."
      : !hasProvider
        ? "Provedor não configurado."
        : !hasApiKey
          ? "API Key não configurada."
          : undefined,
  };
}

export interface IntakeStartResult {
  sessionId: string;
  state: IntakeSessionState;
  nextField: ReturnType<typeof selectNextField>;
}

export async function startIntake(): Promise<IntakeStartResult> {
  const settings = await getAISettings();
  const state = await createIntakeSession({
    provider: settings.provider,
    model: settings.model,
  });
  return {
    sessionId: state.id,
    state,
    nextField: selectNextField(state),
  };
}

export interface IntakeMessageInput {
  sessionId: string;
  message: string;
  sessionVersion: number;
}

export interface IntakeMessageResult {
  state: IntakeSessionState;
  assistantMessage: string;
  nextField: ReturnType<typeof selectNextField>;
  /** Versão da sessão após a gravação (fonte de verdade p/ proteção otimista). */
  sessionVersion: number;
  completed: boolean;
  fallback?: boolean;
  fallbackReason?: string;
  fallbackCategory?: string;
}

export class IntakeConcurrencyError extends Error {}
export class IntakeNotFoundError extends Error {}
export class IntakeExpiredError extends Error {}
export class IntakeTurnLimitError extends Error {}

function isExpired(row: PatientIntakeSessionRow): boolean {
  return new Date(row.expires_at).getTime() < Date.now();
}

/**
 * Guarda única de validade de sessão usada por message/edit/complete.
 * Uma sessão expirada nunca pode ser reativada alterando-se o request.
 */
function assertUsable(row: PatientIntakeSessionRow): void {
  if (row.status === "expired" || isExpired(row)) {
    throw new IntakeExpiredError("Sessão expirada.");
  }
}

function getActiveField(state: IntakeSessionState) {
  if (state.currentField) return getIntakeField(state.currentField) ?? null;
  return selectNextField(state);
}

export async function runIntakeMessage(input: IntakeMessageInput): Promise<IntakeMessageResult> {
  const found = await getIntakeSession(input.sessionId);
  if (!found) throw new IntakeNotFoundError("Sessão não encontrada.");

  const { state, row } = found;

  if (row.status === "completed") {
    return {
      state,
      assistantMessage: "Sua pré-consulta já foi enviada. Obrigado!",
      nextField: null,
      sessionVersion: row.version,
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

  const field = getActiveField(state);
  if (!field) {
    const reviewState: IntakeSessionState = {
      ...cloneState(state),
      status: "review",
      missingRequiredFields: computeMissingRequired(state),
      progress: computeProgress(state),
      updatedAt: new Date().toISOString(),
    };
    const updatedRow = await updateIntakeSession(input.sessionId, row.version, reviewState, {
      status: "review",
      turnCount: row.turn_count + 1,
    });
    if (!updatedRow) throw new IntakeConcurrencyError("Sessão alterada em paralelo.");
    return {
      state: reviewState,
      assistantMessage: "Concluímos a coleta! Vamos revisar suas informações.",
      nextField: null,
      sessionVersion: updatedRow.version,
      completed: false,
    };
  }

  try {
    const agentOutput = await runIntakeTurn({
      state,
      fieldKey: field.key,
      userMessage: input.message,
      editField: state.editField ?? null,
    });

    const applied = applyTurnToState(state, {
      assistantMessage: agentOutput.assistantMessage,
      field: field.key,
      outcome: agentOutput.turn.outcome,
      normalizedValue: agentOutput.turn.normalizedValue,
      confidence: agentOutput.turn.confidence,
      clarificationQuestion: agentOutput.turn.clarificationQuestion,
      requestedEditField: agentOutput.turn.requestedEditField,
    });

    if (!applied.applied) {
      const next = cloneState(state);
      next.clarification = { field: field.key, reason: "Não consegui processar essa resposta." };
      const updatedRow = await updateIntakeSession(input.sessionId, row.version, next, {
        turnCount: row.turn_count + 1,
      });
      if (!updatedRow) throw new IntakeConcurrencyError("Sessão alterada em paralelo.");
      return {
        state: next,
        assistantMessage: agentOutput.assistantMessage || applied.invalidReason || "Tente novamente.",
        nextField: getActiveField(next),
        sessionVersion: updatedRow.version,
        completed: false,
      };
    }

    const nextState = applied.state;
    const nextField = selectNextField(nextState);

    const finished = nextState.missingRequiredFields.length === 0 && nextField === null;
    const updatedRow = await updateIntakeSession(input.sessionId, row.version, nextState, {
      status: nextState.status,
      provider: agentOutput.provider,
      model: agentOutput.model,
      turnCount: row.turn_count + 1,
    });
    if (!updatedRow) throw new IntakeConcurrencyError("Sessão alterada em paralelo.");

    return {
      state: nextState,
      assistantMessage: agentOutput.assistantMessage,
      nextField,
      sessionVersion: updatedRow.version,
      completed: finished,
    };
  } catch (error) {
    // Erros de DOMÍNIO (concorrência, limite de turnos, sessão) NÃO são
    // falha de provedor — não devem virar fallback silencioso.
    if (
      error instanceof IntakeConcurrencyError ||
      error instanceof IntakeTurnLimitError ||
      error instanceof IntakeExpiredError
    ) {
      throw error;
    }

    // Erro de IA/config → fallback: preserva respostas atuais.
    const fallbackState = cloneState(state);
    await markIntakeSessionFallback(input.sessionId, row.version).catch(() => null);
    return {
      state: fallbackState,
      assistantMessage:
        "Continuaremos pelo formulário convencional. As respostas já informadas foram preservadas.",
      nextField: null,
      sessionVersion: row.version,
      completed: false,
      fallback: true,
      fallbackReason: error instanceof Error ? error.message : "Falha inesperada.",
      fallbackCategory: "provider_error",
    };
  }
}

export interface IntakeReviewResult {
  sections: {
    id: IntakeSectionId;
    label: string;
    fields: { key: string; label: string; value: string }[];
  }[];
  state: IntakeSessionState;
}

export function buildReview(state: IntakeSessionState): IntakeReviewResult {
  const sections: IntakeReviewResult["sections"] = [];

  for (const field of getAskableFields(state.answers)) {
    const raw = state.answers[field.key];
    if (raw === undefined || raw === null || raw === "") continue;
    const isBool = field.key === "privacyAccepted";
    const value = isBool ? "Aceita" : String(raw);

    let section = sections.find((item) => item.id === field.section);
    if (!section) {
      section = { id: field.section, label: INTAKE_SECTION_LABELS[field.section], fields: [] };
      sections.push(section);
    }
    section.fields.push({ key: field.key, label: field.label, value });
  }
  return { sections, state };
}

/** Configura a sessão para corrigir um campo anterior (allow-listed). */
export async function editIntakeField(
  sessionId: string,
  sessionVersion: number,
  fieldKey: string
): Promise<IntakeSessionState> {
  const field = getIntakeField(fieldKey);
  if (!field) throw new IntakeNotFoundError("Campo não encontrado.");

  const found = await getIntakeSession(sessionId);
  if (!found) throw new IntakeNotFoundError("Sessão não encontrada.");
  const { state, row } = found;
  if (row.status === "completed") return state;
  assertUsable(row);
  if (row.version !== sessionVersion) throw new IntakeConcurrencyError("Sessão alterada em paralelo.");

  const next = cloneState(state);
  next.editField = fieldKey;
  next.currentField = fieldKey;
  next.currentSection = field.section;
  next.completedFields = next.completedFields.filter((key) => key !== fieldKey);
  delete next.answers[fieldKey];
  next.clarification = null;
  next.progress = computeProgress(next);
  next.missingRequiredFields = computeMissingRequired(next);
  next.updatedAt = new Date().toISOString();

  const updatedRow = await updateIntakeSession(sessionId, row.version, next, {});
  if (!updatedRow) throw new IntakeConcurrencyError("Sessão alterada em paralelo.");
  return next;
}

/** Conflito de idempotência: já existe submissão com DADOS DIFERENTES. */
export class IntakeCompletionConflictError extends Error {}

export async function completeIntake(sessionId: string, sessionVersion: number): Promise<{ submissionId: string }> {
  const found = await getIntakeSession(sessionId);
  if (!found) throw new IntakeNotFoundError("Sessão não encontrada.");
  const { state, row } = found;

  assertUsable(row);

  // Já concluído na mesma sessão → confirma o vínculo revalidando a
  // existência da submissão referenciada (nunca um id órfão em silêncio).
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

  // ID determinístico derivado de (sessão + payload canônico): payload
  // diferente gera id diferente, então conflito de dados distintos NUNCA é
  // tratado silenciosamente como sucesso — é detectado abaixo.
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

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortObject(v)]));
  }
  return value;
}

export { selectNextField, computeProgress, computeMissingRequired, getIntakeField, getSintomasOptions };