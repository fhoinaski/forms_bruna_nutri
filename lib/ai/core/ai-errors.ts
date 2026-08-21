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

/**
 * Motivo granular do `structured_invalid`, para diagnóstico interno (nunca
 * exposto ao usuário final, que continua vendo uma mensagem simples). Mais
 * fino que `AiFailureCategory` — várias dessas razões mapeiam para a mesma
 * categoria "structured_invalid"/"structured_truncated".
 */
export type StructuredFailureReason =
  | "EMPTY_RESPONSE"
  | "TRUNCATED_RESPONSE"
  | "INVALID_JSON"
  | "SCHEMA_MISMATCH"
  | "EXTRA_FIELDS"
  | "MISSING_REQUIRED_FIELDS"
  | "INVALID_ENUM"
  | "INVALID_NUMBER_TYPE"
  | "UNKNOWN";

/** Razões cujo próximo retry deve levar feedback de validação específico (zod issues), não só "responda em JSON puro". */
export const VALIDATION_FEEDBACK_REASONS: ReadonlySet<StructuredFailureReason> = new Set([
  "SCHEMA_MISMATCH",
  "EXTRA_FIELDS",
  "MISSING_REQUIRED_FIELDS",
  "INVALID_ENUM",
  "INVALID_NUMBER_TYPE",
]);

interface ZodIssueLike {
  path: PropertyKey[];
  code: string;
  expected?: string;
  message?: string;
}

/**
 * Classifica a causa granular de uma falha de structured output, a partir
 * de sinais puramente mecânicos (nunca inspeciona conteúdo clínico — só
 * texto bruto do MODELO e issues do zod). Função pura, testável sem mockar
 * rede.
 */
export function classifyStructuredFailureReason(input: {
  rawText: string;
  parseSucceeded: boolean;
  zodIssues?: ZodIssueLike[];
  truncated: boolean;
}): StructuredFailureReason {
  if (!input.rawText || !input.rawText.trim()) return "EMPTY_RESPONSE";
  if (input.truncated) return "TRUNCATED_RESPONSE";
  if (!input.parseSucceeded) return "INVALID_JSON";
  const issues = input.zodIssues ?? [];
  if (!issues.length) return "UNKNOWN";
  if (issues.some((i) => i.code === "unrecognized_keys")) return "EXTRA_FIELDS";
  if (issues.some((i) => i.code === "invalid_type" && /received undefined/i.test(i.message ?? ""))) return "MISSING_REQUIRED_FIELDS";
  if (issues.some((i) => i.code === "invalid_value" || i.code === "invalid_enum_value")) return "INVALID_ENUM";
  if (issues.some((i) => i.code === "invalid_type" && i.expected === "number")) return "INVALID_NUMBER_TYPE";
  if (issues.some((i) => i.code === "invalid_type")) return "SCHEMA_MISMATCH";
  return "SCHEMA_MISMATCH";
}

/** Prompt de recuperação compacto e ESPECÍFICO, listando só path+code (nunca reenvia contexto clínico). Cap em 8 issues pra não inflar o prompt de novo. */
export function buildValidationFeedbackPrompt(issues: ZodIssueLike[]): string {
  const lines = issues.slice(0, 8).map((issue) => `- ${issue.path.join(".") || "(raiz)"}: ${issue.code}`);
  return `Sua resposta anterior foi JSON válido mas não bateu com o schema exigido. Corrija SOMENTE o formato dos campos abaixo — não mude o conteúdo nutricional nem adicione texto:\n${lines.join("\n")}\n\nResponda de novo com o JSON completo e corrigido, sem markdown, sem explicações.`;
}

export class AiValidationError extends Error {
  constructor(
    message: string,
    public readonly issues?: unknown,
    public readonly failureCategory: AiFailureCategory = "structured_invalid",
    public readonly truncated = false,
    /** Motivo granular (diagnóstico interno). */
    public readonly reason: StructuredFailureReason = "UNKNOWN",
    /** Último payload que passou no JSON.parse mas falhou no zod (se houver) — permite recuperação parcial (seção 12/13) sem nova chamada de rede. */
    public readonly rawData?: unknown
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

