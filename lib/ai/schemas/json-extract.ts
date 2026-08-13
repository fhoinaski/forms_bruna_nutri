/**
 * Extrai um objeto JSON de uma resposta de texto de LLM, que pode vir cru,
 * dentro de um code fence markdown (```json ... ```) ou com texto ao redor.
 * Centraliza uma logica que antes estava duplicada em lib/ai/protocol-agent.ts
 * e lib/validators/ai-meal-suggestion.ts.
 */
export function extractJsonFromText(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1];
  const braceMatch = text.match(/(\{[\s\S]*\})/);
  return braceMatch ? braceMatch[1] : text;
}

/**
 * Faz o parse de JSON extraido de texto de LLM sem lancar excecao "crua" —
 * devolve null em caso de falha para o chamador decidir a estrategia de
 * fallback/erro, em vez de deixar um SyntaxError sem contexto propagar.
 */
export function tryParseJsonFromText(text: string): unknown | null {
  try {
    return JSON.parse(extractJsonFromText(text));
  } catch {
    return null;
  }
}

/**
 * Detecta JSON truncado (estrutura não fechada) sem depender da mensagem do
 * `JSON.parse`. Usado para classificar `structured_truncated` e encaminhar
 * para retry em vez de fallback tradicional.
 */
export function isTruncatedJsonText(text: string): boolean {
  const candidate = extractJsonFromText(text);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const ch of candidate) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
  }
  return depth > 0 || inString;
}
