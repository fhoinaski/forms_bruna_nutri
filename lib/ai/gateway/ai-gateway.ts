import { generateText, type ModelMessage, type StopCondition, type ToolSet } from "ai";
import type { z } from "zod";
import { createConfiguredModel } from "@/lib/ai/model-factory";
import { addAiTiming } from "@/lib/observability/trace";
import { getAISettings, type AISettings } from "@/lib/repositories/ai-settings";
import { writeAuditLog } from "@/lib/security/audit";
import {
  AiConfigError,
  AiProviderError,
  AiValidationError,
  RETRYABLE_FAILURE_CATEGORIES,
  STRUCTURED_FAILURE_CATEGORIES,
  VALIDATION_FEEDBACK_REASONS,
  classifyAiError,
  classifyStructuredFailureReason,
  buildValidationFeedbackPrompt,
  type StructuredFailureReason,
} from "@/lib/ai/core/ai-errors";
import { isTruncatedJsonText, tryParseJsonFromText } from "@/lib/ai/schemas/json-extract";
import { isE2EGatewayTestModeEnabled, takeE2EStructuredFixture } from "@/lib/ai/gateway/e2e-fixtures";

/**
 * Unica porta para chamar o provedor de IA configurado. Nenhum agente deve
 * importar `createConfiguredModel`/`generateText` diretamente — todos
 * passam por aqui, o que centraliza selecao de provider/modelo, timeout
 * (herdado do fetch do provider), tratamento de erro, e logging de uso via
 * o audit log ja existente (reaproveitado — sem tabela nova so para isso).
 */

export interface AiGatewayCallContext {
  /** Nome do agente/modulo chamador, para logging (ex.: "protocol-agent", "system-chat"). */
  agent: string;
  adminId?: string | null;
  /**
   * Chave de escopo pra fixture determinística de E2E (lib/ai/gateway/e2e-fixtures.ts)
   * — normalmente o clientId do teste. Sem efeito nenhum fora de
   * E2E_TEST_MODE=1 (nunca influencia produção). Agentes que não passam
   * isso simplesmente nunca usam fixture, mesmo em E2E — continuam
   * chamando o provider real (ou falhando com AiConfigError sem chave,
   * como sempre).
   */
  e2eFixtureKey?: string;
}

interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
}

async function resolveSettingsAndModel(): Promise<{ settings: AISettings; model: ReturnType<typeof createConfiguredModel> }> {
  const settings = await getAISettings();
  if (!settings.api_key) {
    throw new AiConfigError(
      "API Key de IA nao configurada. Acesse Dashboard > Configuracoes > Inteligencia artificial e salve uma chave valida."
    );
  }
  const model = createConfiguredModel(settings);
  return { settings, model };
}

async function logUsage(
  ctx: AiGatewayCallContext,
  params: { settings: AISettings; durationMs: number; success: boolean; errorMessage?: string; usage?: UsageInfo; extra?: Record<string, unknown> }
): Promise<void> {
  try {
    await writeAuditLog({
      action: "ai_gateway_call",
      adminId: ctx.adminId ?? null,
      entityType: "ai_gateway",
      outcome: params.success ? "success" : "failure",
      metadata: {
        agent: ctx.agent,
        provider: params.settings.provider,
        model: params.settings.model,
        durationMs: params.durationMs,
        inputTokens: params.usage?.inputTokens ?? null,
        outputTokens: params.usage?.outputTokens ?? null,
        errorMessage: params.success ? null : (params.errorMessage ?? null),
        ...(params.extra ?? {}),
      },
    });
  } catch (auditError) {
    // Falha ao logar uso nunca deve derrubar a chamada de IA em si.
    console.error("[ai-gateway] Falha ao gravar log de uso de IA:", auditError);
  }
}

export interface GenerateOptions extends AiGatewayCallContext {
  system: string;
  prompt?: string;
  messages?: ModelMessage[];
  tools?: ToolSet;
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
  maxOutputTokens?: number;
  /** Tempo maximo (ms) para o turno inteiro, incluindo todas as etapas de tool-calling. */
  timeoutMs?: number;
}

export type GenerateResult = Awaited<ReturnType<typeof generateText>>;

/** Chamada de texto livre (com ou sem tools) através do provider configurado. */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const { settings, model } = await resolveSettingsAndModel();
  const startedAt = Date.now();
  try {
    const result = await generateText({
      model,
      system: options.system,
      ...(options.messages ? { messages: options.messages } : { prompt: options.prompt ?? "" }),
      tools: options.tools,
      stopWhen: options.stopWhen,
      maxOutputTokens: options.maxOutputTokens ?? 4096,
      abortSignal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
    });
    addAiTiming(Date.now() - startedAt);
    await logUsage(options, {
      settings,
      durationMs: Date.now() - startedAt,
      success: true,
      usage: { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens },
    });
    return result;
  } catch (cause) {
    const isTimeout = cause instanceof Error && cause.name === "TimeoutError";
    const message = isTimeout
      ? "O assistente demorou demais para responder. Tente novamente com um pedido mais simples ou dividido em partes."
      : cause instanceof Error ? cause.message : "Falha ao chamar o provedor de IA.";
    await logUsage(options, { settings, durationMs: Date.now() - startedAt, success: false, errorMessage: message });
    if (cause instanceof AiConfigError) throw cause;
    throw new AiProviderError(message, cause);
  }
}

export interface GenerateStructuredOptions<T> extends AiGatewayCallContext {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  /** Tempo máximo (ms) para o turno inteiro, compartilhado entre as tentativas. */
  timeoutMs?: number;
  /** Número máximo de tentativas de structured output. */
  maxAttempts?: number;
  /** Normaliza a saída crua ANTES do `safeParse` (usado no caminho textual). */
  normalize?: (raw: unknown) => unknown;
}

/** Resultado normalizado — o chamador não precisa saber o provider/estratégia. */
export interface StructuredGenerationResult<T> {
  data: T;
  provider: string;
  model: string;
  attempts: number;
  repaired: boolean;
}

export const MAX_STRUCTURED_ATTEMPTS = 3;
export const DEFAULT_STRUCTURED_TIMEOUT_MS = 15_000;

const STRUCTURED_RECOVERY_PROMPT =
  "Sua resposta anterior não correspondeu ao formato solicitado. Responda exclusivamente no formato estruturado solicitado, sem reasoning, sem markdown e sem explicações adicionais.";

/**
 * Structured output resiliente e provider-agnostic (camada textual universal):
 * - `generateText` → extrair JSON → normalizar → Zod;
 * - retry com prompt mínimo de recuperação (até `MAX_STRUCTURED_ATTEMPTS`);
 * - classificação de falha e detecção de JSON truncado.
 * Funciona com qualquer schema Zod e qualquer provider do model-factory.
 * Nunca devolve dado não validado.
 */
/** Teto absoluto pro bump de tokens em retry de TRUNCATED_RESPONSE — nunca cresce sem limite (seção 8/41: "não aumentar tokens indefinidamente"). */
const MAX_TRUNCATION_RETRY_TOKENS = 8000;

/** console.debug redigido (nunca audit log persistente) só em desenvolvimento — a saída do MODELO é estrutura JSON sem dado clínico (o schema não carrega prontuário), mas mesmo assim fica fora de produção e truncado. */
function debugLogRawOutput(agent: string, attempt: number, text: string): void {
  if (process.env.NODE_ENV === "production") return;
  const snippet = text.length > 300 ? `${text.slice(0, 300)}…(${text.length} chars)` : text;
  console.debug(`[ai-gateway:structured] agent=${agent} attempt=${attempt} raw(redacted)=${JSON.stringify(snippet)}`);
}

export async function generateStructuredResult<T>(options: GenerateStructuredOptions<T>): Promise<StructuredGenerationResult<T>> {
  // Fronteira do provider determinístico de E2E (FASE 11 do fechamento de
  // gaps V3) — só entra em jogo com E2E_TEST_MODE=1 E uma fixture
  // explicitamente registrada pro (agent, e2eFixtureKey) desta chamada.
  // Valida contra o MESMO schema Zod real do agente (FASE 12: "nada de
  // alterar código de produção pra aceitar fixture simplificada") — nunca
  // pula a validação, só pula a chamada de rede ao provider real.
  if (isE2EGatewayTestModeEnabled() && options.e2eFixtureKey) {
    const fixture = takeE2EStructuredFixture(options.agent, options.e2eFixtureKey);
    if (fixture !== undefined) {
      const parsed = options.schema.safeParse(fixture);
      if (parsed.success) {
        return { data: parsed.data, provider: "e2e-deterministic", model: "e2e-deterministic", attempts: 1, repaired: false };
      }
      throw new AiValidationError("Fixture de E2E não bate com o schema real do agente.", parsed.error.issues);
    }
  }

  const { settings, model } = await resolveSettingsAndModel();
  const startedAt = Date.now();
  const maxAttempts = options.maxAttempts ?? MAX_STRUCTURED_ATTEMPTS;
  const baseMaxOutputTokens = options.maxOutputTokens ?? 1024;
  const abortSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_STRUCTURED_TIMEOUT_MS);

  let repaired = false;
  let truncated = false;
  let lastIssues: unknown;
  let lastFailureCategory: ReturnType<typeof classifyAiError> = "structured_invalid";
  let lastReason: StructuredFailureReason = "UNKNOWN";
  let lastRawData: unknown;
  /** Próximo attempt usa isto como complemento do system prompt — genérico por padrão, mas vira feedback de validação específico (seção 6) quando a falha anterior foi JSON válido com schema errado. */
  let nextSystemAddendum = STRUCTURED_RECOVERY_PROMPT;
  let currentMaxOutputTokens = baseMaxOutputTokens;

  const wrapProviderError = (cause: unknown): AiProviderError => {
    const message = cause instanceof Error && cause.name === "TimeoutError"
      ? "O assistente demorou demais para responder."
      : cause instanceof Error ? cause.message : "Falha ao chamar o provedor de IA.";
    return new AiProviderError(message, cause);
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const system = attempt === 1 ? options.system : `${options.system}\n\n${nextSystemAddendum}`;

    // Texto + JSON + normalização + Zod.
    try {
      const result = await generateText({ model, system, prompt: options.prompt, maxOutputTokens: currentMaxOutputTokens, abortSignal });
      addAiTiming(Date.now() - startedAt);
      const rawText = result.text ?? "";
      debugLogRawOutput(options.agent, attempt, rawText);
      const raw = tryParseJsonFromText(rawText);
      const parseSucceeded = raw !== null;
      const isTruncated = isTruncatedJsonText(rawText);
      const normalized = options.normalize ? options.normalize(raw) : raw;
      const parsed = options.schema.safeParse(normalized);
      if (parsed.success) {
        await logUsage(options, {
          settings,
          durationMs: Date.now() - startedAt,
          success: true,
          usage: { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens },
          extra: { attempts: attempt, repaired, strategy: "text" },
        });
        return { data: parsed.data, provider: settings.provider, model: settings.model, attempts: attempt, repaired };
      }
      const zodIssues = parsed.error.issues;
      lastIssues = zodIssues;
      // Guarda o payload NORMALIZADO (pós-`normalize`, não o raw cru) — quem
      // recebe `rawData` no AiValidationError (recuperação parcial) já
      // aproveita a mesma normalização mecânica (ex.: quantity string→number).
      lastRawData = parseSucceeded ? normalized : lastRawData;
      truncated = truncated || isTruncated;
      repaired = true;
      lastReason = classifyStructuredFailureReason({ rawText, parseSucceeded, zodIssues, truncated: isTruncated });
      lastFailureCategory = lastReason === "TRUNCATED_RESPONSE" ? "structured_truncated" : "structured_invalid";
      await logUsage(options, {
        settings,
        durationMs: Date.now() - startedAt,
        success: false,
        errorMessage: `attempt ${attempt}: ${lastReason}`,
        extra: {
          attempts: attempt,
          structuredFailureReason: lastReason,
          responseLength: rawText.length,
          parseSucceeded,
          validationSucceeded: false,
          truncated: isTruncated,
          zodIssuePaths: zodIssues.slice(0, 8).map((i) => i.path.join(".") || "(raiz)"),
          zodIssueCodes: zodIssues.slice(0, 8).map((i) => i.code),
        },
      });
      // Estratégia de retry diferenciada por causa (seção 7): schema errado
      // com JSON válido ganha feedback específico (path+code) em vez do
      // aviso genérico; truncamento ganha mais orçamento de tokens (uma vez,
      // com teto) em vez de só repetir a mesma chamada que já cortou.
      if (VALIDATION_FEEDBACK_REASONS.has(lastReason) && zodIssues.length) {
        nextSystemAddendum = buildValidationFeedbackPrompt(zodIssues);
      } else {
        nextSystemAddendum = STRUCTURED_RECOVERY_PROMPT;
      }
      if (lastReason === "TRUNCATED_RESPONSE") {
        currentMaxOutputTokens = Math.min(Math.round(currentMaxOutputTokens * 1.5), MAX_TRUNCATION_RETRY_TOKENS);
      }
    } catch (cause) {
      const wrapped = wrapProviderError(cause);
      const category = classifyAiError(wrapped);
      if (!RETRYABLE_FAILURE_CATEGORIES.has(category)) {
        await logUsage(options, { settings, durationMs: Date.now() - startedAt, success: false, errorMessage: wrapped.message, extra: { attempts: attempt, failureCategory: category } });
        throw wrapped;
      }
      lastFailureCategory = category;
      nextSystemAddendum = STRUCTURED_RECOVERY_PROMPT;
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 250 : 750));
    }
  }

  await logUsage(options, {
    settings,
    durationMs: Date.now() - startedAt,
    success: false,
    errorMessage: "Saida estruturada invalida apos todas as tentativas.",
    extra: { attempts: maxAttempts, repaired, failureCategory: lastFailureCategory, structuredFailureReason: lastReason },
  });
  if (STRUCTURED_FAILURE_CATEGORIES.has(lastFailureCategory)) {
    throw new AiValidationError(
      "A IA nao retornou um resultado no formato esperado.",
      lastIssues,
      lastFailureCategory,
      truncated,
      lastReason,
      lastRawData
    );
  }
  throw new AiProviderError("Falha persistente do provedor de IA.", new Error(`failureCategory: ${lastFailureCategory}`));
}

/** Chamada estruturada com validação Zod — retorna apenas os dados validados. */
export async function generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T> {
  return (await generateStructuredResult(options)).data;
}
