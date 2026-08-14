import { generateText, type ModelMessage, type StopCondition, type ToolSet } from "ai";
import type { z } from "zod";
import { createConfiguredModel } from "@/lib/ai/model-factory";
import { addAiTiming } from "@/lib/observability/trace";
import { getAISettings, type AISettings } from "@/lib/repositories/ai-settings";
import { writeAuditLog } from "@/lib/security/audit";
import { AiConfigError, AiProviderError, AiValidationError, RETRYABLE_FAILURE_CATEGORIES, STRUCTURED_FAILURE_CATEGORIES, classifyAiError } from "@/lib/ai/core/ai-errors";
import { isTruncatedJsonText, tryParseJsonFromText } from "@/lib/ai/schemas/json-extract";

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
export async function generateStructuredResult<T>(options: GenerateStructuredOptions<T>): Promise<StructuredGenerationResult<T>> {
  const { settings, model } = await resolveSettingsAndModel();
  const startedAt = Date.now();
  const maxAttempts = options.maxAttempts ?? MAX_STRUCTURED_ATTEMPTS;
  const maxOutputTokens = options.maxOutputTokens ?? 1024;
  const abortSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_STRUCTURED_TIMEOUT_MS);

  let repaired = false;
  let truncated = false;
  let lastIssues: unknown;
  let lastFailureCategory: ReturnType<typeof classifyAiError> = "structured_invalid";

  const wrapProviderError = (cause: unknown): AiProviderError => {
    const message = cause instanceof Error && cause.name === "TimeoutError"
      ? "O assistente demorou demais para responder."
      : cause instanceof Error ? cause.message : "Falha ao chamar o provedor de IA.";
    return new AiProviderError(message, cause);
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const system = attempt === 1 ? options.system : `${options.system}\n\n${STRUCTURED_RECOVERY_PROMPT}`;

    // Texto + JSON + normalização + Zod.
    try {
      const result = await generateText({ model, system, prompt: options.prompt, maxOutputTokens, abortSignal });
      addAiTiming(Date.now() - startedAt);
      const raw = tryParseJsonFromText(result.text);
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
      lastIssues = parsed.error.issues;
      truncated = truncated || isTruncatedJsonText(result.text);
      repaired = true;
      lastFailureCategory = truncated ? "structured_truncated" : "structured_invalid";
    } catch (cause) {
      const wrapped = wrapProviderError(cause);
      const category = classifyAiError(wrapped);
      if (!RETRYABLE_FAILURE_CATEGORIES.has(category)) {
        await logUsage(options, { settings, durationMs: Date.now() - startedAt, success: false, errorMessage: wrapped.message, extra: { attempts: attempt, failureCategory: category } });
        throw wrapped;
      }
      lastFailureCategory = category;
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 250 : 750));
    }
  }

  await logUsage(options, {
    settings,
    durationMs: Date.now() - startedAt,
    success: false,
    errorMessage: "Saida estruturada invalida apos todas as tentativas.",
    extra: { attempts: maxAttempts, repaired, failureCategory: lastFailureCategory },
  });
  if (STRUCTURED_FAILURE_CATEGORIES.has(lastFailureCategory)) {
    throw new AiValidationError(
      "A IA nao retornou um resultado no formato esperado.",
      lastIssues,
      lastFailureCategory,
      truncated
    );
  }
  throw new AiProviderError("Falha persistente do provedor de IA.", new Error(`failureCategory: ${lastFailureCategory}`));
}

/** Chamada estruturada com validação Zod — retorna apenas os dados validados. */
export async function generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T> {
  return (await generateStructuredResult(options)).data;
}
