/**
 * Erros tipados do subsistema de IA. Toda rota que chama o gateway/
 * orquestrador pode fazer `instanceof` para decidir o status HTTP certo em
 * vez de inspecionar `error.message` (como `chat/route.ts` fazia antes,
 * checando `message.includes("configurad")`).
 */

/** Categoria de falha de IA — centraliza a decisão retry/rephrase/fallback. */
export type AiFailureCategory =
  | "config"
  | "auth"
  | "rate_limit"
  | "timeout"
  | "provider_unavailable"
  | "structured_invalid"
  | "structured_truncated"
  | "schema_mismatch"
  | "unexpected";

/** Categorias temporárias — podem ser tentadas de novo com backoff curto. */
export const RETRYABLE_FAILURE_CATEGORIES: ReadonlySet<AiFailureCategory> = new Set([
  "rate_limit",
  "timeout",
  "provider_unavailable",
]);

/** Categorias de saída estruturada inválida (recuperáveis via rephrase). */
export const STRUCTURED_FAILURE_CATEGORIES: ReadonlySet<AiFailureCategory> = new Set([
  "structured_invalid",
  "structured_truncated",
  "schema_mismatch",
]);

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

export class AiProviderError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "AiProviderError";
  }
}

export class AiValidationError extends Error {
  constructor(
    message: string,
    public readonly issues?: unknown,
    public readonly failureCategory: AiFailureCategory = "structured_invalid",
    public readonly truncated = false
  ) {
    super(message);
    this.name = "AiValidationError";
  }
}

export class AiPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiPermissionError";
  }
}

export function isAiError(error: unknown): error is AiConfigError | AiProviderError | AiValidationError | AiPermissionError {
  return (
    error instanceof AiConfigError ||
    error instanceof AiProviderError ||
    error instanceof AiValidationError ||
    error instanceof AiPermissionError
  );
}

/** Erro de validação é recuperável (rephrase); provider/config não. */
export function isRecoverableStructuredError(error: unknown): boolean {
  return error instanceof AiValidationError;
}

function classifyProviderError(error: AiProviderError): AiFailureCategory {
  const cause = error.cause as { statusCode?: number; status?: number; message?: string; name?: string } | undefined;
  const status = cause?.statusCode ?? cause?.status;
  const raw = `${error.message} ${cause?.message ?? ""}`.toLowerCase();
  const name = cause?.name ?? error.name;

  if (name === "TimeoutError" || name === "AbortError" || /timed?\s?out|abort/i.test(raw)) return "timeout";
  if (status === 401 || status === 403 || /unauthorized|invalid api key|authentication|forbidden/i.test(raw)) return "auth";
  if (status === 429 || /rate limit|too many requests/i.test(raw)) return "rate_limit";
  if (status === 502 || status === 503 || status === 504 || /service unavailable|overloaded|internal server error/i.test(raw)) return "provider_unavailable";
  return "provider_unavailable";
}

/** Classifica qualquer erro (tipado ou cru) em uma AiFailureCategory. */
export function classifyAiError(error: unknown): AiFailureCategory {
  if (error instanceof AiConfigError) return "config";
  if (error instanceof AiValidationError) return error.failureCategory;
  if (error instanceof AiProviderError) return classifyProviderError(error);
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "timeout";
    const msg = error.message.toLowerCase();
    if (/unexpected end of json|unterminated/i.test(msg)) return "structured_truncated";
    if (/json|parse|type validation|schema/i.test(msg)) return "structured_invalid";
  }
  return "unexpected";
}

