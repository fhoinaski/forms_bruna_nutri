/**
 * Erros tipados do subsistema de IA. Toda rota que chama o gateway/
 * orquestrador pode fazer `instanceof` para decidir o status HTTP certo em
 * vez de inspecionar `error.message` (como `chat/route.ts` fazia antes,
 * checando `message.includes("configurad")`).
 */
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
  constructor(message: string, public readonly issues?: unknown) {
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
