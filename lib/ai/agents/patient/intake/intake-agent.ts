import { generateStructured } from "@/lib/ai/gateway/ai-gateway";
import type { AISettings } from "@/lib/repositories/ai-settings";
import {
  getIntakeField,
  getSintomasOptions,
} from "@/lib/clinical/pre-consultation-fields";
import { IntakeTurnSchema, type IntakeTurnParsed } from "@/lib/ai/agents/patient/intake/intake-schema";
import {
  INTAKE_SYSTEM_PROMPT,
  INTAKE_PROMPT_VERSION,
  buildIntakePrompt,
  buildMinimalRelevantAnswers,
} from "@/lib/ai/agents/patient/intake/intake-prompts";
import type { IntakeSessionState, IntakeTurnResult } from "@/lib/ai/agents/patient/intake/intake-types";

/**
 * Agente dedicado PATIENT_INTAKE_ASSISTANT.
 *
 * ZERO tools: a IA não alcça CRM, prontuário, nem qualquer outro recurso.
 * Ela apenas interpreta UM turno (campo autorizado + resposta do paciente) e
 * devolve `IntakeTurnSchema` em JSON estruturado. TODO o restante da decisão
 * (validação, contradição, progresso, próximo campo) é do servidor
 * (intake-rules.ts) — nunca da IA.
 */

export const PATIENT_INTAKE_ASSISTANT = "PATIENT_INTAKE_ASSISTANT";

export const INTAKE_MAX_TURNS = 60;
export const INTAKE_TURN_TIMEOUT_MS = 15_000;
export const INTAKE_MAX_OUTPUT_TOKENS = 1024;

/** Bloqueia gravação silenciosa de campo sensível com confiança baixa/média. */
function shouldClarifySensitive(turn: IntakeTurnParsed, fieldKey: string): boolean {
  const field = getIntakeField(fieldKey);
  if (!field?.sensitive) return false;
  if (turn.outcome !== "answered") return false;
  return turn.confidence !== "high";
}

/**
 * Ajusta o turno já validado: campo sensível com confiança < high vira
 * pedido de esclarecimento; campo sintomas permite qualquer opção do allow-
 * list (o servidor re-valida). Não há parsing de texto livre aqui.
 */
function interpretTurn(turn: IntakeTurnParsed): IntakeTurnResult {
  if (shouldClarifySensitive(turn, turn.field)) {
    return {
      assistantMessage: turn.assistantMessage,
      field: turn.field,
      outcome: "needs_clarification",
      normalizedValue: undefined,
      confidence: turn.confidence,
      clarificationQuestion: "Só para confirmar: poderia repetir essa informação?",
    };
  }

  return {
    assistantMessage: turn.assistantMessage,
    field: turn.field,
    outcome: turn.outcome,
    normalizedValue: turn.normalizedValue,
    confidence: turn.confidence,
    clarificationQuestion: turn.clarificationQuestion,
    requestedEditField: turn.requestedEditField,
  };
}

export interface IntakeAgentRunInput {
  state: IntakeSessionState;
  fieldKey: string;
  userMessage: string | null;
  editField?: string | null;
}

export interface IntakeAgentRunOutput {
  turn: IntakeTurnResult;
  assistantMessage: string;
  provider: string;
  model: string;
  promptVersion: string;
}

/**
 * Executor substituível do turno. Em produção usa o gateway real via
 * `generateStructured`. Em E2E (`INTAKE_AI_TEST_PROVIDER=deterministic` +
 * `E2E_TEST_MODE=1`) um executor determinístico responde por campo sem
 * depender de provedor externo — não há backdoor fora do ambiente de teste.
 */
type IntakeTurnExecutor = (input: IntakeAgentRunInput) => Promise<{ turn: IntakeTurnResult; provider: string; model: string }>;

async function realExecutor(input: IntakeAgentRunInput): Promise<{ turn: IntakeTurnResult; provider: string; model: string }> {
  const field = getIntakeField(input.fieldKey)!;
  const options = field.key === "sintomas"
    ? getSintomasOptions(input.state.answers)
    : (field.options ?? []);

  const prompt = buildIntakePrompt({
    fieldKey: field.key,
    fieldLabel: field.label,
    conversationalPrompt: field.conversationalPrompt,
    fieldType: field.type,
    options,
    required: field.required,
    sensitive: field.sensitive === true,
    unit: field.unit ?? null,
    editField: input.editField ?? null,
    lastUserMessage: input.userMessage,
    relevantAnswers: buildMinimalRelevantAnswers(input.state, input.fieldKey),
  });

  const parsed = await generateStructured<IntakeTurnParsed>({
    agent: "patient-intake",
    system: INTAKE_SYSTEM_PROMPT,
    prompt,
    schema: IntakeTurnSchema,
    maxOutputTokens: INTAKE_MAX_OUTPUT_TOKENS,
  });

  // O modelo nunca pode mudar a chave persistível: se devolver um campo
  // diferente do que o servidor selecionou, rejeitamos de forma determinística.
  if (parsed.field !== input.fieldKey) {
    return {
      turn: {
        assistantMessage: parsed.assistantMessage,
        field: input.fieldKey,
        outcome: "invalid",
        normalizedValue: undefined,
        confidence: "low",
        clarificationQuestion: "Por favor, responda sobre o que foi perguntado.",
      },
      provider: "system",
      model: "system",
    };
  }

  const turn = interpretTurn(parsed);
  const settings = await getSettingsSnapshot();
  return { turn, provider: settings.provider, model: settings.model };
}

export async function runIntakeTurn(input: IntakeAgentRunInput): Promise<IntakeAgentRunOutput> {
  const field = getIntakeField(input.fieldKey);
  if (!field) {
    throw new Error(`Campo de intake inválido: ${input.fieldKey}`);
  }

  const executor = resolveExecutor();
  const { turn, provider, model } = await executor(input);

  return {
    turn,
    assistantMessage: turn.assistantMessage,
    provider,
    model,
    promptVersion: INTAKE_PROMPT_VERSION,
  };
}

/** Seleciona o executor (real ou teste determinístico) sem expor backdoor. */
function resolveExecutor(): IntakeTurnExecutor {
  const deterministic = process.env.INTAKE_AI_TEST_PROVIDER === "deterministic";
  return deterministic && isE2EDeterministicEnabled()
    ? deterministicExecutor
    : realExecutor;
}

/** O executor determinístico só existe no ambiente de teste E2E. */
function isE2EDeterministicEnabled(): boolean {
  return process.env.E2E_TEST_MODE === "1";
}

/** Indica se o provedor determinístico de teste está ativo (para logs E2E). */
export function isDeterministicTestProvider(): boolean {
  return process.env.INTAKE_AI_TEST_PROVIDER === "deterministic" && isE2EDeterministicEnabled();
}

/**
 * Executor determinístico para E2E. Responde ao campo autorizado com um
 * valor previsível. Jamais chama ferramentas, jamais acessa outros pacientes,
 * e só devolve a chave que o servidor mandou — mesmo quando o usuário envia
 * prompt injection.
 */
function deterministicValueForField(
  field: NonNullable<ReturnType<typeof getIntakeField>>,
  input: IntakeAgentRunInput
): string {
  const fixed: Record<string, string> = {
    tipoAtendimento: "Emagrecimento",
    nome: "Paciente Teste",
    idade: "33",
    whatsapp: "(11) 99999-0000",
    email: "paciente-e2e@test.local",
    objetivo: "Rotina mais leve",
    estresse: "Baixo",
    descansada: "Sim",
    intestinoFreq: "Todo dia",
    desconforto: "Não",
    anticoncepcional: "Não",
    gestante: "Não",
    semComer: "Não",
    comerEmocao: "Fome",
    disposicao: "7",
    privacyAccepted: "true",
  };
  if (fixed[field.key] !== undefined) return fixed[field.key];

  if (field.type === "number") return "10";
  if (field.type === "date") return "1990-01-01";
  if (field.type === "boolean") return "true";
  if (field.type === "single_choice" || field.type === "multiple_choice") {
    const options = field.key === "sintomas" ? getSintomasOptions(input.state.answers) : (field.options ?? []);
    return options[0]?.value ?? "";
  }
  // Curto o suficiente para caber nos `max()` mais restritivos do schema
  // (ex.: idade tem max(10)); evita rejeição de validação no complete.
  return "ok";
}

/**
 * Gatilho PER-REQUEST para o E2E de fallback: quando o provedor
 * determinístico está ativo (apenas sob E2E_TEST_MODE=1), enviar este texto
 * como resposta faz o executor lançar um provider error, exercitando o
 * fallback pela UI real. Não há efeito fora do executor de teste.
 */
const DETERMINISTIC_FAIL_TRIGGER = "__TEST_INTAKE_FAIL__";

async function deterministicExecutor(input: IntakeAgentRunInput): Promise<{ turn: IntakeTurnResult; provider: string; model: string }> {
  if (input.userMessage === DETERMINISTIC_FAIL_TRIGGER) {
    throw new Error("Deterministic provider error for E2E fallback test.");
  }

  const field = getIntakeField(input.fieldKey)!;
  const value = deterministicValueForField(field, input);

  return {
    turn: {
      assistantMessage: `${field.conversationalPrompt} (resposta de teste determinística)`,
      field: input.fieldKey,
      outcome: "answered",
      normalizedValue: value,
      confidence: "high",
    },
    provider: "deterministic-test",
    model: "deterministic-test",
  };
}

// Evita import circular: o agente só precisa do snapshot pós-chamada.
async function getSettingsSnapshot(): Promise<Pick<AISettings, "provider" | "model">> {
  const { getAISettings } = await import("@/lib/repositories/ai-settings");
  const settings = await getAISettings();
  return { provider: settings.provider, model: settings.model };
}