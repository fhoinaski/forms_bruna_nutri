import {
  isPediatricProfile,
  PRECONSULTATION_FIELDS,
  PRECONSULTATION_FIELD_KEYS,
  getIntakeField,
  getIntakeFieldOrder,
  getSintomasOptions,
  type IntakeFieldDefinition,
} from "@/lib/clinical/pre-consultation-fields";
import type { IntakeSessionState, IntakeTopicExtractionResult, IntakeTopicId, IntakeTurnResult } from "@/lib/ai/agents/patient/intake/intake-types";
import { stepKeyOf } from "@/lib/ai/agents/patient/intake/intake-flow";

/**
 * Motor determinístico do intake. O SERVIDOR decide tudo o que o LLM não
 * pode decidir: quais campos são perguntáveis, se uma resposta é válida,
 * conversões de unidade, contradições, progresso e campos faltantes.
 *
 * A IA (intake-agent.ts) apenas interpreta UM turno; este módulo aplica a
 * interpretação de volta ao estado, re-validando tudo contra o schema.
 */

const SET_CONSTANTS = new Set(PRECONSULTATION_FIELD_KEYS);

function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return value === true;
  return true;
}

/** Campos visíveis considerando o `visibleWhen` determinístico. */
export function isFieldVisible(field: IntakeFieldDefinition, answers: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true;
  try {
    return field.visibleWhen(answers);
  } catch {
    return true;
  }
}

export function getAskableFields(answers: Record<string, unknown>): IntakeFieldDefinition[] {
  return PRECONSULTATION_FIELDS.filter((field) => isFieldVisible(field, answers));
}

/** Próximo campo ainda não concluído, na ordem canônica. */
export function selectNextField(state: IntakeSessionState): IntakeFieldDefinition | null {
  if (state.editField) {
    const editField = getIntakeField(state.editField);
    if (editField && isFieldVisible(editField, state.answers)) return editField;
  }

  for (const field of PRECONSULTATION_FIELDS) {
    if (!isFieldVisible(field, state.answers)) continue;
    if (state.completedFields.includes(field.key)) continue;
    if (isAnswered(state.answers[field.key])) continue;
    return field;
  }
  return null;
}

export function computeMissingRequired(state: IntakeSessionState): string[] {
  const missing = getAskableFields(state.answers)
    .filter((field) => field.required && !isAnswered(state.answers[field.key]))
    .map((field) => field.key);

  // Espelha o superRefine de LegacyFormSchema: perfil pediátrico exige
  // child_name/child_age, mesmo sendo opcionais na definição "estática".
  if (isPediatricProfile(state.answers.tipoAtendimento as string | undefined)) {
    if (!isAnswered(state.answers.child_name)) missing.push("child_name");
    if (!isAnswered(state.answers.child_age)) missing.push("child_age");
  }

  return missing;
}

export function computeProgress(state: IntakeSessionState): number {
  const visible = getAskableFields(state.answers);
  if (visible.length === 0) return 0;
  const answered = visible.filter((field) => isAnswered(state.answers[field.key])).length;
  return Math.min(100, Math.round((answered / visible.length) * 100));
}

/**
 * Converte um texto numérico livre em string canônica. Aceita tanto vírgula
 * quanto ponto como separador decimal (ex.: "72,5" e "72.5" → "72.5").
 * Regra determinística: se houver vírgula, ela é o separador decimal (com
 * pontos tratados como milhar); caso contrário, um único ponto é decimal.
 */
function normalizeNumberText(raw: unknown): string | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? String(raw) : null;
  if (typeof raw !== "string") return null;

  const cleaned = raw.trim().replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;

  let canonical: string;
  if (cleaned.includes(",")) {
    canonical = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    const dots = cleaned.match(/\./g)?.length ?? 0;
    canonical = dots > 1 ? cleaned.replace(/\./g, "") : cleaned;
  }

  const parsed = Number(canonical);
  if (!Number.isFinite(parsed)) return null;
  return String(parsed);
}

/**
 * Conversão determinística de altura em cm: se o paciente responde "1.75"
 * (metros) para um campo em cm, converte para 175. Nunca delegada ao LLM.
 */
function convertHeightCm(raw: unknown): string | null {
  const normalized = normalizeNumberText(raw);
  if (normalized === null) return null;
  const value = Number(normalized);
  if (value > 0 && value < 3.5) return String(Math.round(value * 100));
  return String(Math.round(value));
}

interface ValidationResult {
  valid: boolean;
  value: string | null;
  reason?: string;
}

function validateSingleChoice(raw: unknown, options: IntakeFieldDefinition["options"]): ValidationResult {
  const list = options ?? [];
  if (typeof raw !== "string") return { valid: false, value: null, reason: "Resposta inválida." };
  if (!list.some((option) => option.value === raw)) {
    return { valid: false, value: null, reason: "Opção inválida." };
  }
  return { valid: true, value: raw };
}

function validateMultipleChoice(raw: unknown, options: IntakeFieldDefinition["options"]): ValidationResult {
  // O formulário tradicional guarda sintomas como "A, B, C". Aceitamos
  // string separada por vírgula OU array de strings, filtrando por allow-list.
  const list = options ?? [];
  const allowed = new Set(list.map((option) => option.value));
  const tokens: string[] = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string")
    : typeof raw === "string"
      ? raw.split(",").map((item) => item.trim())
      : [];
  const selected = tokens.filter((token) => allowed.has(token));
  if (selected.length === 0) return { valid: false, value: null, reason: "Nenhuma opção válida." };
  return { valid: true, value: selected.join(", ") };
}

function validateBoolean(raw: unknown): ValidationResult {
  // Armazena "true" como string, coerente com o answers_json do fluxo
  // tradicional (exceto privacyAccepted, tratado à parte no payload final).
  const normalized = typeof raw === "boolean" ? raw : raw === "true" || raw === "Sim";
  if (!normalized) return { valid: false, value: null, reason: "Resposta inválida." };
  return { valid: true, value: "true" };
}

/** Re-valida o `normalizedValue` do LLM contra a definição canônica do campo. */
export function validateFieldValue(
  field: IntakeFieldDefinition,
  raw: unknown,
  answers: Record<string, unknown>
): ValidationResult {
  switch (field.type) {
    case "single_choice": {
      if (field.key === "sintomas") return validateMultipleChoice(raw, getSintomasOptions(answers));
      return validateSingleChoice(raw, field.options);
    }
    case "multiple_choice":
      if (field.key === "sintomas") return validateMultipleChoice(raw, getSintomasOptions(answers));
      return validateMultipleChoice(raw, field.options);
    case "boolean":
      return validateBoolean(raw);
    case "number": {
      if (field.key === "child_height_cm") {
        const converted = convertHeightCm(raw);
        return converted === null ? { valid: false, value: null, reason: "Valor numérico inválido." } : { valid: true, value: converted };
      }
      const normalized = normalizeNumberText(raw);
      return normalized === null ? { valid: false, value: null, reason: "Valor numérico inválido." } : { valid: true, value: normalized };
    }
    case "text":
    case "textarea":
    case "date":
    default: {
      if (typeof raw !== "string") return { valid: false, value: null, reason: "Resposta deve ser texto." };
      const trimmed = raw.trim();
      if (!trimmed && field.required) return { valid: false, value: null, reason: "Campo obrigatório." };
      if (trimmed.length > 5000) return { valid: false, value: null, reason: "Resposta muito longa." };

      if (field.key === "email") {
        const emailPattern = /^\S+@\S+\.\S+$/;
        if (trimmed && !emailPattern.test(trimmed)) return { valid: false, value: null, reason: "E-mail inválido." };
      }
      if (field.key === "whatsapp" && trimmed && trimmed.replace(/\D/g, "").length < 8) {
        return { valid: false, value: null, reason: "WhatsApp inválido. Informe com DDD." };
      }

      // Campos sensíveis: a barreira de confiança é aplicada no
      // intake-agent (não grava silenciosamente quando confiança é
      // baixa/média); aqui apenas validamos formato e comprimento.
      return { valid: true, value: trimmed };
    }
  }
}

/** Detecção determinística de contradição simples em diagnóstico/medicação. */
export function detectContradiction(
  fieldKey: string,
  incoming: string | null,
  existing: Record<string, unknown>
): string | null {
  if (fieldKey !== "medicacao" && fieldKey !== "diagnostico") return null;
  const previous = typeof existing[fieldKey] === "string" ? existing[fieldKey].trim() : "";
  if (!previous || !incoming) return null;

  const negations = ["não", "nao", "nenhum", "nenhuma", "não uso", "nao uso", "não tomo", "nao tomo", "sem"];
  const hasNegation = (value: string) => negations.some((word) => value.toLowerCase().includes(word));

  const previousNegative = hasNegation(previous);
  const incomingNegative = hasNegation(incoming);

  // Um dos dois é afirmativo e o outro é negativo → contradição.
  if (previousNegative !== incomingNegative) return incoming;
  return null;
}

/**
 * Aplica um turno já interpretado pela IA de volta ao estado, garantindo que
 * a IA jamais dita uma chave arbitrária. Retorna o novo estado (novo objeto,
 * sem mutação) ou `{ state, applied: true/false, reason }`.
 */
export interface ApplyTurnOutput {
  state: IntakeSessionState;
  applied: boolean;
  invalidReason?: string;
  clarification?: { field: string; reason: string };
  editField?: string | null;
}

export function applyTurnToState(
  state: IntakeSessionState,
  turn: IntakeTurnResult
): ApplyTurnOutput {
  const next = cloneState(state);

  // A IA NUNCA escolhe uma chave fora do allow-list.
  const resolvedFieldKey = turn.field ?? state.currentField;
  if (!resolvedFieldKey || !SET_CONSTANTS.has(resolvedFieldKey)) {
    return { state, applied: false, invalidReason: "Campo inválido." };
  }
  const field = getIntakeField(resolvedFieldKey)!;

  if (turn.outcome === "request_edit") {
    const editKey = turn.requestedEditField ?? resolvedFieldKey;
    if (!SET_CONSTANTS.has(editKey)) {
      return { state, applied: false, invalidReason: "Campo inválido para edição." };
    }
    const editField = getIntakeField(editKey)!;
    if (!isFieldVisible(editField, state.answers)) {
      return { state, applied: false, invalidReason: "Campo não se aplica ao perfil atual." };
    }
    next.editField = editKey;
    next.currentField = editKey;
    next.currentSection = editField.section;
    next.completedFields = next.completedFields.filter((key) => key !== editKey);
    delete next.answers[editKey];
    next.clarification = null;
    next.progress = computeProgress(next);
    return { state: next, applied: true, editField: editKey };
  }

  if (turn.outcome === "needs_clarification") {
    next.clarification = {
      field: resolvedFieldKey,
      reason: turn.clarificationQuestion || "Me conte um pouco melhor, por favor.",
    };
    next.currentField = resolvedFieldKey;
    next.currentSection = field.section;
    next.updatedAt = new Date().toISOString();
    return { state: next, applied: true, clarification: next.clarification };
  }

  if (turn.outcome === "invalid") {
    next.clarification = { field: resolvedFieldKey, reason: "Não consegui entender essa resposta. Poderia reformular?" };
    next.currentField = resolvedFieldKey;
    next.currentSection = field.section;
    next.updatedAt = new Date().toISOString();
    return { state: next, applied: true, clarification: next.clarification };
  }

  if (turn.outcome === "skipped") {
    // Campo opcional pode ser pulado; obrigatório permanece pendente.
    if (field.required) {
      next.clarification = { field: resolvedFieldKey, reason: "Essa informação é importante para continuarmos." };
      return { state: next, applied: true, clarification: next.clarification };
    }
    if (!next.completedFields.includes(field.key)) next.completedFields.push(field.key);
    next.editField = null;
    next.clarification = null;
    next.currentField = null;
    next.currentSection = null;
    next.progress = computeProgress(next);
    next.updatedAt = new Date().toISOString();
    return { state: next, applied: true };
  }

  // outcome === "answered"
  const validation = validateFieldValue(field, turn.normalizedValue, state.answers);

  if (!validation.valid) {
    next.clarification = { field: resolvedFieldKey, reason: validation.reason ?? "Resposta inválida." };
    next.currentField = resolvedFieldKey;
    next.currentSection = field.section;
    next.updatedAt = new Date().toISOString();
    return { state: next, applied: true, clarification: next.clarification };
  }

  const contradiction = detectContradiction(field.key, validation.value, state.answers);
  if (contradiction !== null && field.key === "medicacao") {
    next.clarification = {
      field: field.key,
      reason: "Você informou anteriormente que não utiliza medicamentos, mas agora mencionou um. Qual informação devemos considerar?",
    };
    return { state: next, applied: true, clarification: next.clarification };
  }

  if (field.key === "privacyAccepted") {
    // privacyAccepted é boolean true quando aceito.
    next.answers["privacyAccepted"] = validation.value === "true";
  } else {
    next.answers[field.key] = validation.value;
  }

  if (field.key === "tipoAtendimento") {
    // Ao trocar o tipo de atendimento, recalcula a visibilidade de TODOS os
    // campos que dependem de branch e remove dos dados coletados aqueles que
    // deixaram de se aplicar (§12 do produto). Cobre pediátrico, gestação,
    // bariátrica e quaisquer outros `visibleWhen` de forma uniforme.
    purgeHiddenBranchFields(next);
  }

  if (!next.completedFields.includes(field.key)) next.completedFields.push(field.key);
  next.editField = null;
  next.clarification = null;
  next.currentField = null;
  next.currentSection = null;
  next.progress = computeProgress(next);
  next.missingRequiredFields = computeMissingRequired(next);
  next.updatedAt = new Date().toISOString();
  return { state: next, applied: true };
}

export function cloneState(state: IntakeSessionState): IntakeSessionState {
  return {
    ...state,
    answers: { ...state.answers },
    completedFields: [...state.completedFields],
    completedSteps: [...(state.completedSteps ?? [])],
    skippedSteps: [...(state.skippedSteps ?? [])],
    missingRequiredFields: [...state.missingRequiredFields],
    clarification: state.clarification ? { ...state.clarification } : null,
  };
}

/** Cria o estado inicial vazio de uma sessão. */
export function createInitialState(id: string): IntakeSessionState {
  const now = new Date().toISOString();
  return {
    id,
    status: "active",
    currentSection: null,
    currentField: null,
    currentTopic: null,
    answers: {},
    completedFields: [],
    completedSteps: [],
    skippedSteps: [],
    missingRequiredFields: [],
    clarification: null,
    editField: null,
    interactionCount: 0,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** Ordena um array de chaves conforme a ordem canônica — p/ revisão/enfileiramento determinístico. */
export function orderFieldKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => getIntakeFieldOrder(a) - getIntakeFieldOrder(b));
}

/**
 * Remove respostas/status de qualquer campo que não é mais aplicável ao
 * perfil atual. Usado quando o tipo de atendimento muda e branches são
 * ativados/desativados — evita enviar silenciosamente dados de branch não
 * aplicável (§12).
 */
export function purgeHiddenBranchFields(state: Pick<IntakeSessionState, "answers" | "completedFields">): void {
  const hiddenKeys = PRECONSULTATION_FIELDS
    .filter((field) => field.visibleWhen && !isFieldVisible(field, state.answers))
    .map((field) => field.key);

  if (hiddenKeys.length === 0) return;

  for (const key of hiddenKeys) {
    delete state.answers[key];
  }
  state.completedFields = state.completedFields.filter((key) => !hiddenKeys.includes(key));
}

/**
 * Saída da aplicação de uma extração multi-campo de um tópico (§8/§9/§10).
 * Cada valor é validado individualmente; um campo inválido não derruba os
 * demais. Campos fora da allow-list são descartados. Sensíveis com confiança
 * < high nunca são gravados.
 */
export interface ApplyTopicExtractionOutput {
  state: IntakeSessionState;
  applied: boolean;
  /** Campos efetivamente gravados neste turno. */
  appliedFields: string[];
  clarification?: { field: string; reason: string };
}

export function applyTopicExtraction(
  state: IntakeSessionState,
  topicId: IntakeTopicId,
  stepKey: string,
  extraction: IntakeTopicExtractionResult,
  allowedFields: string[]
): ApplyTopicExtractionOutput {
  const next = cloneState(state);
  const allowed = new Set(allowedFields);
  const appliedFields: string[] = [];
  const pendingClarifications: { field: string; reason: string }[] = [];

  for (const answer of extraction.extractedAnswers) {
    // 1. Allow-list + chave canônica válida.
    if (!allowed.has(answer.field) || !SET_CONSTANTS.has(answer.field)) continue;
    const field = getIntakeField(answer.field);
    if (!field) continue;

    // 2. Campo sensível exige confiança alta (nunca grava silenciosamente).
    if (field.sensitive && answer.confidence !== "high") {
      pendingClarifications.push({
        field: field.key,
        reason: extraction.clarification?.question ?? "Só para confirmar: poderia repetir essa informação?",
      });
      continue;
    }

    // 3. Validação individual contra o schema real do campo.
    const validation = validateFieldValue(field, answer.value, next.answers);
    if (!validation.valid) continue;

    // 4. Contradição — não resolve automaticamente.
    const contradiction = detectContradiction(field.key, validation.value, next.answers);
    if (contradiction !== null) {
      pendingClarifications.push({
        field: field.key,
        reason:
          field.key === "medicacao"
            ? "Você informou anteriormente uma informação diferente sobre medicamentos. Qual informação devemos considerar?"
            : "Você informou anteriormente uma informação diferente. Qual devemos considerar?",
      });
      continue;
    }

    if (field.key === "privacyAccepted") {
      next.answers.privacyAccepted = validation.value === "true";
    } else {
      next.answers[field.key] = validation.value;
    }
    if (!next.completedFields.includes(field.key)) next.completedFields.push(field.key);
    appliedFields.push(field.key);
  }

  const stepFullKey = stepKeyOf(topicId, stepKey);
  // Marca o passo como concluído quando ao menos um campo foi extraído.
  if (appliedFields.length > 0) {
    if (!next.completedSteps.includes(stepFullKey)) next.completedSteps.push(stepFullKey);
    next.skippedSteps = next.skippedSteps.filter((s) => s !== stepFullKey);
  }

  next.missingRequiredFields = computeMissingRequired(next);
  next.progress = computeProgress(next);
  next.interactionCount = (next.interactionCount ?? 0) + 1;
  next.updatedAt = new Date().toISOString();

  if (pendingClarifications.length > 0) {
    next.clarification = pendingClarifications[0];
    return { state: next, applied: true, appliedFields, clarification: next.clarification };
  }

  return { state: next, applied: true, appliedFields };
}
