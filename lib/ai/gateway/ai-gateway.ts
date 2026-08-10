import { generateText, type ModelMessage, type StopCondition, type ToolSet } from "ai";
import type { z } from "zod";
import { createConfiguredModel } from "@/lib/ai/model-factory";
import { getAISettings, type AISettings } from "@/lib/repositories/ai-settings";
import { writeAuditLog } from "@/lib/security/audit";
import { AiConfigError, AiProviderError, AiValidationError } from "@/lib/ai/core/ai-errors";
import { tryParseJsonFromText } from "@/lib/ai/schemas/json-extract";

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
  params: { settings: AISettings; durationMs: number; success: boolean; errorMessage?: string; usage?: UsageInfo }
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
    });
    await logUsage(options, {
      settings,
      durationMs: Date.now() - startedAt,
      success: true,
      usage: { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens },
    });
    return result;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Falha ao chamar o provedor de IA.";
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
}

/**
 * Chamada de texto com validacao Zod obrigatoria da saida. Faz UMA
 * tentativa de reparo (reenviando os erros de validacao ao modelo) antes de
 * desistir — nunca devolve dado nao validado para o chamador.
 */
export async function generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T> {
  const { settings, model } = await resolveSettingsAndModel();
  const startedAt = Date.now();

  const attempt = async (system: string) =>
    generateText({ model, system, prompt: options.prompt, maxOutputTokens: options.maxOutputTokens ?? 4096 });

  try {
    const first = await attempt(options.system);
    const firstParsed = options.schema.safeParse(tryParseJsonFromText(first.text));
    if (firstParsed.success) {
      await logUsage(options, {
        settings,
        durationMs: Date.now() - startedAt,
        success: true,
        usage: { inputTokens: first.usage?.inputTokens, outputTokens: first.usage?.outputTokens },
      });
      return firstParsed.data;
    }

    const repairSystem = `${options.system}\n\nA resposta anterior nao seguiu exatamente o formato JSON pedido. Erros de validacao: ${JSON.stringify(
      firstParsed.error.issues.slice(0, 5)
    )}\nGere novamente a resposta, respeitando estritamente a estrutura pedida, sem texto fora do JSON.`;
    const second = await attempt(repairSystem);
    const secondParsed = options.schema.safeParse(tryParseJsonFromText(second.text));

    if (secondParsed.success) {
      await logUsage(options, {
        settings,
        durationMs: Date.now() - startedAt,
        success: true,
        usage: { inputTokens: second.usage?.inputTokens, outputTokens: second.usage?.outputTokens },
      });
      return secondParsed.data;
    }

    await logUsage(options, {
      settings,
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: "Saida invalida apos tentativa de reparo.",
    });
    throw new AiValidationError(
      "A IA nao retornou um resultado no formato esperado, mesmo apos nova tentativa.",
      secondParsed.error.issues
    );
  } catch (cause) {
    if (cause instanceof AiValidationError || cause instanceof AiConfigError) throw cause;
    const message = cause instanceof Error ? cause.message : "Falha ao chamar o provedor de IA.";
    await logUsage(options, { settings, durationMs: Date.now() - startedAt, success: false, errorMessage: message });
    throw new AiProviderError(message, cause);
  }
}
