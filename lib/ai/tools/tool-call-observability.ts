import { logger } from "@/lib/observability/logger";

/**
 * Observabilidade de chamadas de tool (FASE 2A, item 9 do pedido de
 * sanitizacao) — registra metadata SEGURA de cada execucao (tool, dominio,
 * sucesso, duracao, ids de entidade quando reconhecidos) e nunca o
 * conteudo do input/output da tool. Isso evita duas coisas ao mesmo tempo:
 * (1) vazar patientText/diagnostico/prontuario/financeiro completo em log,
 * (2) precisar de uma allowlist de campos "seguros" por tool (o
 * ENTITY_ID_KEYS abaixo e deliberadamente pequeno e generico).
 */

/** Unicas chaves de input cujo VALOR (sempre string/number, nunca objeto) e seguro logar — todos ids opacos, nunca texto livre. */
const ENTITY_ID_KEYS = [
  "clientId",
  "mealPlanId",
  "mealId",
  "itemId",
  "appointmentId",
  "paymentId",
  "requestId",
  "protocolId",
  "taskId",
  "refId",
  "source",
  "portionId",
] as const;

function extractSafeEntityIds(input: unknown): Record<string, string | number> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const entries: [string, string | number][] = [];
  for (const key of ENTITY_ID_KEYS) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") entries.push([key, value]);
  }
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/**
 * Envolve `execute` com log estruturado antes/depois — nunca engole erro
 * (sempre re-lanca), nunca loga `input`/`output` inteiros.
 */
export function withToolCallObservability<TInput, TOutput>(
  toolName: string,
  domain: string,
  execute: (input: TInput) => Promise<TOutput>
): (input: TInput) => Promise<TOutput> {
  return async (input: TInput): Promise<TOutput> => {
    const startedAt = Date.now();
    const entityIds = extractSafeEntityIds(input);
    try {
      const result = await execute(input);
      logger.debug("ai_tool_call", {
        tool: toolName,
        domain,
        success: true,
        durationMs: Date.now() - startedAt,
        ...(entityIds ? { entityIds } : {}),
      });
      return result;
    } catch (error) {
      logger.warn("ai_tool_call", {
        tool: toolName,
        domain,
        success: false,
        durationMs: Date.now() - startedAt,
        ...(entityIds ? { entityIds } : {}),
        error,
      });
      throw error;
    }
  };
}
